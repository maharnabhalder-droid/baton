from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AccessRequest, Project, User, AuditLog, Claim, ClaimCitation
from app.schemas import AccessRequestCreate, AccessRequestResponse
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, require_role, require_csrf, can_user_view_access_level
)
from app.security import sanitize_text, generate_stub_ref, resolve_stub_ref

router = APIRouter(prefix="/api/projects/{project_id}/access-requests", tags=["access-requests"])

@router.post("", response_model=AccessRequestResponse, dependencies=[Depends(require_csrf)])
def create_access_request(
    payload: AccessRequestCreate,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Submits a request to access a restricted source or claim.
    """
    if payload.reason and len(payload.reason.strip()) > 500:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Access request reason must not exceed 500 characters."
        )

    clean_reason = sanitize_text(payload.reason.strip())[:500] if payload.reason else ""

    # Resolve opaque stub reference or direct claim ID
    resolved_claim_id = None
    if payload.claim_id:
        if payload.claim_id.startswith("stub_ref_"):
            resolved_claim_id = resolve_stub_ref(payload.claim_id, ctx.user.id, ctx.project.id)
        else:
            claim_match = db.query(Claim).filter(Claim.id == payload.claim_id, Claim.project_id == ctx.project.id).first()
            if not claim_match:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found in project.")
            resolved_claim_id = claim_match.id

    # Prevent duplicate pending rows if user re-requests while pending
    existing_pending = (
        db.query(AccessRequest)
        .filter(
            AccessRequest.project_id == ctx.project.id,
            AccessRequest.user_id == ctx.user.id,
            AccessRequest.claim_id == resolved_claim_id,
            AccessRequest.status == "pending"
        )
        .first()
    )
    if existing_pending:
        if clean_reason:
            existing_pending.reason = clean_reason
            db.commit()
            db.refresh(existing_pending)
        resp = AccessRequestResponse.model_validate(existing_pending)
        resp.user_name = ctx.user.name
        resp.user_email = ctx.user.email
        if ctx.role != "approver" and existing_pending.claim_id:
            resp.claim_id = generate_stub_ref(existing_pending.claim_id, ctx.user.id, ctx.project.id)
        return resp

    req = AccessRequest(
        project_id=ctx.project.id,
        user_id=ctx.user.id,
        claim_id=resolved_claim_id,
        category=payload.category,
        reason=clean_reason,
        status="pending"
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="create_access_request",
        resource_type="access_request",
        resource_id=req.id
    )
    db.add(audit)
    db.commit()

    resp = AccessRequestResponse.model_validate(req)
    resp.user_name = ctx.user.name
    resp.user_email = ctx.user.email
    if ctx.role != "approver" and req.claim_id:
        resp.claim_id = generate_stub_ref(req.claim_id, ctx.user.id, ctx.project.id)
    return resp

@router.get("", response_model=List[AccessRequestResponse])
def list_access_requests(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Lists access requests for the project.
    Approvers see all requests; lower roles see only their own requests with opaque stub references.
    """
    query = (
        db.query(AccessRequest)
        .options(joinedload(AccessRequest.user))
        .filter(AccessRequest.project_id == ctx.project.id)
    )

    if ctx.role != "approver":
        query = query.filter(AccessRequest.user_id == ctx.user.id)

    requests = query.order_by(AccessRequest.created_at.desc()).all()

    results = []
    for r in requests:
        item = AccessRequestResponse.model_validate(r)
        if r.user:
            item.user_name = r.user.name
            item.user_email = r.user.email
        # Obfuscate claim_id for lower roles
        if ctx.role != "approver" and r.claim_id:
            item.claim_id = generate_stub_ref(r.claim_id, ctx.user.id, ctx.project.id)
        results.append(item)

    return results

@router.post("/{request_id}/grant", response_model=AccessRequestResponse, dependencies=[Depends(require_csrf)])
def grant_access_request(
    request_id: str,
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    """
    Approver grants an access request.
    """
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id, AccessRequest.project_id == ctx.project.id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )

    req.status = "granted"
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = ctx.user.id
    db.commit()
    db.refresh(req)

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="grant_access_request",
        resource_type="access_request",
        resource_id=req.id
    )
    db.add(audit)
    db.commit()

    resp = AccessRequestResponse.model_validate(req)
    if req.user:
        resp.user_name = req.user.name
        resp.user_email = req.user.email
    return resp

@router.post("/{request_id}/decline", response_model=AccessRequestResponse, dependencies=[Depends(require_csrf)])
def decline_access_request(
    request_id: str,
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    """
    Approver declines an access request.
    """
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id, AccessRequest.project_id == ctx.project.id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )

    req.status = "declined"
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = ctx.user.id
    db.commit()
    db.refresh(req)

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="decline_access_request",
        resource_type="access_request",
        resource_id=req.id
    )
    db.add(audit)
    db.commit()

    resp = AccessRequestResponse.model_validate(req)
    if req.user:
        resp.user_name = req.user.name
        resp.user_email = req.user.email
    return resp
