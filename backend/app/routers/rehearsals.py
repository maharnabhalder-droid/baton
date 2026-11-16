import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Claim, ClaimCitation, Snippet, RehearsalAttempt, HandoverAck, User, AuditLog
)
from app.schemas import (
    RehearsalGenerateResponse, RehearsalQuestion, RehearsalSubmitRequest,
    RehearsalResultResponse, QuestionGrade, WeakTopicItem
)
from app.dependencies import (
    get_project_member_context, ProjectMemberContext, can_user_view_access_level,
    require_role, require_csrf
)
from app.services.rehearsal import (
    generate_rehearsal_scenarios, grade_rehearsal_answers
)

router = APIRouter(prefix="/api/projects/{project_id}/handover/rehearsal", tags=["rehearsal"])

def get_visible_approved_claims(ctx: ProjectMemberContext, db: Session) -> List[Claim]:
    """
    CRITICAL SECURITY & INTEGRITY RULE:
    Returns ONLY claims that:
    1. Belong to this project.
    2. Have review_status == 'approved'.
    3. Have ALL cited snippets accessible to ctx.role.
    """
    claims = (
        db.query(Claim)
        .options(
            joinedload(Claim.citations).joinedload(ClaimCitation.snippet)
        )
        .filter(
            Claim.project_id == ctx.project.id,
            Claim.review_status == "approved"
        )
        .all()
    )

    visible_claims = []
    for c in claims:
        can_view = True
        for cit in c.citations:
            snippet = cit.snippet
            if snippet and not can_user_view_access_level(ctx.role, snippet.access_level):
                can_view = False
                break
        if can_view:
            visible_claims.append(c)

    return visible_claims

