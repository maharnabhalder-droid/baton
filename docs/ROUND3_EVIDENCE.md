# Round 3 Evidence & Proving Tests

This document presents the detailed architectural breakdown, location of code, role-based walkthroughs, and proving test suite for each of the three major improvements introduced in Round 3 ("The Finish").

---

## 1. Handover Rehearsal (Scenario Gate)

### What Was Built
Before an incoming team member can complete a project handover, they must take a scenario-based rehearsal exam. The questions are synthesized exclusively from **approved claims** that are visible under the incoming member's access tier.

- **Dual-Mode Grader**: Evaluations use Gemini with a structured rubric (`score`, `passed`, `feedback`, `weak_topics`). If Gemini times out (15s) or encounters an error, a deterministic keyword-overlap and length-calibrated fallback grader executes immediately.
- **Approver Weak Queue**: Any answers scoring under 70% are automatically registered in the Approver's "Not Yet Understood" queue (`/api/projects/{id}/handover/rehearsal/weak-queue`).
- **Cryptographic Receipt Integration**: The handover acknowledgement endpoint records the user's score, missed topics list, time taken, and `completed_rehearsal` status on the receipt.
- **Zero-Claim Honesty**: If a project contains zero approved claims (or none visible to the user), the system does not trap the user in an impossible state. Instead, it informs the user and records `completed_rehearsal: false` with the receipt note: `"Rehearsal skipped: no approved claims available"`.

