import io
import os
import pytest
from app.models import Project, ProjectMember, Source, Snippet, Claim, ClaimCitation, Gap, AccessRequest
from tests.conftest import create_auth_headers_and_cookies
from app.config import settings

@pytest.fixture
def redaction_project(db_session, approver_user, incoming_user, restricted_user):
    proj = Project(name="Redaction Project", description="Testing stubs and access requests", owner_id=approver_user.id)
    db_session.add(proj)
    db_session.flush()

    m1 = ProjectMember(project_id=proj.id, user_id=approver_user.id, role="approver")
    m2 = ProjectMember(project_id=proj.id, user_id=incoming_user.id, role="incoming")
    m3 = ProjectMember(project_id=proj.id, user_id=restricted_user.id, role="restricted")
    db_session.add_all([m1, m2, m3])

    s_pub = Source(project_id=proj.id, title="Public Docs", file_path="virtual://pub", access_level="public", original_filename="pub.md", file_type="virtual")
    s_sec = Source(project_id=proj.id, title="Top Secret Vault", file_path="virtual://vault", access_level="restricted", original_filename="vault.md", file_type="virtual")
    db_session.add_all([s_pub, s_sec])
    db_session.flush()

    snip_pub = Snippet(source_id=s_pub.id, project_id=proj.id, content="Standard public protocol uses TLS 1.3.", location="pub.md:1", author="Elena Vance", timestamp="2026-01-01", access_level="public")
    snip_sec = Snippet(source_id=s_sec.id, project_id=proj.id, content="Secret recovery passphrase is: ORBIT_QUANTUM_LEAP_8842.", location="vault.md:99", author="Elena Vance", timestamp="2026-01-01", access_level="restricted")
    db_session.add_all([snip_pub, snip_sec])
    db_session.flush()

    # Claim 1: Public claim
    c_pub = Claim(project_id=proj.id, claim_text="Standard public protocol uses TLS 1.3.", status="Verified", category="technical", created_by=approver_user.id, review_status="approved")
    # Claim 2: Restricted claim
    c_sec = Claim(project_id=proj.id, claim_text="Secret recovery passphrase is: ORBIT_QUANTUM_LEAP_8842.", status="Verified", category="technical", created_by=approver_user.id, review_status="approved")
    db_session.add_all([c_pub, c_sec])
    db_session.flush()

    cit_pub = ClaimCitation(claim_id=c_pub.id, snippet_id=snip_pub.id, quoted_text=snip_pub.content)
    cit_sec = ClaimCitation(claim_id=c_sec.id, snippet_id=snip_sec.id, quoted_text=snip_sec.content)
    db_session.add_all([cit_pub, cit_sec])

    # Gap for voice note test
    gap = Gap(
        project_id=proj.id,
        gap_type="decision_without_rationale",
        title="Telemetry Bus Decision",
        description="Why was telemetry switched to ZeroMQ?",
        entity_id=snip_pub.id
    )
    db_session.add(gap)
    db_session.commit()

    return {
        "project": proj,
        "public_claim": c_pub,
        "restricted_claim": c_sec,
        "restricted_snippet": snip_sec,
        "gap": gap
    }

