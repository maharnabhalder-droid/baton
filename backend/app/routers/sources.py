import os
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Source, Snippet, AuditLog
from app.schemas import SourceResponse, SnippetResponse
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, can_user_view_access_level, require_csrf
)
from app.security import (
    limiter, validate_uploaded_file, sanitize_text
)
from app.services.parser import parse_source_file
from app.config import settings

_EMAIL_PATTERN = re.compile(
    r'\b[a-zA-Z0-9_.+-]+(?:\s*@\s*|\s+(?:at|AT)\s+|\s*\[(?:at|AT)\]\s*|\s*\((?:at|AT)\)\s*)(?:[a-zA-Z0-9-]+\s*(?:\.|\s+(?:dot|DOT)\s+|\s*\[(?:dot|DOT)\]\s*|\s*\((?:dot|DOT)\)\s*)\s*)+[a-zA-Z]{2,}\b',
    re.IGNORECASE
)

_PHONE_PATTERN = re.compile(
    r'(?<![\w@])(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?)?(?:\d{2,5}[\s.-]?){2,5}\d{2,5}(?![\w])'
)

def scrub_pii(text: str) -> str:
    """
    Robust PII scrubber for standard and obfuscated emails and international phone numbers.
    Safely preserves software version strings (v1.2.3), dates (YYYY-MM-DD), IP addresses, and IDs.
    """
    if not text:
        return ""

    # 1. Scrub standard and obfuscated emails
    text = _EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)

    # 2. Scrub domestic and international phone numbers with context checks
    def _phone_repl(m):
        val = m.group(0).strip()
        # Protect ISO dates: YYYY-MM-DD or YYYY/MM/DD
        if re.match(r'^(?:19|20)\d{2}[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])$', val):
            return val
        # Protect IP addresses
        if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', val):
            return val
        # Protect semantic version numbers like 1.2.3 or 15.5.29
        if re.match(r'^\d{1,2}\.\d{1,2}(?:\.\d{1,3})?$', val):
            return val
        # Protect floats like 3.14159
        if re.match(r'^\d+\.\d+$', val):
            return val
        digits = re.sub(r'\D', '', val)
        if len(digits) < 7 or len(digits) > 15:
            return val
        return "[REDACTED_PHONE]"

    text = _PHONE_PATTERN.sub(_phone_repl, text)
    return text

router = APIRouter(prefix="/api/projects/{project_id}/sources", tags=["sources"])

@router.get("", response_model=List[SourceResponse])
def list_sources(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    all_sources = db.query(Source).filter(Source.project_id == ctx.project.id).all()
    # Filter by user's role-based access level
    visible_sources = [
        s for s in all_sources
        if can_user_view_access_level(ctx.role, s.access_level)
    ]

    results = []
    for s in visible_sources:
        count = db.query(Snippet).filter(Snippet.source_id == s.id).count()
        resp = SourceResponse.model_validate(s)
        resp.snippets_count = count
        results.append(resp)

    # Audit log access
    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="view_sources",
        resource_type="source",
        resource_id=ctx.project.id
    )
    db.add(audit)
    db.commit()

    return results

@router.post("/upload", response_model=SourceResponse, dependencies=[Depends(require_csrf)])
@limiter.limit("10/minute")
def upload_source(
    request: Request,
    project_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
    access_level: str = Form("team"),
    author: str = Form("Departing Member"),
    redact_pii: bool = Form(False),
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    if access_level not in ("public", "team", "restricted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid access level. Must be public, team, or restricted"
        )

    # Only approver can upload restricted sources
    if access_level == "restricted" and ctx.role != "approver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approvers can designate sources as restricted"
        )

    file_bytes = file.file.read()
    original_filename = sanitize_text(file.filename or "upload.txt")
    safe_filename = validate_uploaded_file(original_filename, file_bytes)

    # Store outside web root
    dest_path = os.path.join(settings.UPLOAD_DIR, safe_filename)
    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    clean_title = sanitize_text(title)
    clean_author = sanitize_text(author)
    ext = os.path.splitext(original_filename)[1].lower()

    source = Source(
        project_id=ctx.project.id,
        title=clean_title,
        file_path=dest_path,
        access_level=access_level,
        author=clean_author,
        original_filename=original_filename,
        file_type=ext.replace(".", ""),
        size_bytes=len(file_bytes),
        redact_pii=redact_pii
    )
    db.add(source)
    db.flush()

    # Split into snippets immediately
    parsed_snippets = parse_source_file(dest_path, ext, author=clean_author)
    for ps in parsed_snippets:
        raw_content = ps["content"]
        if redact_pii:
            raw_content = scrub_pii(raw_content)

        snippet = Snippet(
            source_id=source.id,
            project_id=ctx.project.id,
            content=raw_content,
            location=ps["location"],
            author=ps["author"],
            timestamp=ps["timestamp"],
            access_level=access_level
        )
        db.add(snippet)

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="upload_source",
        resource_type="source",
        resource_id=source.id
    )
    db.add(audit)
    db.commit()
    db.refresh(source)

    resp = SourceResponse.model_validate(source)
    resp.snippets_count = len(parsed_snippets)
    return resp

@router.get("/{source_id}/snippets", response_model=List[SnippetResponse])
def get_source_snippets(
    source_id: str,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    source = db.query(Source).filter(Source.id == source_id, Source.project_id == ctx.project.id).first()
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found"
        )

    # Permission check
    if not can_user_view_access_level(ctx.role, source.access_level):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: your role cannot view snippets from this source"
        )

    snippets = db.query(Snippet).filter(Snippet.source_id == source.id).all()
    return snippets

