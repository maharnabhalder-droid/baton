import json
import pytest
from app.models import Project, ProjectMember, Source, Snippet, Claim, Gap, AccessRequest
from tests.conftest import create_auth_headers_and_cookies

def test_full_lifecycle_e2e_smoke(client, approver_user, incoming_user, db_session):
    """
    End-to-end automated smoke test covering complete Baton handover lifecycle:
    1. Project creation & membership setup.
    2. Source document ingestion with PII scrubbing.
    3. Snippet extraction verification.
    4. Claim extraction & claim review (approving claims).
    5. Knowledge gap detection & departing member answer.
    6. Incoming user login & zero-knowledge redaction stub verification.
    7. Bus-Factor Radar computation (checking 4 components and tier isolation).
    8. Handover gate enforcement: blocked before rehearsal.
    9. Rehearsal exam generation, answering, and evaluation.
    10. Handover signoff & receipt acknowledgement with score.
    11. Access request modal submission with reason & idempotency.
    12. Approver inbox review & grant resolution.
    """
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)

    # 1. Create project
    proj_resp = client.post(
        "/api/projects",
        json={"name": "End-to-End Mission Rover", "description": "Autonomous exploration rover core software"},
        cookies=app_cookies,
        headers=app_headers
    )
    assert proj_resp.status_code == 200
    proj_id = proj_resp.json()["id"]

    # Add incoming user as 'incoming' member
    mem = ProjectMember(project_id=proj_id, user_id=incoming_user.id, role="incoming")
    db_session.add(mem)
    db_session.commit()

    # 2. Ingest Source (Public source with PII)
    source_content = (
        "# Rover Telemetry\n\n"
        "Lead engineer contact: mark.watney@nasa.gov or +1 (555) 867-5309.\n"
        "Telemetry uses ZeroMQ over TCP port 5555. The telemetry frequency is 10Hz.\n"
        "Failure handling: if the runner times out, restart the watchdog daemon."
    )
    source_resp = client.post(
        f"/api/projects/{proj_id}/sources/upload",
        files={"file": ("telemetry.md", source_content.encode("utf-8"), "text/markdown")},
        data={"title": "Telemetry Spec", "access_level": "team", "author": approver_user.name, "redact_pii": "true"},
        cookies=app_cookies,
        headers=app_headers
    )
    assert source_resp.status_code == 200
    source_id = source_resp.json()["id"]

    # Ingest Restricted Source (Approver only)
    restricted_content = "Recovery Key Vault: MASTER_ORBIT_RECOVERY_KEY_9999. Budget limit: $450/hour."
    sec_resp = client.post(
        f"/api/projects/{proj_id}/sources/upload",
        files={"file": ("vault.txt", restricted_content.encode("utf-8"), "text/plain")},
        data={"title": "Vault Config", "access_level": "restricted", "author": approver_user.name},
        cookies=app_cookies,
        headers=app_headers
    )
    assert sec_resp.status_code == 200

    # 3. Verify Snippets & PII Scrubbing
    snips_resp = client.get(
        f"/api/projects/{proj_id}/sources/{source_id}/snippets",
        cookies=app_cookies,
        headers=app_headers
    )
    assert snips_resp.status_code == 200
    snips = snips_resp.json()
    assert len(snips) > 0
    all_text = " ".join(s["content"] for s in snips)
    assert "[REDACTED_EMAIL]" in all_text
    assert "mark.watney@nasa.gov" not in all_text

    # 4. Run Claim Pipeline
    pipe_resp = client.post(
        f"/api/projects/{proj_id}/claims/pipeline/run",
        cookies=app_cookies,
        headers=app_headers
    )
    assert pipe_resp.status_code == 200
    claims_resp = client.get(
        f"/api/projects/{proj_id}/claims",
        cookies=app_cookies,
        headers=app_headers
    )
    assert claims_resp.status_code == 200
    claims = claims_resp.json()
    assert len(claims) > 0

    # Approve all claims
    for c in claims:
        client.post(
            f"/api/projects/{proj_id}/claims/{c['id']}/review",
            json={"action": "approve", "note": "Verified by departing lead"},
            cookies=app_cookies,
            headers=app_headers
        )

    # 5. Gap Detection & Answering
    gap_detect = client.post(
        f"/api/projects/{proj_id}/gaps/detect",
        cookies=app_cookies,
        headers=app_headers
    )
    assert gap_detect.status_code == 200

    gaps_list = client.get(
        f"/api/projects/{proj_id}/gaps",
        cookies=app_cookies,
        headers=app_headers
    ).json()
    if gaps_list:
        gap_id = gaps_list[0]["id"]
        # Approver answers gap
        ans_resp = client.post(
            f"/api/projects/{proj_id}/gaps/{gap_id}/answer",
            json={"answer": "Watchdog timeout is calibrated to 3000ms based on orbital latency."},
            cookies=app_cookies,
            headers=app_headers
        )
        assert ans_resp.status_code == 200

    # 6. Incoming User Login & Redaction Stub Verification
    inc_claims_resp = client.get(
        f"/api/projects/{proj_id}/claims?include_stubs=true",
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert inc_claims_resp.status_code == 200
    inc_claims = inc_claims_resp.json()
    stubs = [c for c in inc_claims if c.get("is_redacted")]
    for stub in stubs:
        assert "restricted source" in stub["claim_text"]
        assert stub["citations"] == []
        assert "MASTER_ORBIT_RECOVERY_KEY_9999" not in json.dumps(stub)

    # 7. Bus-Factor Radar
    radar_resp = client.get(
        f"/api/projects/{proj_id}/radar",
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert radar_resp.status_code == 200
    radar_areas = radar_resp.json()
    assert len(radar_areas) > 0
    # Confirm restricted finance area is not in incoming user's radar
    assert not any("Spend" in a["name"] or "Finance" in a["name"] for a in radar_areas)
    # Check 4-axis transparent breakdown exists
    first_area = radar_areas[0]
    assert "owner_concentration" in first_area["breakdown"]
    assert "recurrence" in first_area["breakdown"]
    assert "time_to_deadline" in first_area["breakdown"]
    assert "unresolved_status" in first_area["breakdown"]

    # 8. Handover Gate Enforcement (Blocked before rehearsal)
    blocked_ack = client.post(
        f"/api/projects/{proj_id}/handover/acknowledge",
        json={"notes": "Signing off early"},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert blocked_ack.status_code == 400
    assert "Handover Rehearsal required" in blocked_ack.json()["detail"]

    # 9. Rehearsal: Generate, Answer, Evaluate
    reh_gen = client.post(
        f"/api/projects/{proj_id}/handover/rehearsal/generate",
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert reh_gen.status_code == 200
    gen_data = reh_gen.json()
    assert gen_data["status"] == "ready"
    attempt_id = gen_data["attempt_id"]
    questions = gen_data["questions"]
    assert len(questions) > 0

    answers = [
        {"question_id": q["id"], "answer_text": "We use ZeroMQ telemetry over TCP port 5555 at 10Hz frequency, and if the runner times out we restart the watchdog daemon."}
        for q in questions
    ]
    reh_grade = client.post(
        f"/api/projects/{proj_id}/handover/rehearsal/grade",
        json={"attempt_id": attempt_id, "answers": answers, "time_taken_seconds": 45},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert reh_grade.status_code == 200
    grade_data = reh_grade.json()
    assert "score" in grade_data
    assert "grades" in grade_data

    # 10. Handover Acknowledged
    ack_resp = client.post(
        f"/api/projects/{proj_id}/handover/acknowledge",
        json={"notes": "All telemetry procedures reviewed and acknowledged."},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert ack_data["completed_rehearsal"] is True
    assert ack_data["score"] is not None

    # 11. Access Request Modal Submission with Idempotency
    if stubs:
        stub_claim_id = stubs[0]["id"]
        # First request
        req1 = client.post(
            f"/api/projects/{proj_id}/access-requests",
            json={"claim_id": stub_claim_id, "category": "restricted", "reason": "Handover rover audit validation"},
            cookies=inc_cookies,
            headers=inc_headers
        )
        assert req1.status_code == 200
        req_id = req1.json()["id"]

        # Duplicate re-request (idempotency check)
        req2 = client.post(
            f"/api/projects/{proj_id}/access-requests",
            json={"claim_id": stub_claim_id, "category": "restricted", "reason": "Handover rover audit validation updated"},
            cookies=inc_cookies,
            headers=inc_headers
        )
        assert req2.status_code == 200
        assert req2.json()["id"] == req_id  # Same pending request returned, never duplicate row!

        # 12. Approver Inbox Review & Grant
        inbox_resp = client.get(
            f"/api/projects/{proj_id}/access-requests",
            cookies=app_cookies,
            headers=app_headers
        )
        assert inbox_resp.status_code == 200
        pending = inbox_resp.json()
        assert any(r["id"] == req_id for r in pending)

        grant_resp = client.post(
            f"/api/projects/{proj_id}/access-requests/{req_id}/grant",
            cookies=app_cookies,
            headers=app_headers
        )
        assert grant_resp.status_code == 200
        assert grant_resp.json()["status"] == "granted"