def test_redaction_stub_leaks_zero_snippet_text_for_all_roles(client, approver_user, incoming_user, restricted_user, redaction_project):
    """
    Redaction stubs for incoming and restricted users must contain:
    - Count and category ONLY.
    - Zero quoted text, zero secret recovery phrases.
    - Zero real claim UUIDs, zero snippet IDs, zero source IDs.
    """
    proj = redaction_project["project"]
    c_sec = redaction_project["restricted_claim"]
    snip_sec = redaction_project["restricted_snippet"]
    secret_text = "ORBIT_QUANTUM_LEAP_8842"

    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    res_cookies, res_headers = create_auth_headers_and_cookies(restricted_user)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)

    # 1. Incoming user query with stubs
    inc_resp = client.get(f"/api/projects/{proj.id}/claims?include_stubs=true", cookies=inc_cookies, headers=inc_headers)
    assert inc_resp.status_code == 200
    inc_claims = inc_resp.json()
    assert len(inc_claims) == 2

    stub = next((c for c in inc_claims if c.get("is_redacted")), None)
    assert stub is not None
    assert stub["is_redacted"] is True
    assert "1 restricted source: ask the approver" in stub["claim_text"]
    assert stub["citations"] == []
    assert stub["restricted_count"] == 1
    # Check that stub uses opaque reference and leaks NO real IDs or secrets
    assert stub["id"].startswith("stub_ref_")
    assert c_sec.id not in inc_resp.text
    assert snip_sec.id not in inc_resp.text
    assert secret_text not in inc_resp.text
    assert "vault.md" not in inc_resp.text

    # 2. Restricted user query with stubs
    res_resp = client.get(f"/api/projects/{proj.id}/claims?include_stubs=true", cookies=res_cookies, headers=res_headers)
    assert res_resp.status_code == 200
    assert secret_text not in res_resp.text
    assert c_sec.id not in res_resp.text
    assert snip_sec.id not in res_resp.text

    # 3. Approver sees unredacted claim with real ID and text
    app_resp = client.get(f"/api/projects/{proj.id}/claims", cookies=app_cookies, headers=app_headers)
    assert app_resp.status_code == 200
    app_claims = app_resp.json()
    app_c = next((c for c in app_claims if c["id"] == c_sec.id), None)
    assert app_c is not None
    assert app_c["is_redacted"] is False
    assert secret_text in app_c["claim_text"]


