# Testing Notes & Reliability Verification

## Test Suite Summary
- **Total Tests**: **57 tests** (all passing in under 7 seconds, 1 skipped cleanly when PostgreSQL is not configured).
  - Round 2 Baseline Tests: 22 tests (`tests/test_auth.py`, `tests/test_gaps.py`, `tests/test_permissions_and_bola.py`).
  - Handover Rehearsal Tests: 10 tests (`tests/test_rehearsal.py` - includes server-side score enforcement, failed rehearsal rejection gate, cross-user attempt isolation, and idempotent grading).
  - Bus-Factor Radar Tests: 3 tests (`tests/test_radar.py` - includes ranking of recurring failures and RLS exclusion of restricted items).
  - Redaction Stubs & Voice Notes Tests: 11 tests (`tests/test_redaction_and_voice.py` - includes HMAC stub references, replay attack rejection across users, table-driven PII scrubbing, and Gemini voice transcription mocks).
  - Hardening & Edge Case Tests: 4 tests (`tests/test_edge_cases.py` - includes oversized files, corrupt magic bytes, empty projects, and expired session handling).
  - Database Migrations & RLS Tests: 6 tests (`tests/test_migrations.py` - includes sanitized public `/healthz`, approver-only `/api/admin/health`, DDL AST syntax conformance, and live PostgreSQL integration test).
  - End-to-End Lifecycle Smoke Test: 1 test (`tests/test_e2e_smoke.py`).
- **Test Command**: `python -m pytest -q -x -p no:cacheprovider` (executed from `backend/`).

### Live PostgreSQL Migration & Idempotence Testing
To run the live PostgreSQL migration test against a real PostgreSQL instance:
```bash
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/baton_test"
pytest tests/test_migrations.py -k test_postgres_live_migration_integration_and_idempotence -v
```
When `TEST_DATABASE_URL` is omitted or empty, the test skips cleanly with `pytest.skip()`.

---

## Role Permission Matrix

| Capability | Approver (`approver@orbitrobotics.com`) | Incoming (`incoming@orbitrobotics.com`) | Restricted (`restricted@orbitrobotics.com`) |
| :--- | :---: | :---: | :---: |
| **Ingest Sources (Public/Team)** | ✅ Allowed | ✅ Allowed | ❌ Read-Only |
| **Ingest Sources (Restricted Tier)** | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **View Restricted Claim Details** | ✅ Allowed (Full Text & Snippets) | 🔒 Redaction Stub (`1 restricted source`) | 🔒 Redaction Stub (`1 restricted source`) |
| **Request Access to Restricted Claims** | N/A (Has Access) | ✅ Can Request | ✅ Can Request |
| **Approve / Decline Access Requests** | ✅ Allowed (Approver Inbox) | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Scan / Trigger Knowledge Gap Scanner** | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Answer Gaps via Voice or Text** | ✅ Allowed | ✅ Allowed (as leaver) | ❌ 403 Forbidden |
| **View Radar Technical Fragilities** | ✅ Full Visibility | ✅ Full Visibility | ✅ Public Items Only |
| **View Radar Restricted Spend/Salaries**| ✅ Full Visibility | ❌ Stripped by RLS | ❌ Stripped by RLS |
| **Generate & Take Rehearsal Exam** | ✅ Allowed | ✅ Allowed | ❌ 403 Forbidden |
| **View Rehearsal "Not Yet Understood"** | ✅ Allowed | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Sign Off Handover Receipt** | ✅ Allowed | ✅ Allowed (Gated on Rehearsal) | ❌ 403 Forbidden |

---

## User Journeys Covered

### Journey 1: The Incoming Onboarding & Verification Gate
1. Incoming engineer Marcus signs in with `incoming@orbitrobotics.com`.
2. Inspects project claims and encounters a Redaction Stub on a confidential credential claim; Marcus clicks `"Request Access"`.
3. Navigates to `/projects/{id}/radar` to evaluate project technical fragilities (identifying the CI runner race condition).
4. Navigates to `/projects/{id}/handover` to take the Rehearsal Exam.
5. Marcus answers practical questions, receives detailed scoring feedback, and unlocks the cryptographic Handover Acknowledgement.
6. Acknowledges handover; a tamper-evident receipt is issued and stored with Marcus's score and missed topics.

### Journey 2: The Departing Engineer Knowledge Capture
1. Elena navigates to `/projects/{id}/gaps`.
2. Selects an unlit knowledge gap (e.g. Telemetry Bus Rationale).
3. Records a voice note directly in the browser.
4. Gemini transcribes the audio in-memory; Elena edits the transcription in the browser to fix technical terms.
5. Elena confirms and saves the answer, igniting the gap into a verified star and generating an evidence snippet tagged `"stated by departing member"`.

### Journey 3: The Approver Review & Governance
1. Elena reviews pending access requests in the Claims inbox and grants Marcus's request.
2. Elena navigates to the Handover page and inspects the `"Not Yet Understood (Approver Queue)"` to examine answers where Marcus had weak comprehension.

---

## Failure Cases & Hardening Mitigations

| Failure Scenario | Mitigation & Behavior | Verified By Test |
| :--- | :--- | :--- |
| **Empty Project / Zero Claims** | APIs return empty lists; Rehearsal generation returns 200 with an honest `"No approved claims available"` message; Handover allows signoff with receipt note `"Rehearsal skipped: no approved claims available"`. | `test_edge_case_empty_project_sources_claims_gaps_radar` |
| **Single Source / 0 Approved Claims** | Ingestion works cleanly; unapproved proposed claims are strictly excluded from rehearsal; incoming signoff succeeds with honest unvetted receipt notes. | `test_edge_case_single_source_and_zero_approved_claims` |
| **Gemini API Downtime / Timeout** | All Gemini interactions enforce a 15-second timeout (`GEMINI_TIMEOUT_SECONDS`) and immediately fall back to deterministic rule-based graders and question synthesizers. | `test_deterministic_rehearsal_grading_is_repeatable` |
| **Corrupt Audio / Fake WebM** | Magic byte validator inspects the first 16 bytes for valid file headers (`EBML`, `RIFF`, `ftyp`, `OggS`, `ID3`). Files failing validation return 400 with a detailed error. | `test_voice_note_rejects_invalid_magic_bytes_or_oversized` |
| **Oversized Audio (> 10MB)** | Enforces strict content-length and byte-size checks before any transcription; rejects with 413 Content Too Large. | `test_edge_case_oversized_audio_upload_rejection` |
| **Expired / Tampered JWT Session** | Validates `exp` and `token_version`; expired or revoked tokens immediately yield 401 Unauthorized without 500 crashes. | `test_edge_case_expired_demo_session_handling` |
| **Restricted Data Leak in Radar/Stubs** | Raw response payloads are asserted character-for-character to ensure zero leak of salary, cost, or secret file names. | `test_redaction_stub_leaks_zero_snippet_text_for_all_roles`, `test_radar_restricted_items_never_appear_for_lower_roles` |
