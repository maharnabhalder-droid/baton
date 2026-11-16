import json
import pytest
from app.models import Project, ProjectMember, Source, Snippet, Claim, ClaimCitation, RehearsalAttempt, HandoverAck
from tests.conftest import create_auth_headers_and_cookies

@pytest.fixture
def rehearsal_project(db_session, approver_user, incoming_user):
    proj = Project(name="Rehearsal Test Project", description="Testing handover rehearsal", owner_id=approver_user.id)
    db_session.add(proj)
    db_session.flush()

    m_app = ProjectMember(project_id=proj.id, user_id=approver_user.id, role="approver")
    m_inc = ProjectMember(project_id=proj.id, user_id=incoming_user.id, role="incoming")
    db_session.add_all([m_app, m_inc])

    # Sources
    s_pub = Source(project_id=proj.id, title="Public Specs", file_path="virtual://pub", access_level="team", original_filename="pub.md", file_type="virtual")
    s_res = Source(project_id=proj.id, title="Secret Keys", file_path="virtual://sec", access_level="restricted", original_filename="sec.md", file_type="virtual")
    db_session.add_all([s_pub, s_res])
    db_session.flush()

    # Snippets
    snip_pub = Snippet(source_id=s_pub.id, project_id=proj.id, content="The telemetry pipeline buffers metrics in Redis before flushing to PostgreSQL.", location="spec.md:12", author="Departing Lead", timestamp="2026-01-01", access_level="team")
    snip_res = Snippet(source_id=s_res.id, project_id=proj.id, content="Master encryption key is stored in AWS KMS under alias/handover-master.", location="secret.md:1", author="Departing Lead", timestamp="2026-01-01", access_level="restricted")
    db_session.add_all([snip_pub, snip_res])
    db_session.flush()

    # Claim 1: Approved + visible to team (public)
    c1 = Claim(
        project_id=proj.id,
        claim_text="The telemetry pipeline buffers metrics in Redis before flushing to PostgreSQL.",
        status="Verified",
        category="technical",
        created_by=approver_user.id,
        review_status="approved"
    )
    # Claim 2: Pending review (NOT approved yet)
    c2 = Claim(
        project_id=proj.id,
        claim_text="Backup snapshots are saved nightly at 02:00 UTC.",
        status="Inferred",
        category="operational",
        created_by=approver_user.id,
        review_status="pending"
    )
    # Claim 3: Approved BUT restricted evidence (hidden from incoming)
    c3 = Claim(
        project_id=proj.id,
        claim_text="Master encryption key is stored in AWS KMS under alias/handover-master.",
        status="Verified",
        category="technical",
        created_by=approver_user.id,
        review_status="approved"
    )
    db_session.add_all([c1, c2, c3])
    db_session.flush()

    cit1 = ClaimCitation(claim_id=c1.id, snippet_id=snip_pub.id, quoted_text=snip_pub.content)
    cit2 = ClaimCitation(claim_id=c2.id, snippet_id=snip_pub.id, quoted_text=snip_pub.content)
    cit3 = ClaimCitation(claim_id=c3.id, snippet_id=snip_res.id, quoted_text=snip_res.content)
    db_session.add_all([cit1, cit2, cit3])
    db_session.commit()

    return {
        "project": proj,
        "visible_approved_claim": c1,
        "pending_claim": c2,
        "restricted_claim": c3
    }

def test_rehearsal_scenarios_only_cite_visible_approved_claims(client, incoming_user, rehearsal_project):
    """Rehearsal questions must never cite unapproved or restricted claims."""
    proj = rehearsal_project["project"]
    c1 = rehearsal_project["visible_approved_claim"]
    c2 = rehearsal_project["pending_claim"]
    c3 = rehearsal_project["restricted_claim"]

    cookies, headers = create_auth_headers_and_cookies(incoming_user)
    resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert len(data["questions"]) >= 5

    # Every question must reference only c1, never c2 or c3
    for q in data["questions"]:
        assert c1.id in q["claim_ids"]
        assert c2.id not in q["claim_ids"]
        assert c3.id not in q["claim_ids"]
        # Ensure scenario text doesn't leak restricted text
        assert "AWS KMS" not in q["scenario"]