### Code Locations
- **Backend Service**: [`backend/app/services/rehearsal.py`](file:///d:/Baton/backend/app/services/rehearsal.py)
- **API Router**: [`backend/app/routers/rehearsals.py`](file:///d:/Baton/backend/app/routers/rehearsals.py)
- **Gate Enforcement**: [`backend/app/routers/handovers.py`](file:///d:/Baton/backend/app/routers/handovers.py#L32-L75)
- **Frontend Wizard**: [`frontend/src/app/projects/[id]/handover/page.tsx`](file:///d:/Baton/frontend/src/app/projects/[id]/handover/page.tsx)
- **Database Model & Migration**: [`backend/app/models.py`](file:///d:/Baton/backend/app/models.py) (`RehearsalAttempt`), [`backend/migrations/003_round3_features.sql`](file:///d:/Baton/backend/migrations/003_round3_features.sql)

### Demo Steps (Both Roles)
1. **Incoming Member (`incoming@orbitrobotics.com`)**:
   - Navigate to `/projects/{id}/handover`.
   - The "Acknowledge Knowledge Receipt" button is locked with a warning badge: `"Complete Rehearsal to Unlock"`.
   - Click `"Generate Rehearsal Exam"`. Answering 5–8 practical operational questions tagged with cited claims.
   - Enter answers and click `"Submit Rehearsal for Evaluation"`.
   - View your score breakdown, passed/weak status, and feedback.
   - Once completed, the Acknowledge button unlocks.
2. **Approver Member (`approver@orbitrobotics.com`)**:
   - Navigate to `/projects/{id}/handover`.
   - Scroll down to the `"Not Yet Understood (Approver Queue)"` panel.
   - Inspect incoming members' weak answers, missed topics, and attempt timestamps to guide follow-up training sessions.

### Proving Tests
- `tests/test_rehearsal.py::test_rehearsal_scenarios_only_cite_visible_approved_claims` (Verifies no question cites restricted or unapproved claims).
- `tests/test_rehearsal.py::test_deterministic_rehearsal_grading_is_repeatable` (Verifies grading repeatability).
- `tests/test_rehearsal.py::test_rehearsal_weak_answers_populate_approver_queue` (Verifies queue population and 403 enforcement for non-approvers).
- `tests/test_rehearsal.py::test_handover_receipt_stores_rehearsal_fields` (Verifies receipt persistence).
- `tests/test_rehearsal.py::test_acknowledge_gate_handles_empty_claims_honestly` (Verifies zero-claims honesty).
- `tests/test_rehearsal.py::test_acknowledge_gate_blocks_incoming_without_rehearsal_when_approved_claims_exist` (Verifies gate locking).
- `tests/test_rehearsal.py::test_acknowledge_gate_rejects_failed_rehearsal` (Verifies a failed attempt scoring < 70% cannot acknowledge).
- `tests/test_rehearsal.py::test_forged_score_or_time_in_acknowledge_body_is_ignored` (Verifies client overrides are ignored in favor of DB attempt record).
- `tests/test_rehearsal.py::test_acknowledge_rejects_another_users_attempt_id` (Verifies attempt ID cross-user theft is rejected).
- `tests/test_rehearsal.py::test_rehearsal_grade_double_submit_is_idempotent` (Verifies double submission returns existing grade without duplicate audit entries).

---

## 2. Bus-Factor Radar

### What Was Built
A ranked architectural and team fragility scanner that synthesizes multiple risk factors into a transparent numerical score:
$$\text{Fragility Score} = 0.30 \times \text{Owner Concentration} + 0.30 \times \text{Problem Recurrence} + 0.20 \times \text{Time to Deadline} + 0.20 \times \text{Unresolved Status}$$

- **Orbit Robotics Benchmark Traps**:
  - *Recurring Build Failure*: Flaky race condition in CI runner packet simulation ranks Critical.
  - *Approaching Deadline*: Flight Readiness Review (FRR-Q4) with unresolved integration dependencies.
  - *Unowned Dependency*: Datadog synthetic monitoring pipeline with no registered operational contact.
- **Strict Role-Based Evidence Scoping**: Lower roles (Incoming, Restricted) cannot see restricted areas (such as Contractor Rates or Executive Compensation) and cannot view cited evidence snippets above their tier.
- **Interactive Recharts Visualization**: Bar charts and risk badges with dark/light mode compatibility and instant snippet drill-downs.

### Code Locations
- **Backend Service**: [`backend/app/services/radar.py`](file:///d:/Baton/backend/app/services/radar.py)
- **API Router**: [`backend/app/routers/radar.py`](file:///d:/Baton/backend/app/routers/radar.py)
- **Frontend Dashboard**: [`frontend/src/app/projects/[id]/radar/page.tsx`](file:///d:/Baton/frontend/src/app/projects/[id]/radar/page.tsx)
- **Navigation Link**: [`frontend/src/components/navbar.tsx`](file:///d:/Baton/frontend/src/components/navbar.tsx)
- **Synthetic Seed Data**: [`backend/seed.py`](file:///d:/Baton/backend/seed.py)

### Demo Steps (Both Roles)
1. **Approver Member (`approver@orbitrobotics.com`)**:
   - Click "Bus-Factor Radar" in the navigation bar.
   - Inspect the ranked list: the CI runner race condition ranks at the top with Elevated/Critical severity.
   - Hover over score bars to see the transparent 4-component breakdown.
   - Click "View 1 Source" to open the evidence drawer and inspect the verbatim snippet.
   - Note the presence of the restricted Finance/Contractor area.
2. **Incoming Member (`incoming@orbitrobotics.com`)**:
   - Navigate to the Radar page.
   - Observe the top technical risks (CI runner, Flight Readiness).
   - Notice that the restricted Finance/Contractor area is completely omitted by RLS; no contractor rates or dollar amounts exist anywhere in the payload.

### Proving Tests
- `tests/test_radar.py::test_radar_recurring_build_failure_ranks_high` (Proves the CI trap ranks at the top with severity Elevated/Critical).
- `tests/test_radar.py::test_radar_restricted_items_never_appear_for_lower_roles` (Proves zero information leak of restricted items for incoming/restricted roles).
- `tests/test_radar.py::test_radar_transparent_score_breakdown` (Proves all 4 components sum correctly and conform to the formula).

---

## 3. Redaction Stubs & Voice-Note Gap Interview

### What Was Built
1. **Zero-Leak Redaction Stubs**:
   - When a claim cites evidence at an access tier higher than the current viewer, the database and API suppress all snippet text, quotes, location indices, and source IDs.
   - Instead, the claim renders with `is_redacted: true`, `claim_text: "{N} restricted source(s): ask the approver"`, and `citations: []`.
   - Viewers can click `"Request Access"` directly on the stub card.
2. **Access Request Lifecycle**:
   - Database table `access_requests` stores requests with status `pending`, `granted`, or `declined`.
   - Approvers view an inbox on the Claims page to approve or decline access requests with full history logging.
3. **Ingestion PII Redaction**:
   - Source uploads support `redact_pii: bool`. When enabled, emails and telephone numbers are scrubbed with markers (`[REDACTED_EMAIL]`, `[REDACTED_PHONE]`) before snippet chunking.
4. **In-Memory Voice Notes**:
   - The Gap Interview allows departing members to record audio directly via the browser `MediaRecorder` API.
   - Audio is validated for magic bytes (`audio/webm`, `audio/wav`, `audio/mp4`, `audio/ogg`, `audio/mpeg`) and enforced to a 10MB limit.
   - Audio bytes are processed **strictly in memory** via Gemini/fallback transcription. **Zero audio files are stored on disk or in the database.**
   - The transcript is returned to an editable textarea. The departing member must review and click `"Confirm & Save"` to record the statement into the evidence graph tagged: `"stated by departing member"`.

### Code Locations
- **Redaction Stubs in Claims API**: [`backend/app/routers/claims.py`](file:///d:/Baton/backend/app/routers/claims.py)
- **PII Scrubbing on Ingestion**: [`backend/app/routers/sources.py`](file:///d:/Baton/backend/app/routers/sources.py)
- **Access Requests Router & Table**: [`backend/app/routers/access_requests.py`](file:///d:/Baton/backend/app/routers/access_requests.py), [`backend/migrations/003_round3_features.sql`](file:///d:/Baton/backend/migrations/003_round3_features.sql)
- **In-Memory Audio Transcription**: [`backend/app/services/transcription.py`](file:///d:/Baton/backend/app/services/transcription.py), [`backend/app/routers/gaps.py`](file:///d:/Baton/backend/app/routers/gaps.py#L112-L145)
- **Frontend Claim Cards & Stubs**: [`frontend/src/components/claim-card.tsx`](file:///d:/Baton/frontend/src/components/claim-card.tsx), [`frontend/src/app/projects/[id]/claims/page.tsx`](file:///d:/Baton/frontend/src/app/projects/[id]/claims/page.tsx)
- **Frontend Voice Recorder & Confirm Step**: [`frontend/src/components/gap-card.tsx`](file:///d:/Baton/frontend/src/components/gap-card.tsx)

### Demo Steps (Both Roles)
1. **Incoming Member (`incoming@orbitrobotics.com`)**:
   - Navigate to `/projects/{id}/claims`.
   - Observe the restricted claim displayed as a Redaction Stub: `"1 restricted source: ask the approver"`. Note that no text or author is visible.
   - Click `"Request Access"`. The button transitions to `"Access Requested"`.
2. **Approver Member (`approver@orbitrobotics.com`)**:
   - Navigate to `/projects/{id}/claims`.
   - The `"Restricted Access Requests"` inbox at the top shows the pending request from Marcus.
   - Click `"Grant Access"`. The request updates to granted.
3. **Voice Note Answering**:
   - Navigate to `/projects/{id}/gaps`.
   - Click `"Answer as Departing Member"` on any unlit gap.
   - Click `"Record Voice Note"`. Speak or simulate speaking for a few seconds, then click `"Stop"`.
   - Preview the audio, then click `"Transcribe with Gemini"`.
   - Observe the transcribed text populating the editable field. Edit the text as needed.
   - Click `"Confirm & Save (Ignite Star)"`. The gap is ignited and recorded into the graph tagged `"stated by departing member"`.

### Proving Tests
- `tests/test_redaction_and_voice.py::test_redaction_stub_leaks_zero_snippet_text_for_all_roles` (Proves zero snippet leak for all roles).
- `tests/test_redaction_and_voice.py::test_stub_reference_cannot_be_replayed_by_another_user` (Proves opaque stub references cannot be stolen or replayed across accounts).
- `tests/test_redaction_and_voice.py::test_access_request_lifecycle` (Proves request, grant, and decline flow).
- `tests/test_redaction_and_voice.py::test_access_request_reason_validation_and_sanitization` (Proves reason length validation, XSS sanitization, and approver inbox delivery).
- `tests/test_redaction_and_voice.py::test_pii_redaction_on_ingestion` (Proves email and phone scrubbing at upload).
- `tests/test_redaction_and_voice.py::test_pii_scrubber_table_driven` (Proves 14 positive and 14 negative cases including international phones and obfuscated emails).
- `tests/test_redaction_and_voice.py::test_gemini_voice_transcription_mocks_and_lifecycle` (Proves real transcript, timeout, malformed, and API exceptions; zero DB writes until confirmed).
- `tests/test_redaction_and_voice.py::test_voice_note_transcribe_and_confirm_before_save` (Proves in-memory processing, zero audio files on disk, and confirm-before-save behavior).
- `tests/test_redaction_and_voice.py::test_voice_note_rejects_invalid_magic_bytes_or_oversized` (Proves audio security and 10MB limit).
- `tests/test_redaction_and_voice.py::test_voice_note_transcribe_multipart_field_file_with_csrf` (Proves multipart field 'file' with CSRF header succeeds).
- `tests/test_redaction_and_voice.py::test_voice_note_transcribe_wrong_field_name_returns_clear_422` (Proves wrong field name returns 422).

---

## 4. Automated Database Migrations & Verification
- **Automated Migration Runner**: [`backend/migrate.py`](file:///d:/Baton/backend/migrate.py) applies all `backend/migrations/*.sql` scripts deterministically, tracks applied state in `schema_migrations`, is safe to run repeatedly, and skips on SQLite.
- **Concurrency & Advisory Locks**: Serializes concurrent container startups using PostgreSQL `pg_advisory_lock(847291)`.
- **Wired in Render**: Configured in `render.yaml` startCommand.
- **Proving Tests**:
  - `tests/test_migrations.py::test_migration_runner_skips_on_sqlite`
  - `tests/test_migrations.py::test_migration_runner_idempotence`
  - `tests/test_migrations.py::test_check_rls_status_structure`
  - `tests/test_migrations.py::test_healthz_endpoint_sanitized_for_public`
  - `tests/test_migrations.py::test_admin_health_endpoint_restricted_to_approvers`
  - `tests/test_migrations.py::test_migration_sql_ast_and_syntax_conformance`
  - `tests/test_migrations.py::test_postgres_live_migration_integration_and_idempotence`

---

## 5. End-to-End Lifecycle Smoke Test
- **Full Flow Automated Test**: [`backend/tests/test_e2e_smoke.py`](file:///d:/Baton/backend/tests/test_e2e_smoke.py)
- **Specification**: [`docs/SMOKE_TEST.md`](file:///d:/Baton/docs/SMOKE_TEST.md)
- Proves ingest -> PII scrub -> claim pipeline -> claim approval -> gap detection & leaver answer -> redaction stubs -> Bus-Factor radar -> rehearsal gate lock -> exam synthesis & grading -> handover receipt acknowledgement -> access request modal -> approver grant in a single continuous automated test.