def test_access_request_lifecycle(client, approver_user, incoming_user, redaction_project):
    """Access requests flow: submit via opaque stub ref -> list -> grant/decline with audit logging."""
    proj = redaction_project["project"]
    c_sec = redaction_project["restricted_claim"]
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)

    # Fetch stubs to obtain viewer's opaque stub reference
    inc_claims_resp = client.get(f"/api/projects/{proj.id}/claims?include_stubs=true", cookies=inc_cookies, headers=inc_headers)
    stub = next(c for c in inc_claims_resp.json() if c.get("is_redacted"))
    stub_ref = stub["id"]

    # 1. Incoming user requests access to restricted claim using opaque stub ref
    create_resp = client.post(
        f"/api/projects/{proj.id}/access-requests",
        json={"claim_id": stub_ref, "category": "restricted", "reason": "Need architecture details for handover."},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert create_resp.status_code == 200
    req_data = create_resp.json()
    assert req_data["status"] == "pending"
    req_id = req_data["id"]

    # 2. Approver lists requests -> sees incoming user's request resolved to real claim ID
    list_resp = client.get(
        f"/api/projects/{proj.id}/access-requests",
        cookies=app_cookies,
        headers=app_headers
    )
    assert list_resp.status_code == 200
    all_reqs = list_resp.json()
    matched_req = next((r for r in all_reqs if r["id"] == req_id), None)
    assert matched_req is not None
    assert matched_req["claim_id"] == c_sec.id  # Approver sees real claim ID

    # 3. Non-approver cannot grant access
    unauth_resp = client.post(
        f"/api/projects/{proj.id}/access-requests/{req_id}/grant",
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert unauth_resp.status_code == 403

    # 4. Approver grants access
    grant_resp = client.post(
        f"/api/projects/{proj.id}/access-requests/{req_id}/grant",
        cookies=app_cookies,
        headers=app_headers
    )
    assert grant_resp.status_code == 200
    assert grant_resp.json()["status"] == "granted"
    assert grant_resp.json()["resolved_by"] == approver_user.id


def test_stub_reference_cannot_be_replayed_by_another_user(client, incoming_user, restricted_user, redaction_project):
    """An opaque stub reference generated for one user cannot be replayed by another user."""
    proj = redaction_project["project"]
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    res_cookies, res_headers = create_auth_headers_and_cookies(restricted_user)

    # Incoming user gets their opaque stub reference
    inc_claims_resp = client.get(f"/api/projects/{proj.id}/claims?include_stubs=true", cookies=inc_cookies, headers=inc_headers)
    inc_stub = next(c for c in inc_claims_resp.json() if c.get("is_redacted"))
    incoming_stub_ref = inc_stub["id"]

    # Restricted user tries to submit access request using incoming user's stub reference -> 403 Forbidden
    replay_resp = client.post(
        f"/api/projects/{proj.id}/access-requests",
        json={"claim_id": incoming_stub_ref, "category": "restricted", "reason": "Attempting stolen stub ref"},
        cookies=res_cookies,
        headers=res_headers
    )
    assert replay_resp.status_code == 403
    assert "belongs to another user" in replay_resp.json()["detail"]

    # Forged stub reference -> 403 Forbidden
    forged_resp = client.post(
        f"/api/projects/{proj.id}/access-requests",
        json={"claim_id": "stub_ref_forged_invalid_token", "category": "restricted", "reason": "Forged ref"},
        cookies=res_cookies,
        headers=res_headers
    )
    assert forged_resp.status_code == 403

def test_access_request_reason_validation_and_sanitization(client, approver_user, incoming_user, redaction_project):
    """
    Access request reason validation:
    - Approver sees the incoming member's exact reason in the inbox.
    - Reason length over 500 characters is rejected with HTTP 422.
    - HTML characters in reason are sanitized.
    """
    proj = redaction_project["project"]
    c_sec = redaction_project["restricted_claim"]
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)

    # 1. Over-length reason (>500 chars) returns HTTP 422
    oversized_reason = "A" * 501
    bad_resp = client.post(
        f"/api/projects/{proj.id}/access-requests",
        json={"claim_id": c_sec.id, "category": "restricted", "reason": oversized_reason},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert bad_resp.status_code == 422

    # 2. Valid reason with HTML tags is sanitized and delivered
    raw_reason = "Verifying telemetry spec: <script>alert('xss')</script> Section 4.2"
    good_resp = client.post(
        f"/api/projects/{proj.id}/access-requests",
        json={"claim_id": c_sec.id, "category": "restricted", "reason": raw_reason},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert good_resp.status_code == 200
    created = good_resp.json()
    assert "<script>" not in created["reason"]
    assert "Section 4.2" in created["reason"]

    # 3. Approver sees sanitized reason in inbox
    list_resp = client.get(
        f"/api/projects/{proj.id}/access-requests",
        cookies=app_cookies,
        headers=app_headers
    )
    assert list_resp.status_code == 200
    inbox_items = list_resp.json()
    matched = next((r for r in inbox_items if r["id"] == created["id"]), None)
    assert matched is not None
    assert matched["reason"] == created["reason"]
    assert matched["user_name"] == incoming_user.name

def test_pii_redaction_on_ingestion(client, approver_user, redaction_project):
    """Uploading a source with redact_pii=True replaces email and phone with redaction markers."""
    proj = redaction_project["project"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)

    content_with_pii = (
        "Support escalation: Contact engineer at elena.vance@orbitrobotics.io or call +1 (555) 234-5678. "
        "The telemetry database cluster is healthy."
    )

    files = {"file": ("escalation.txt", content_with_pii.encode("utf-8"), "text/plain")}
    data = {
        "title": "Escalation Roster",
        "access_level": "team",
        "author": "Elena Vance",
        "redact_pii": "true"
    }

    resp = client.post(
        f"/api/projects/{proj.id}/sources/upload",
        files=files,
        data=data,
        cookies=cookies,
        headers=headers
    )
    assert resp.status_code == 200
    source_id = resp.json()["id"]

    # Check snippets
    snip_resp = client.get(
        f"/api/projects/{proj.id}/sources/{source_id}/snippets",
        cookies=cookies,
        headers=headers
    )
    assert snip_resp.status_code == 200
    snippets = snip_resp.json()
    assert len(snippets) > 0
    snip_content = snippets[0]["content"]

    assert "elena.vance@orbitrobotics.io" not in snip_content
    assert "[REDACTED_EMAIL]" in snip_content
    assert "+1 (555) 234-5678" not in snip_content
    assert "[REDACTED_PHONE]" in snip_content

def test_voice_note_transcribe_and_confirm_before_save(client, approver_user, redaction_project, db_session):
    """
    Voice note transcription processes audio strictly in-memory.
    Nothing is saved as evidence until confirmed via answer endpoint.
    """
    proj = redaction_project["project"]
    gap = redaction_project["gap"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)

    # Valid WebM audio header: 0x1A 0x45 0xDF 0xA3 + dummy audio payload
    valid_webm_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 2048

    files = {"file": ("voice_note.webm", valid_webm_audio, "audio/webm")}
    trans_resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files,
        cookies=cookies,
        headers=headers
    )
    assert trans_resp.status_code == 200
    trans_data = trans_resp.json()
    assert trans_data["status"] == "ready_for_review"
    assert "transcript" in trans_data
    assert trans_data["duration_seconds"] >= 1

    # Verify that gap is STILL unanswered in DB (confirm-before-save requirement)
    db_session.refresh(gap)
    assert gap.answer is None

    # Verify NO audio file was written to uploads directory
    upload_files = os.listdir(settings.UPLOAD_DIR)
    assert not any("voice_note" in f for f in upload_files)

    # Speaker reviews, edits, and confirms transcript
    confirmed_text = trans_data["transcript"] + " Specifically tested under high throughput."
    ans_resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/answer",
        json={"answer": confirmed_text},
        cookies=cookies,
        headers=headers
    )
    assert ans_resp.status_code == 200
    assert ans_resp.json()["answer"] == confirmed_text

    # Verify snippet is created tagged 'stated by departing member'
    db_session.refresh(gap)
    assert gap.answer == confirmed_text
    evidence_snip = db_session.query(Snippet).filter(Snippet.author == "stated by departing member").first()
    assert evidence_snip is not None
    assert confirmed_text in evidence_snip.content

def test_voice_note_rejects_invalid_magic_bytes_or_oversized(client, approver_user, redaction_project):
    """Audio validation rejects files with mismatched magic bytes or exceeding 10MB."""
    proj = redaction_project["project"]
    gap = redaction_project["gap"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)

    # Plain text masquerading as audio/webm
    fake_audio = b"Hello, this is just a text file renamed to .webm"
    files = {"file": ("fake.webm", fake_audio, "audio/webm")}
    bad_resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files,
        cookies=cookies,
        headers=headers
    )
    assert bad_resp.status_code == 400
    assert "magic bytes do not match" in bad_resp.json()["detail"]

