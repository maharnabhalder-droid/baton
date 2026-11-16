# Baton End-to-End Smoke Test Specification

This document outlines the automated end-to-end smoke test (`backend/tests/test_e2e_smoke.py`) that exercises the entire Baton platform across both `approver` (Departing Lead) and `incoming` (Successor) roles.

---

## 🚀 How to Run the Smoke Test

From the repository root or `backend` folder:
```bash
cd backend
python -m pytest -v tests/test_e2e_smoke.py
```

---

## 📋 Lifecycle Stages Validated

| Step | Phase | Role | Validation Criteria |
| :--- | :--- | :--- | :--- |
| **1** | **Project Setup** | Approver | Creates project; associates incoming engineer with `incoming` membership role. |
| **2** | **Source Ingestion & PII Redaction** | Approver | Uploads source with PII toggle enabled; uploads restricted vault source. Verifies email/phone numbers are replaced with `[REDACTED_EMAIL]` and `[REDACTED_PHONE]`. |
| **3** | **Claim Extraction & Review** | Approver | Executes rule-based pipeline (`/claims/pipeline/run`); approves extracted assertions (`/claims/{id}/review`). |
| **4** | **Knowledge Gap Discovery & Answering** | Approver | Triggers automated gap detection (`/gaps/detect`); answers an open gap to establish evidence tagged as *"stated by departing member"*. |
| **5** | **Zero-Knowledge Redaction Stubs** | Incoming | Queries `/claims?include_stubs=true`. Asserts restricted claims appear as stubs without leaking real claim UUIDs (opaque `stub_ref_...` issued), quotes, locations, or confidential secrets. |
| **6** | **Bus-Factor Radar** | Incoming | Computes 4-axis transparent fragility score. Verifies restricted finance/spend areas are strictly omitted by Row-Level Security for the incoming tier. |
| **7** | **Handover Rehearsal Gate Enforcement** | Incoming | Attempts signoff before completing a passing rehearsal (score >= 70%): correctly rejected with HTTP 400. Client score overrides in payload are ignored in favor of DB records. |
| **8** | **Rehearsal Synthesis & Grading** | Incoming | Generates 5–8 scenario questions citing visible approved claims (`/rehearsal/generate`); submits answers (`/rehearsal/grade`); receives score rubric. |
| **9** | **Receipt Acknowledgement** | Incoming | Successfully submits `/handover/acknowledge` with rehearsal score and completion status recorded on the cryptographically verifiable receipt. |
| **10** | **Access Request Modal & Idempotency** | Incoming | Submits access request with business justification. Confirms submitting twice idempotently updates the reason without creating duplicate rows. |
| **11** | **Approver Inbox Review & Grant** | Approver | Approver views incoming engineer's reason in `/access-requests` inbox and grants access with full audit logging. |

---

## 🛡️ Edge Cases Handled
1. **Cold Start Resilience**: Client requests for AI or heavy endpoints timeout at 90s, with a proactive banner informing users when the backend is waking from a serverless cold start.
2. **Rehearsal Persistence**: Mid-rehearsal progress is automatically cached to `sessionStorage` and restored if the browser is accidentally refreshed.
3. **Double Click & Idempotent Requests**: Duplicate access requests or submissions return the existing active record instead of failing or creating duplicates.