def test_deterministic_rehearsal_grading_is_repeatable(client, incoming_user, rehearsal_project):
    """Fallback grading must be deterministic and repeatable on identical input."""
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    # Submit thoughtful answer
    answers = [
        {"question_id": q["id"], "answer_text": "We buffer telemetry metrics in Redis to handle traffic spikes before persistent writes to PostgreSQL."}
        for q in questions
    ]

    grade_resp1 = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 90},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp1.status_code == 200
    data1 = grade_resp1.json()

    # Re-grade identical attempt -> must yield identical score and grade status
    grade_resp2 = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 90},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp2.status_code == 200
    data2 = grade_resp2.json()

    assert data1["score"] == data2["score"]
    assert data1["passed"] == data2["passed"]
    assert data1["weak_topics"] == data2["weak_topics"]

def test_rehearsal_weak_answers_populate_approver_queue(client, incoming_user, approver_user, rehearsal_project):
    """Weak answers (<70%) must populate the approver's 'not yet understood' queue."""
    proj = rehearsal_project["project"]
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)

    # 1. Incoming generates rehearsal
    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=inc_cookies,
        headers=inc_headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    # 2. Incoming submits weak/blank answers
    weak_answers = [
        {"question_id": q["id"], "answer_text": "I don't know."}
        for q in questions
    ]
    grade_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": weak_answers, "time_taken_seconds": 45},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert grade_resp.status_code == 200
    grade_data = grade_resp.json()
    assert grade_data["passed"] is False
    assert len(grade_data["weak_topics"]) > 0

    # 3. Approver checks queue -> finds weak topics
    queue_resp = client.get(
        f"/api/projects/{proj.id}/handover/rehearsal/weak-queue",
        cookies=app_cookies,
        headers=app_headers
    )
    assert queue_resp.status_code == 200
    queue = queue_resp.json()
    assert len(queue) > 0
    assert any(item["user_id"] == incoming_user.id for item in queue)

    # Incoming role cannot view approver weak queue
    inc_queue_resp = client.get(
        f"/api/projects/{proj.id}/handover/rehearsal/weak-queue",
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert inc_queue_resp.status_code == 403

def test_handover_receipt_stores_rehearsal_fields(client, incoming_user, rehearsal_project):
    """Receipt stores score, missed topics, time taken, and completed_rehearsal flag."""
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    # Complete rehearsal
    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    answers = [
        {"question_id": q["id"], "answer_text": "We buffer telemetry metrics in Redis to handle traffic spikes before persistent writes to PostgreSQL."}
        for q in questions
    ]
    grade_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 120},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp.status_code == 200
    assert grade_resp.json()["passed"] is True

    # Acknowledge handover
    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={"notes": "Thoroughly tested and ready for production handover."},
        cookies=cookies,
        headers=headers
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert ack_data["score"] is not None
    assert ack_data["time_taken_seconds"] == 120
    assert ack_data["completed_rehearsal"] is True

def test_acknowledge_gate_handles_empty_claims_honestly(client, incoming_user, db_session):
    """When a project has zero approved claims, acknowledgement succeeds with clear explanation."""
    proj = Project(name="Zero Claims Project", description="Empty project", owner_id=incoming_user.id)
    db_session.add(proj)
    db_session.flush()
    mem = ProjectMember(project_id=proj.id, user_id=incoming_user.id, role="incoming")
    db_session.add(mem)
    db_session.commit()

    cookies, headers = create_auth_headers_and_cookies(incoming_user)
    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={"notes": ""},
        cookies=cookies,
        headers=headers
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert "Rehearsal skipped: no approved claims available" in ack_data["notes"]
    assert ack_data["completed_rehearsal"] is False

def test_acknowledge_gate_blocks_incoming_without_rehearsal_when_approved_claims_exist(client, incoming_user, rehearsal_project):
    """When approved claims exist, incoming member cannot bypass rehearsal."""
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={"notes": "Attempting to skip rehearsal"},
        cookies=cookies,
        headers=headers
    )
    assert ack_resp.status_code == 400
    assert "Handover Rehearsal required" in ack_resp.json()["detail"]