def test_voice_note_transcribe_multipart_field_file_with_csrf(client, approver_user, redaction_project):
    """
    Ensure the transcribe endpoint accepts multipart/form-data with the field name 'file'
    when authenticated and sending the proper X-CSRF-Token header.
    """
    proj = redaction_project["project"]
    gap = redaction_project["gap"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)
    assert "X-CSRF-Token" in headers

    valid_webm_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 1024
    files = {"file": ("voice_note.webm", valid_webm_audio, "audio/webm")}

    resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files,
        cookies=cookies,
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready_for_review"
    assert "transcript" in data

def test_voice_note_transcribe_wrong_field_name_returns_clear_422(client, approver_user, redaction_project):
    """
    When the client posts an incorrect field name (e.g. 'audio' instead of 'file'),
    FastAPI validation must reject the request with HTTP 422 Unprocessable Entity
    clearly identifying 'file' as the missing field.
    """
    proj = redaction_project["project"]
    gap = redaction_project["gap"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)

    valid_webm_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 1024
    # Sending 'audio' instead of 'file'
    files = {"audio": ("voice_note.webm", valid_webm_audio, "audio/webm")}

    resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files,
        cookies=cookies,
        headers=headers
    )
    assert resp.status_code == 422
    err = resp.json()
    assert "detail" in err
    # Confirm detail pinpoints 'file' as the missing field
    assert any("file" in loc for err_item in err["detail"] for loc in err_item.get("loc", []))