@router.post("/generate", response_model=RehearsalGenerateResponse, dependencies=[Depends(require_csrf)])
def generate_rehearsal(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Generates 5 to 8 scenario questions from visible approved claims.
    If no approved claims exist, returns honest status allowing the receipt gate to handle gracefully.
    """
    approved_claims = get_visible_approved_claims(ctx, db)

    if not approved_claims:
        return RehearsalGenerateResponse(
            project_id=ctx.project.id,
            attempt_id="none",
            questions=[],
            status="unavailable_no_claims",
            message="No approved claims are visible for this project yet. Approvers must approve claims first."
        )

    claims_payload = [
        {
            "id": c.id,
            "claim_text": c.claim_text,
            "category": c.category,
            "citations": [
                {"quoted_text": cit.quoted_text}
                for cit in c.citations
            ]
        }
        for c in approved_claims
    ]

    questions_data = generate_rehearsal_scenarios(claims_payload)
    attempt_id = str(uuid.uuid4())

    attempt = RehearsalAttempt(
        id=attempt_id,
        project_id=ctx.project.id,
        user_id=ctx.user.id,
        questions=json.dumps(questions_data),
        score=0.0,
        passed=False
    )
    db.add(attempt)
    db.commit()

    rehearsal_questions = [
        RehearsalQuestion(
            id=q["id"],
            scenario=q["scenario"],
            claim_ids=q.get("claim_ids", []),
            category=q.get("category", "technical"),
            guidance=q.get("guidance")
        )
        for q in questions_data
    ]

    return RehearsalGenerateResponse(
        project_id=ctx.project.id,
        attempt_id=attempt_id,
        questions=rehearsal_questions,
        status="ready",
        message=f"Generated {len(rehearsal_questions)} scenario questions based on approved claims."
    )

@router.post("/grade", response_model=RehearsalResultResponse, dependencies=[Depends(require_csrf)])
def grade_rehearsal(
    payload: RehearsalSubmitRequest,
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    """
    Evaluates submitted rehearsal answers against approved claims and citations.
    Weak answers (<70%) are flagged and logged to the approver's queue.
    """
    attempt = (
        db.query(RehearsalAttempt)
        .filter(
            RehearsalAttempt.id == payload.attempt_id,
            RehearsalAttempt.project_id == ctx.project.id
        )
        .first()
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rehearsal attempt not found"
        )

    if attempt.user_id != ctx.user.id and ctx.role != "approver":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot submit answers for another user's rehearsal attempt"
        )

    questions = json.loads(attempt.questions)

    # Fetch reference claims
    approved_claims = get_visible_approved_claims(ctx, db)
    claims_by_id = {
        c.id: {
            "id": c.id,
            "claim_text": c.claim_text,
            "category": c.category,
            "citations": [{"quoted_text": cit.quoted_text} for cit in c.citations]
        }
        for c in approved_claims
    }

    # Idempotent double-submit guard: return stored result without duplicate audit log rows
    if attempt.answers is not None:
        stored_answers = json.loads(attempt.answers)
        stored_weak = json.loads(attempt.weak_topics or "[]")
        _, grades, _ = grade_rehearsal_answers(
            questions=questions,
            submitted_answers=stored_answers,
            claims_by_id=claims_by_id
        )
        grade_items = [
            QuestionGrade(
                question_id=g["question_id"],
                score=g["score"],
                passed=g["passed"],
                feedback=g["feedback"],
                claim_ids=g["claim_ids"],
                topic=g["topic"]
            )
            for g in grades
        ]
        correct_count = sum(1 for g in grades if g["passed"])
        return RehearsalResultResponse(
            attempt_id=attempt.id,
            score=attempt.score,
            passed=attempt.passed,
            total_questions=len(questions),
            correct_count=correct_count,
            weak_topics=stored_weak,
            grades=grade_items,
            time_taken_seconds=attempt.time_taken_seconds
        )

    submitted_dict = {a.question_id: a.answer_text for a in payload.answers}

    score_pct, grades, weak_topics = grade_rehearsal_answers(
        questions=questions,
        submitted_answers=submitted_dict,
        claims_by_id=claims_by_id
    )

    passed = score_pct >= 70.0

    attempt.answers = json.dumps(submitted_dict)
    attempt.score = score_pct
    attempt.weak_topics = json.dumps(weak_topics)
    attempt.time_taken_seconds = payload.time_taken_seconds
    attempt.passed = passed
    db.commit()

    # Log audit event
    audit = AuditLog(
        user_id=ctx.user.id,
        project_id=ctx.project.id,
        action="complete_rehearsal",
        resource_type="rehearsal",
        resource_id=attempt.id
    )
    db.add(audit)
    db.commit()

    grade_items = [
        QuestionGrade(
            question_id=g["question_id"],
            score=g["score"],
            passed=g["passed"],
            feedback=g["feedback"],
            claim_ids=g["claim_ids"],
            topic=g["topic"]
        )
        for g in grades
    ]

    correct_count = sum(1 for g in grades if g["passed"])

    return RehearsalResultResponse(
        attempt_id=attempt.id,
        score=score_pct,
        passed=passed,
        total_questions=len(questions),
        correct_count=correct_count,
        weak_topics=weak_topics,
        grades=grade_items,
        time_taken_seconds=payload.time_taken_seconds
    )

@router.get("/weak-queue", response_model=List[WeakTopicItem])
def get_approver_weak_queue(
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    """
    Approver inbox view: lists all topics that incoming members struggled with
    during rehearsal attempts on this project.
    """
    attempts = (
        db.query(RehearsalAttempt)
        .options(joinedload(RehearsalAttempt.user))
        .filter(
            RehearsalAttempt.project_id == ctx.project.id,
            RehearsalAttempt.weak_topics.isnot(None)
        )
        .order_by(RehearsalAttempt.created_at.desc())
        .all()
    )

    queue = []
    for att in attempts:
        try:
            topics = json.loads(att.weak_topics or "[]")
            questions = json.loads(att.questions or "[]")
            answers = json.loads(att.answers or "{}") if att.answers else {}
        except Exception:
            continue

        q_map = {q["id"]: q for q in questions}
        for top in topics:
            # Find the scenario associated with this topic if possible
            matching_q = next((q for q in questions if top.lower() in q.get("scenario", "").lower() or q.get("category", "") in top.lower()), questions[0] if questions else None)
            scenario_text = matching_q.get("scenario", "Scenario question") if matching_q else "General handover topic"
            claim_ids = matching_q.get("claim_ids", []) if matching_q else []
            qid = matching_q.get("id") if matching_q else ""
            student_ans = answers.get(qid, "")

            queue.append(WeakTopicItem(
                attempt_id=att.id,
                user_id=att.user_id,
                user_name=att.user.name if att.user else "Incoming Engineer",
                topic=top,
                question_scenario=scenario_text,
                claim_ids=claim_ids,
                submitted_answer=student_ans,
                created_at=att.created_at
            ))

    return queue