def test_acknowledge_gate_rejects_failed_rehearsal(client, incoming_user, rehearsal_project):
    """When rehearsal score is below passing threshold (<70%), incoming member cannot acknowledge receipt."""
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    # 1. Generate rehearsal
    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    # 2. Submit deliberately failing answer
    answers = [
        {"question_id": q["id"], "answer_text": "no idea"}
        for q in questions
    ]
    grade_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 15},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp.status_code == 200
    assert grade_resp.json()["passed"] is False

    # 3. Attempt acknowledge with failed attempt -> must return 400
    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={"notes": "Trying to acknowledge with failed rehearsal", "rehearsal_attempt_id": attempt_id},
        cookies=cookies,
        headers=headers
    )
    assert ack_resp.status_code == 400
    assert "Handover Rehearsal not passed" in ack_resp.json()["detail"]


def test_forged_score_or_time_in_acknowledge_body_is_ignored(client, incoming_user, rehearsal_project):
    """Server-side receipt strictly derives score and time from the verified attempt, ignoring client forgery."""
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    answers = [
        {"question_id": q["id"], "answer_text": "We buffer telemetry metrics in Redis to handle traffic spikes before persistent writes to PostgreSQL."}
        for q in questions
    ]
    grade_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 88},
        cookies=cookies,
        headers=headers
    )
    real_score = grade_resp.json()["score"]

    # Try forging score=100.0 and time_taken=1 in body
    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={
            "notes": "Attempting score spoofing",
            "score": 100.0,
            "time_taken_seconds": 1,
            "rehearsal_attempt_id": attempt_id
        },
        cookies=cookies,
        headers=headers
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert ack_data["score"] == real_score
    assert ack_data["score"] != 100.0 if real_score < 100.0 else True
    assert ack_data["time_taken_seconds"] == 88


def test_acknowledge_rejects_another_users_attempt_id(client, incoming_user, approver_user, rehearsal_project):
    """Cannot acknowledge using another user's rehearsal attempt ID."""
    proj = rehearsal_project["project"]
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)

    # Approver creates and completes an attempt
    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=app_cookies,
        headers=app_headers
    )
    app_attempt_id = gen_resp.json()["attempt_id"]

    # Incoming attempts to use approver's attempt ID
    ack_resp = client.post(
        f"/api/projects/{proj.id}/handover/acknowledge",
        json={"notes": "Stealing approver attempt", "rehearsal_attempt_id": app_attempt_id},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert ack_resp.status_code == 404
    assert "not belong to you" in ack_resp.json()["detail"]


def test_rehearsal_grade_double_submit_is_idempotent(client, incoming_user, rehearsal_project, db_session):
    """Submitting answers for an already graded attempt is idempotent and creates no duplicate audit logs."""
    from app.models import AuditLog
    proj = rehearsal_project["project"]
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    gen_resp = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/generate",
        cookies=cookies,
        headers=headers
    )
    attempt_id = gen_resp.json()["attempt_id"]
    questions = gen_resp.json()["questions"]

    answers = [
        {"question_id": q["id"], "answer_text": "We buffer telemetry metrics in Redis to handle traffic spikes before persistent writes to PostgreSQL."}
        for q in questions
    ]

    # First grade
    grade_resp1 = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 60},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp1.status_code == 200
    res1 = grade_resp1.json()

    audit_count_before = db_session.query(AuditLog).filter(
        AuditLog.action == "complete_rehearsal",
        AuditLog.resource_id == attempt_id
    ).count()
    assert audit_count_before == 1

    # Double submit same attempt
    grade_resp2 = client.post(
        f"/api/projects/{proj.id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 60},
        cookies=cookies,
        headers=headers
    )
    assert grade_resp2.status_code == 200
    res2 = grade_resp2.json()

    assert res1["score"] == res2["score"]
    assert res1["passed"] == res2["passed"]

    audit_count_after = db_session.query(AuditLog).filter(
        AuditLog.action == "complete_rehearsal",
        AuditLog.resource_id == attempt_id
    ).count()
    assert audit_count_after == 1  # No duplicate audit log row

