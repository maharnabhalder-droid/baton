from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Snippet, Claim, ClaimCitation, Gap, AuditLog
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, can_user_view_access_level
)
from app.services.radar import calculate_bus_factor_radar

router = APIRouter(prefix="/api/projects/{project_id}/radar", tags=["radar"])

@router.get("", response_model=List[Dict[str, Any]])
def get_project_radar(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Returns ranked fragile areas and transparent bus-factor scores.
    Strictly filters all snippets and claims according to the viewer's clearance role.
    """
    # 1. Fetch only visible snippets
    all_snippets = db.query(Snippet).filter(Snippet.project_id == ctx.project.id).all()
    visible_snippets = [
        {
            "id": s.id,
            "content": s.content,
            "location": s.location,
            "author": s.author,
            "access_level": s.access_level
        }
        for s in all_snippets
        if can_user_view_access_level(ctx.role, s.access_level)
    ]

    # 2. Fetch only visible claims
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
            snippet = cit.snippet
            if snippet and not can_user_view_access_level(ctx.role, snippet.access_level):
                can_view = False
                break
        if can_view:
            visible_claims.append({
                "id": c.id,
                "claim_text": c.claim_text,
                "status": c.status,
                "category": c.category
            })

    # 3. Fetch project gaps
    gaps = db.query(Gap).filter(Gap.project_id == ctx.project.id).all()
    gaps_payload = [
        {
            "id": g.id,
            "title": g.title,
            "description": g.description,
            "gap_type": g.gap_type,
            "answer": g.answer
        }
        for g in gaps
    ]

    # 4. Calculate radar
    radar_results = calculate_bus_factor_radar(
        snippets=visible_snippets,
        claims=visible_claims,
        gaps=gaps_payload
    )

    # 5. Audit Log
    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="view_radar",
        resource_type="radar",
        resource_id=ctx.project.id
    )
    db.add(audit)
    db.commit()

    return radar_results