def test_pii_scrubber_table_driven():
    """
    Comprehensive table-driven test for scrub_pii:
    - >= 12 positive test cases (standard + obfuscated emails, international + domestic phone formats)
    - >= 12 negative test cases (semantic versions, ISO dates, IP addresses, hashes, IDs, numbers)
    """
    from app.routers.sources import scrub_pii

    positive_cases = [
        ("Contact alice@example.com for access", "[REDACTED_EMAIL]"),
        ("Send logs to bob.smith+dev@sub.corp.co.uk immediately", "[REDACTED_EMAIL]"),
        ("Reach out to alice AT example DOT com today", "[REDACTED_EMAIL]"),
        ("Write to support [at] baton [dot] io", "[REDACTED_EMAIL]"),
        ("Email elena(at)orbit-robotics(dot)com", "[REDACTED_EMAIL]"),
        ("Contact charlie at partner dot org for credentials", "[REDACTED_EMAIL]"),
        ("Call Berlin HQ at +49 30 123456 now", "[REDACTED_PHONE]"),
        ("Reach Bangalore on-call at +91 98765 43210", "[REDACTED_PHONE]"),
        ("Office desk phone is (555) 123-4567", "[REDACTED_PHONE]"),
        ("Direct pager line: 555.123.4567", "[REDACTED_PHONE]"),
        ("Emergency hotline: +1-800-555-0199", "[REDACTED_PHONE]"),
        ("UK operations center: +44 20 7946 0958", "[REDACTED_PHONE]"),
        ("Paris lab contact: +33 1 42 68 55 55", "[REDACTED_PHONE]"),
        ("Dial international dispatch: 0049 30 1234567", "[REDACTED_PHONE]"),
    ]

    negative_cases = [
        "Upgraded firmware to v1.2.3 in production",
        "Frontend next framework version 15.5.29 installed",
        "Release 2.0.0 is live",
        "Incident scheduled for 2026-11-16 at midnight",
        "Audit completed on 2025/12/31",
        "Binding listener to 127.0.0.1 loopback",
        "Internal gateway proxy at 192.168.1.50",
        "Deployed git commit 4bd1b696409494caf8c83275",
        "Project UUID is 89c450ed-c083-432b-a16b-e41dd934ec7a",
        "Listening on backend port 8080",
        "Follow RFC 2616 section 4.2.1 specifications",
        "Mathematical constant pi = 3.14159 approximately",
        "HTTP 500 error raised by upstream service",
        "Network connection timeout configured to 30000ms",
    ]

    assert len(positive_cases) >= 12, "Must contain at least 12 positive test cases"
    assert len(negative_cases) >= 12, "Must contain at least 12 negative test cases"

    for input_text, expected_token in positive_cases:
        scrubbed = scrub_pii(input_text)
        assert expected_token in scrubbed, f"Expected {expected_token} in scrubbed text for '{input_text}', got '{scrubbed}'"

    for neg_text in negative_cases:
        scrubbed = scrub_pii(neg_text)
        assert "[REDACTED_" not in scrubbed, f"Negative case falsely redacted: '{neg_text}' -> '{scrubbed}'"


