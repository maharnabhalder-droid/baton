from typing import List
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Source, Snippet, Claim, ClaimCitation, Gap, HandoverAck, RehearsalAttempt, AuditLog
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
    Enforces rehearsal completion if approved claims exist for the project.
    """
    clean_notes = sanitize_text(payload.notes) if payload.notes else ""

    # Check if project has visible approved claims
    approved_claims = (
        db.query(Claim)
        .options(joinedload(Claim.citations).joinedload(ClaimCitation.snippet))
        .filter(Claim.project_id == ctx.project.id, Claim.review_status == "approved")
        .all()
    )
    visible_approved = []
    for c in approved_claims:
        if all(cit.snippet and can_user_view_access_level(ctx.role, cit.snippet.access_level) for cit in c.citations):
            visible_approved.append(c)

    # Verify caller's own RehearsalAttempt server-side
    rehearsal = None
    if payload.rehearsal_attempt_id:
        rehearsal = (
            db.query(RehearsalAttempt)
            .filter(
                RehearsalAttempt.id == payload.rehearsal_attempt_id,
                RehearsalAttempt.project_id == ctx.project.id,
                RehearsalAttempt.user_id == ctx.user.id
            )
            .first()
        )
        if not rehearsal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rehearsal attempt not found or does not belong to you."
            )
    else:
        rehearsal = (
            db.query(RehearsalAttempt)
            .filter(
                RehearsalAttempt.project_id == ctx.project.id,
                RehearsalAttempt.user_id == ctx.user.id
            )
            .order_by(RehearsalAttempt.created_at.desc())
            .first()
        )

    # Gate: If visible approved claims exist and user is incoming role, require a passing rehearsal attempt
    if visible_approved and ctx.role == "incoming":
        if not rehearsal:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Handover Rehearsal required: incoming engineers must complete scenario questions on approved claims before acknowledging receipt."
            )
        if not rehearsal.passed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Handover Rehearsal not passed: incoming engineers must achieve a passing score (>=70%) on scenario questions before acknowledging receipt. Please retake the rehearsal."
            )

    # Security: Ignore any client-supplied score, time_taken_seconds, or missed_topics
    score = rehearsal.score if rehearsal else None
    time_taken = rehearsal.time_taken_seconds if rehearsal else None
    missed_topics_str = rehearsal.weak_topics if (rehearsal and rehearsal.weak_topics) else None

    completed_rehearsal = rehearsal is not None and rehearsal.passed

    if not visible_approved and not completed_rehearsal:
        if not clean_notes:
            clean_notes = "Rehearsal skipped: no approved claims available to test."
        elif "Rehearsal" not in clean_notes:
            clean_notes += " [Rehearsal skipped: no approved claims available]"

    ack = HandoverAck(
        project_id=ctx.project.id,
        user_id=ctx.user.id,
        notes=clean_notes,
        score=score,
        missed_topics=missed_topics_str,
        time_taken_seconds=time_taken,
        completed_rehearsal=completed_rehearsal
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

