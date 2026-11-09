from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Gap, Snippet, AuditLog
from app.schemas import GapResponse, GapAnswerRequest
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, require_role, require_csrf
)
from app.services.gaps import detect_project_gaps, answer_gap_and_create_evidence

router = APIRouter(prefix="/api/projects/{project_id}/gaps", tags=["gaps"])

@router.get("", response_model=List[GapResponse])
def list_gaps(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    gaps = db.query(Gap).filter(Gap.project_id == ctx.project.id).all()
    return gaps

@router.post("/detect", response_model=List[GapResponse], dependencies=[Depends(require_csrf)])
def run_gap_detection(
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    snippets = db.query(Snippet).filter(Snippet.project_id == ctx.project.id).all()
    snippets_payload = [
        {
            "id": s.id,
            "content": s.content,
            "location": s.location,
            "author": s.author
        }
        for s in snippets
    ]

    detected = detect_project_gaps(snippets_payload)
    new_gaps = []

    for d in detected:
        # Check if already exists to prevent duplicate entries
        exists = (
            db.query(Gap)
            .filter(
                Gap.project_id == ctx.project.id,
                Gap.gap_type == d["gap_type"],
                Gap.title == d["title"]
            )
            .first()
        )
        if not exists:
            gap = Gap(
                project_id=ctx.project.id,
                gap_type=d["gap_type"],
                title=d["title"],
                description=d["description"],
                entity_id=d.get("entity_id")
            )
            db.add(gap)
            new_gaps.append(gap)

    db.commit()
    all_gaps = db.query(Gap).filter(Gap.project_id == ctx.project.id).all()
    return all_gaps

@router.post("/{gap_id}/answer", response_model=GapResponse, dependencies=[Depends(require_csrf)])
def answer_gap(
    gap_id: str,
    payload: GapAnswerRequest,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    gap = db.query(Gap).filter(Gap.id == gap_id, Gap.project_id == ctx.project.id).first()
    if not gap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gap not found"
        )

    answer_gap_and_create_evidence(
        db=db,
        gap=gap,
        user_id=ctx.user.id,
        answer_text=payload.answer
    )

    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="answer_gap",
        resource_type="gap",
        resource_id=gap.id
    )
    db.add(audit)
    db.commit()
    db.refresh(gap)
    return gap

