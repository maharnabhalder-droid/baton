from typing import List
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Source, Snippet, Claim, ClaimCitation, Gap, HandoverAck, AuditLog
)
from app.schemas import (
    HandoverAckRequest, HandoverAckResponse, HandoverSummaryResponse
)
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, can_user_view_access_level,
    require_csrf
)
from app.security import sanitize_text

router = APIRouter(prefix="/api/projects/{project_id}/handover", tags=["handover"])

@router.get("/summary", response_model=HandoverSummaryResponse)
def get_handover_summary(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    sources = db.query(Source).filter(Source.project_id == ctx.project.id).all()
    visible_sources = [s for s in sources if can_user_view_access_level(ctx.role, s.access_level)]

    snippets = db.query(Snippet).filter(Snippet.project_id == ctx.project.id).all()
    visible_snippets = [s for s in snippets if can_user_view_access_level(ctx.role, s.access_level)]

    all_claims = (
        db.query(Claim)
        .options(joinedload(Claim.citations).joinedload(ClaimCitation.snippet))
        .filter(Claim.project_id == ctx.project.id)
        .all()
    )

    visible_claims = []
    for c in all_claims:
        can_view = True
        for cit in c.citations:
            if cit.snippet and not can_user_view_access_level(ctx.role, cit.snippet.access_level):
                can_view = False
                break
        if can_view:
            visible_claims.append(c)

    status_counts = Counter(c.status for c in visible_claims)

    gaps = db.query(Gap).filter(Gap.project_id == ctx.project.id).all()
    pending_gaps = sum(1 for g in gaps if not g.answer)
    resolved_gaps = sum(1 for g in gaps if g.answer)

    acks = (
        db.query(HandoverAck)
        .filter(HandoverAck.project_id == ctx.project.id)
        .order_by(HandoverAck.acknowledged_at.desc())
        .all()
    )

    return HandoverSummaryResponse(
        project_id=ctx.project.id,
        total_sources=len(visible_sources),
        total_snippets=len(visible_snippets),
        total_claims=len(visible_claims),
        claims_by_status=dict(status_counts),
        pending_gaps=pending_gaps,
        resolved_gaps=resolved_gaps,
        acknowledgements=[HandoverAckResponse.model_validate(a) for a in acks]
    )

@router.post("/acknowledge", response_model=HandoverAckResponse, dependencies=[Depends(require_csrf)])
def acknowledge_handover(
    payload: HandoverAckRequest,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Receipt acknowledgement by the incoming user (or approver).
    """
    clean_notes = sanitize_text(payload.notes)
    ack = HandoverAck(
        project_id=ctx.project.id,
        user_id=ctx.user.id,
        notes=clean_notes
    )
    db.add(ack)

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="acknowledge_handover",
        resource_type="handover",
        resource_id=ctx.project.id
    )
    db.add(audit)
    db.commit()
    db.refresh(ack)
    return ack