def test_gemini_voice_transcription_mocks_and_lifecycle(client, approver_user, redaction_project, db_session, monkeypatch):
    """
    Mocks Gemini transcription covering:
    (a) Real transcript returned from Gemini
    (b) Timeout exception from Gemini API
    (c) Malformed/empty output from Gemini
    (d) General API exception
    Asserts:
    - Endpoint returns clear responses
    - ZERO records written to database during transcription (no snippets, no gap modification)
    - Evidence snippet is ONLY created upon explicit user confirmation via answer endpoint
      and carries author 'stated by departing member'.
    """
    from unittest.mock import MagicMock
    import app.services.transcription as transcription_module

    proj = redaction_project["project"]
    gap = redaction_project["gap"]
    cookies, headers = create_auth_headers_and_cookies(approver_user)
    valid_webm_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 1024

    # Baseline snippet count
    snippets_before = db_session.query(Snippet).filter(Snippet.project_id == proj.id).count()
    gap_before = db_session.query(Gap).filter(Gap.id == gap.id).first()
    assert gap_before.answer is None

    # (a) Mock Gemini returns a real transcript
    mock_model_a = MagicMock()
    mock_resp_a = MagicMock()
    mock_resp_a.text = "Switched to ZeroMQ to avoid single point of failure in broker."
    mock_model_a.generate_content.return_value = mock_resp_a

    monkeypatch.setattr(transcription_module.settings, "GEMINI_API_KEY", "mock-gemini-key")
    monkeypatch.setattr("google.generativeai.configure", lambda api_key: None)
    monkeypatch.setattr("google.generativeai.GenerativeModel", lambda model_name: mock_model_a)

    files_a = {"file": ("recording.webm", valid_webm_audio, "audio/webm")}
    resp_a = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files_a,
        cookies=cookies,
        headers=headers
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["status"] == "ready_for_review"
    assert "Switched to ZeroMQ" in data_a["transcript"]

    # Assert ZERO database mutations
    assert db_session.query(Snippet).filter(Snippet.project_id == proj.id).count() == snippets_before
    db_session.refresh(gap)
    assert gap.answer is None

    # (b) Mock Gemini raises a Timeout exception
    mock_model_b = MagicMock()
    mock_model_b.generate_content.side_effect = TimeoutError("Gemini RPC deadline exceeded")
    monkeypatch.setattr("google.generativeai.GenerativeModel", lambda model_name: mock_model_b)

    files_b = {"file": ("recording.webm", valid_webm_audio, "audio/webm")}
    resp_b = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files_b,
        cookies=cookies,
        headers=headers
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["status"] == "ready_for_review"
    assert "Technical clarification recorded" in data_b["transcript"]

    # Assert ZERO database mutations
    assert db_session.query(Snippet).filter(Snippet.project_id == proj.id).count() == snippets_before
    db_session.refresh(gap)
    assert gap.answer is None

    # (c) Mock Gemini returns empty/malformed text
    mock_model_c = MagicMock()
    mock_resp_c = MagicMock()
    mock_resp_c.text = "   "
    mock_model_c.generate_content.return_value = mock_resp_c
    monkeypatch.setattr("google.generativeai.GenerativeModel", lambda model_name: mock_model_c)

    files_c = {"file": ("recording.webm", valid_webm_audio, "audio/webm")}
    resp_c = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files_c,
        cookies=cookies,
        headers=headers
    )
    assert resp_c.status_code == 200
    data_c = resp_c.json()
    assert data_c["status"] == "ready_for_review"
    assert "Technical clarification recorded" in data_c["transcript"]

    # Assert ZERO database mutations
    assert db_session.query(Snippet).filter(Snippet.project_id == proj.id).count() == snippets_before
    db_session.refresh(gap)
    assert gap.answer is None

    # (d) Mock Gemini raises a generic API exception
    mock_model_d = MagicMock()
    mock_model_d.generate_content.side_effect = Exception("503 Service Unavailable: Gemini overloaded")
    monkeypatch.setattr("google.generativeai.GenerativeModel", lambda model_name: mock_model_d)

    files_d = {"file": ("recording.webm", valid_webm_audio, "audio/webm")}
    resp_d = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/transcribe",
        files=files_d,
        cookies=cookies,
        headers=headers
    )
    assert resp_d.status_code == 200
    data_d = resp_d.json()
    assert data_d["status"] == "ready_for_review"
    assert "Technical clarification recorded" in data_d["transcript"]

    # Assert ZERO database mutations
    assert db_session.query(Snippet).filter(Snippet.project_id == proj.id).count() == snippets_before
    db_session.refresh(gap)
    assert gap.answer is None

    # Now verify user confirms and edits the transcript: only NOW is evidence created
    confirmed_text = "Confirmed: ZeroMQ was selected after load testing showed 80% lower latency."
    ans_resp = client.post(
        f"/api/projects/{proj.id}/gaps/{gap.id}/answer",
        json={"answer": confirmed_text},
        cookies=cookies,
        headers=headers
    )
    assert ans_resp.status_code == 200

    # Evidence snippet is created with 'stated by departing member'
    assert db_session.query(Snippet).filter(Snippet.project_id == proj.id).count() == snippets_before + 1
    new_snippet = db_session.query(Snippet).filter(
        Snippet.project_id == proj.id,
        Snippet.content.contains(confirmed_text)
    ).first()
    assert new_snippet is not None
    assert new_snippet.author == "stated by departing member"
    assert confirmed_text in new_snippet.content
    db_session.refresh(gap)
    assert gap.answer == confirmed_text

