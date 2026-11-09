import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Claim, ClaimCitation, ClaimHistory, Snippet, AuditLog
from app.schemas import (
    ClaimResponse, ClaimEditRequest, ClaimReviewAction, CitationResponse, SnippetResponse
)
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, require_role,
    can_user_view_access_level, require_csrf
)
from app.security import sanitize_text
from app.services.pipeline import run_claim_pipeline

router = APIRouter(prefix="/api/projects/{project_id}/claims", tags=["claims"])

@router.get("", response_model=List[ClaimResponse])
def list_claims(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    CRITICAL RULE:
    A claim is visible only if the viewer may see ALL of its evidence snippets.
    If any cited snippet is restricted or inaccessible to ctx.role, the entire claim is hidden.
    """
    all_claims = (
        db.query(Claim)
        .options(
            joinedload(Claim.citations).joinedload(ClaimCitation.snippet),
            joinedload(Claim.history)
        )
        .filter(Claim.project_id == ctx.project.id)
        .all()
    )

    visible_claims = []
    for c in all_claims:
        can_view_claim = True
        # Check every cited snippet's access level
        for cit in c.citations:
            snippet = cit.snippet
            if snippet:
                if not can_user_view_access_level(ctx.role, snippet.access_level):
                    can_view_claim = False
                    break
        
        if can_view_claim:
            visible_claims.append(c)

    # Audit log access
    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="view_claims",
        resource_type="claim",
        resource_id=ctx.project.id
    )
    db.add(audit)
    db.commit()

    return visible_claims

@router.post("/pipeline/run", response_model=List[ClaimResponse], dependencies=[Depends(require_csrf)])
def run_pipeline(
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    """
    Runs snippet splitting, Gemini extraction, strict citation verification,
    and conflict detection pass.
    """
    snippets = db.query(Snippet).filter(Snippet.project_id == ctx.project.id).all()
    if not snippets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No snippets found in project. Upload sources first."
        )

    snippets_payload = [
        {
            "id": s.id,
            "content": s.content,
            "location": s.location,
            "author": s.author,
            "timestamp": s.timestamp,
            "access_level": s.access_level
        }
        for s in snippets
    ]

    pipeline_results = run_claim_pipeline(snippets_payload)
    created_claims = []

    for item in pipeline_results:
        claim = Claim(
            project_id=ctx.project.id,
            claim_text=sanitize_text(item["claim_text"]),
            status=item.get("status", "Verified"),
            category=item.get("category", "technical"),
            confidence=float(item.get("confidence", 1.0)),
            created_by=ctx.user.id,
            review_status="pending"
        )
        db.add(claim)
        db.flush()

        # Add citations
        for cit in item.get("citations", []):
            citation = ClaimCitation(
                claim_id=claim.id,
                snippet_id=cit["snippet_id"],
                quoted_text=cit["quoted_text"]
            )
            db.add(citation)

        # Initial history
        history = ClaimHistory(
            claim_id=claim.id,
            user_id=ctx.user.id,
            action="create",
            previous_state=None,
            new_state=json.dumps({
                "claim_text": claim.claim_text,
                "status": claim.status,
                "category": claim.category
            })
        )
        db.add(history)
        created_claims.append(claim)

    db.commit()

    # Re-query with eager loads
    claim_ids = [c.id for c in created_claims]
    loaded_claims = (
        db.query(Claim)
        .options(
            joinedload(Claim.citations).joinedload(ClaimCitation.snippet),
            joinedload(Claim.history)
        )
        .filter(Claim.id.in_(claim_ids))
        .all()
    )
    return loaded_claims

@router.put("/{claim_id}", response_model=ClaimResponse, dependencies=[Depends(require_csrf)])
def edit_claim(
    claim_id: str,
    payload: ClaimEditRequest,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    claim = (
        db.query(Claim)
        .options(
            joinedload(Claim.citations).joinedload(ClaimCitation.snippet),
            joinedload(Claim.history)
        )
        .filter(Claim.id == claim_id, Claim.project_id == ctx.project.id)
        .first()
    )
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim not found"
        )

    # Permission check: viewer cannot edit claims if evidence is inaccessible
    for cit in claim.citations:
        if cit.snippet and not can_user_view_access_level(ctx.role, cit.snippet.access_level):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: this claim contains evidence inaccessible to your role"
            )

    prev_state = {
        "claim_text": claim.claim_text,
        "status": claim.status,
        "category": claim.category
    }

    if payload.claim_text is not None:
        claim.claim_text = sanitize_text(payload.claim_text)
    if payload.status is not None:
        claim.status = payload.status
    if payload.category is not None:
        claim.category = sanitize_text(payload.category)

    new_state = {
        "claim_text": claim.claim_text,
        "status": claim.status,
        "category": claim.category
    }

    history = ClaimHistory(
        claim_id=claim.id,
        user_id=ctx.user.id,
        action="edit",
        previous_state=json.dumps(prev_state),
        new_state=json.dumps(new_state)
    )
    db.add(history)
    db.commit()
    db.refresh(claim)
    return claim

@router.post("/{claim_id}/review", response_model=ClaimResponse, dependencies=[Depends(require_csrf)])
def review_claim(
    claim_id: str,
    payload: ClaimReviewAction,
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    claim = (
        db.query(Claim)
        .options(
            joinedload(Claim.citations).joinedload(ClaimCitation.snippet),
            joinedload(Claim.history)
        )
        .filter(Claim.id == claim_id, Claim.project_id == ctx.project.id)
        .first()
    )
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim not found"
        )

    prev_status = claim.review_status
    claim.review_status = "approved" if payload.action == "approve" else "rejected"

    history = ClaimHistory(
        claim_id=claim.id,
        user_id=ctx.user.id,
        action=payload.action,
        previous_state=json.dumps({"review_status": prev_status}),
        new_state=json.dumps({"review_status": claim.review_status, "note": sanitize_text(payload.note)})
    )
    db.add(history)
    db.commit()
    db.refresh(claim)
    return claim

