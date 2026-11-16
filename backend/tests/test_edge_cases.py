import pytest
import io
from fastapi.testclient import TestClient
from app.models import Project, ProjectMember, Claim, Gap
from tests.conftest import create_auth_headers_and_cookies


def test_edge_case_empty_project_sources_claims_gaps_radar(client: TestClient, db_session, approver_user):
    """Verify empty project behaves gracefully across claims, gaps, handover, and radar without blank screens or 500 errors."""
    project = Project(name="Empty Trajectory Project", description="Completely empty project", owner_id=approver_user.id)
    db_session.add(project)
    db_session.flush()

    db_session.add(ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver"))
    db_session.commit()

    cookies, headers = create_auth_headers_and_cookies(approver_user)

    # 1. Claims listing
    r_claims = client.get(f"/api/projects/{project.id}/claims", headers=headers, cookies=cookies)
    assert r_claims.status_code == 200
    assert r_claims.json() == []

    # 2. Gaps listing
    r_gaps = client.get(f"/api/projects/{project.id}/gaps", headers=headers, cookies=cookies)
    assert r_gaps.status_code == 200
    assert r_gaps.json() == []

    # 3. Radar ranking
    r_radar = client.get(f"/api/projects/{project.id}/radar", headers=headers, cookies=cookies)
    assert r_radar.status_code == 200
    radar_data = r_radar.json()
    assert isinstance(radar_data, list)
    assert radar_data == []

    # 4. Rehearsal generation on empty project
    r_rehearsal = client.post(f"/api/projects/{project.id}/handover/rehearsal/generate", headers=headers, cookies=cookies)
    assert r_rehearsal.status_code == 200
    reh_data = r_rehearsal.json()
    assert reh_data["questions"] == []
    assert "No approved claims" in reh_data["message"]

    # 5. Handover acknowledge on empty project (should allow with clear note)
    r_ack = client.post(
        f"/api/projects/{project.id}/handover/acknowledge",
        json={"notes": "Empty project acknowledged"},
        headers=headers,
        cookies=cookies,
    )
    assert r_ack.status_code == 200
    ack_data = r_ack.json()
    assert ack_data["id"] is not None
    assert ack_data["completed_rehearsal"] is False
    assert "Rehearsal skipped: no approved claims available" in ack_data["notes"]


def test_edge_case_single_source_and_zero_approved_claims(client: TestClient, db_session, incoming_user):
    """Verify single source project with unapproved claims maintains strict filtering and fallback behavior."""
    project = Project(name="Single Source Project", description="Project with 1 source, 0 approved claims", owner_id=incoming_user.id)
    db_session.add(project)
    db_session.flush()

    db_session.add(ProjectMember(project_id=project.id, user_id=incoming_user.id, role="incoming"))
    db_session.commit()

    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    # Ingest 1 source
    r_up = client.post(
        f"/api/projects/{project.id}/sources/upload",
        files={"file": ("single_readme.md", b"# Orbit Alpha Module\nSingle source with notes.", "text/markdown")},
        data={"title": "Single Readme", "access_level": "team", "author": "Incoming Dev", "redact_pii": "false"},
        headers=headers,
        cookies=cookies,
    )
    assert r_up.status_code == 200

    # Add 1 proposed claim (not approved)
    claim = Claim(
        project_id=project.id,
        category="technical",
        claim_text="Orbit Alpha uses direct motor coupling.",
        status="Proposed",
        review_status="pending",
        created_by=incoming_user.id,
    )
    db_session.add(claim)
    db_session.commit()

    # Incoming attempts rehearsal generation
    r_reh = client.post(f"/api/projects/{project.id}/handover/rehearsal/generate", headers=headers, cookies=cookies)
    assert r_reh.status_code == 200
    data = r_reh.json()
    assert data["questions"] == []
    assert "No approved claims" in data["message"]

    # Incoming acknowledges handover with clear honest note
    r_ack = client.post(
        f"/api/projects/{project.id}/handover/acknowledge",
        json={"notes": "Incoming signoff without approved claims"},
        headers=headers,
        cookies=cookies,
    )
    assert r_ack.status_code == 200
    assert r_ack.json()["completed_rehearsal"] is False
    assert "Rehearsal skipped: no approved claims available" in r_ack.json()["notes"]


def test_edge_case_oversized_audio_upload_rejection(client: TestClient, db_session, approver_user):
    """Verify audio upload strictly rejects oversized payloads (> 10MB) with 413 error."""
    project = Project(name="Audio Test Project", owner_id=approver_user.id)
    db_session.add(project)
    db_session.flush()

    db_session.add(ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver"))
    db_session.commit()

    gap = Gap(
        project_id=project.id,
        gap_type="decision_without_rationale",
        title="Why 48V bus?",
        description="Missing explanation for voltage choice",
    )
    db_session.add(gap)
    db_session.commit()

    cookies, headers = create_auth_headers_and_cookies(approver_user)

    # 11 MB fake payload with WebM magic bytes
    oversized_data = b"\x1a\x45\xdf\xa3" + b"0" * (11 * 1024 * 1024)
    r = client.post(
        f"/api/projects/{project.id}/gaps/{gap.id}/transcribe",
        files={"file": ("big_recording.webm", oversized_data, "audio/webm")},
        headers=headers,
        cookies=cookies,
    )
    assert r.status_code == 413
    assert "10MB limit" in r.json()["detail"]


def test_edge_case_expired_demo_session_handling(client: TestClient):
    """Verify expired or tampered session token yields 401 Unauthorized without crashing."""
    expired_headers = {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJub25leGlzdGVudCIsImV4cCI6MTU3NzgzNjgwMCwidG9rZW5fdmVyc2lvbiI6MX0.signature"
    }
    r = client.get("/api/auth/me", headers=expired_headers)
    assert r.status_code == 401
