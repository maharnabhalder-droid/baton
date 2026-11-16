<div align="center">

# 🌌 BATON (Round 3 — "The Finish")
### *Don't let knowledge walk out the door.*

**Evidence-backed technical knowledge transfer that turns departure debt into verifiable truth.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15_App_Router-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL_RLS-00E599?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![Gemini](https://img.shields.io/badge/Google_Gemini-Strict_JSON_Pipeline-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev)
[![Security](https://img.shields.io/badge/Security-Argon2id_%7C_TOTP_MFA_%7C_RLS-amber?style=flat-square&logo=shield)](https://github.com)
[![Tests](https://img.shields.io/badge/Pytest-57%20Passed-emerald?style=flat-square&logo=pytest&logoColor=white)](https://pytest.org)

<p align="center">
  <a href="#-why-baton">Why Baton</a> •
  <a href="#-the-round-3-innovations">Round 3 Innovations</a> •
  <a href="#-the-constellation-philosophy">Constellation Philosophy</a> •
  <a href="#-the-pipeline">Pipeline</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-demo-accounts">Demo Accounts</a> •
  <a href="#-quickstart--tests">Quickstart & Tests</a>
</p>

---

</div>

## 💥 Why Baton?

> *"65% of major software repositories have a truck factor of ≤ 2. When a core lead leaves, only 27% of codebases successfully recover velocity."*  
> — **PeerJ & ACM/IEEE FSE Empirical Studies**

Standard technical handovers fail because they rely on **document dumps**—hasty Notion pages, unverified Google Docs, and forgotten Slack messages. Nobody reads them, and nobody checks if they match reality.

**Baton is different.** It ingests raw sources, extracts atomic claims, discards any claim lacking a **verbatim quote**, detects mutual contradictions, scores architectural fragility via a **Bus-Factor Radar**, rehearses incoming team members via **Scenario-Based Rehearsal**, and interviews the departing engineer via **In-Memory Voice Notes**.

---

## 🚀 Round 3 Innovations ("The Finish")

1. **Handover Rehearsal (Scenario Gate)**:
   - Before acknowledging a project handover, the incoming member answers 5–8 practical operational scenario questions generated strictly from approved claims visible to their role.
   - Dual-mode grading (Gemini with structured rubric + deterministic fallback grading).
   - Weak topics (<70%) automatically populate the Approver's "Not Yet Understood" queue.
   - The cryptographic handover receipt stores the incoming engineer's rehearsal score, missed topics, and completion status.
   - *Zero-claim honesty*: If a project has zero approved claims, the system honestly documents this and allows signoff with a clear note.

2. **Bus-Factor Radar**:
   - Ranked fragility scanner surfacing single-owner bottlenecks (SPOFs), recurring failures (e.g., CI runner races), upcoming deadlines, and uncontacted dependencies.
   - Transparent scoring formula: `Fragility Score = Owner Concentration (30%) + Problem Recurrence (30%) + Time to Deadline (20%) + Unresolved Status (20%)`.
   - Recharts visual dashboard with light/dark theme support and full drill-down to cited evidence snippets.
   - Strict Row-Level Security (RLS) enforcement ensures lower roles never see restricted areas or leak sensitive spend/salary data.

3. **Redaction Stubs & Voice-Note Gap Interview**:
   - **Zero-Leak Redaction Stubs**: Claims citing restricted evidence render as safe stubs (`{N} restricted source(s): ask the approver`) with zero text, quotes, or snippet metadata leaked.
   - **Access Request Lifecycle**: Viewers can request elevated access directly from stub cards; project approvers review and grant/decline inside an inbox.
   - **PII Scrubbing at Ingestion**: Optional toggle to redact emails and telephone numbers from documents upon upload.
   - **In-Memory Voice Notes**: Departing engineers can record voice explanations directly for identified knowledge gaps (`MediaRecorder`). Audios are validated with magic bytes, processed in-memory via Gemini/fallback transcription, and strictly never saved to disk or DB. The engineer reviews and edits the transcript before confirming.

---

## 🌟 The Constellation Philosophy

| Celestial Element | Knowledge Analog | Behavior |
| :--- | :--- | :--- |
| 🟢 **Mint Star** | **Verified Claim** | Backed by exact character-for-character verbatim citations. |
| 🟡 **Amber Star** | **Inferred Claim** | Contextual deduction requiring human review by an approver. |
| 🔴 **Coral Star** | **Conflicting Claim** | Contradicts another source document in the project. |
| ⚪ **Dashed Star** | **Missing Claim** | Critical architectural component absent from all documentation. |
| 🔒 **Redaction Stub** | **Restricted Evidence** | Shows restricted count and category; zero text leaked. |
| ⚡ **Unlit Star** | **Knowledge Gap** | Identified blind spot. **Ignites** when answered by the leaver. |
| 🔗 **Constellation Line** | **Evidence Link** | Direct citation trace connecting a claim to its source snippet. |

---

## 🏗️ Architecture

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons, Recharts 2.15, Framer Motion.
- **Backend**: Python 3.11.9 (standardized across Render deployment and GitHub Actions CI; verified locally on Python 3.14.2 on Windows), FastAPI 0.115+, SQLAlchemy 2.0, Pydantic v2, SlowAPI rate limiting, Pillow 11.1 (QR code MFA generation).
- **Database & Isolation**: PostgreSQL with Row-Level Security (RLS) policies for multi-tenant isolation, automated idempotent migration runner (`python migrate.py`), SQLite for deterministic local development and testing.
- **LLM Pipeline**: Google Gemini with configurable model name (`GEMINI_MODEL`, default: `gemini-2.5-flash`), 15s timeout, strict JSON schemas, and deterministic algorithmic fallbacks for offline uptime.

---

## 👥 Demo Access & Evaluation

### 🚀 Recommended: One-Click Instant Evaluation
Judges and evaluators can test Baton unassisted without managing or typing credentials on both the live deployment and local builds:
1. Navigate to the **Log in** page (`/login`).
2. Under **"Or test immediately without credentials"**, click either:
   - **Demo Approver**: Logs in as the Departing Lead (`approver` role) with full access across Public, Team, and Restricted tiers.
   - **Demo Incoming**: Logs in as the Successor (`incoming` role) with access to Public and Team tiers; restricted claims appear as zero-knowledge redaction stubs with access-request workflows.

---

### 🔑 Local Seeding & Console Credentials (`seed.py`)
In accordance with zero-hardcoded-credential policies, `backend/seed.py` creates accounts with cryptographically random passwords generated at runtime via `secrets.choice`. When running `python seed.py`, the generated credentials are printed **once** to the terminal:

| Account / Role | Email | Password | Role / Access Scope |
| :--- | :--- | :--- | :--- |
| **Approver (Departing Lead)** | `departing.lead@orbitrobotics.io` | *(Random 14-char generated by `seed.py` printed once to console)* | `approver` (Full access to Public, Team, Restricted tiers) |
| **Incoming (Successor)** | `incoming.engineer@orbitrobotics.io` | *(Random 14-char generated by `seed.py` printed once to console)* | `incoming` (Public & Team tiers; Restricted tiers stubbed) |
| **Restricted Viewer** | `contractor.auditor@orbitrobotics.io` | *(Random 14-char generated by `seed.py` printed once to console)* | `restricted` (Public tier only) |

> 💡 **Judge Note on Console Credentials**: If you missed, scrolled past, or cleared the random passwords printed to your terminal during `python seed.py`, you do NOT need to guess or reverse them:
> 1. **Zero-Friction Option**: Click either **Demo Approver** or **Demo Incoming** directly on `/login` or the landing page (`/`). This logs you straight in without typing passwords.
> 2. **Terminal Reset Option**: Delete the local database and re-seed in 3 seconds: `rm backend/baton.db && python backend/seed.py` (or on PowerShell: `Remove-Item backend/baton.db; python backend/seed.py`) to print fresh credentials to your console.
> 3. **Custom Password Option**: Set environment variables before seeding if preferred (e.g. `$env:SEED_APPROVER_PASSWORD="MyCustomPass123!"`).

---

## ⚙️ Environment Variables (Placeholders Only)

### Backend (`backend/.env`)
```bash
DATABASE_URL=sqlite:///./baton.db
# For Neon PostgreSQL:
# DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/batondb?sslmode=require
JWT_SECRET=replace_with_a_secure_random_hex_string_64_chars
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_SECONDS=15
COOKIE_SECURE=false # Set to true in production with HTTPS
```

### Frontend (`frontend/.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🧪 Quickstart & Running Tests

### Backend Setup & Test Suite
```bash
cd backend
python -m venv .venv
# On Windows: .venv\Scripts\activate | On Unix: source .venv/bin/activate
pip install -r requirements.txt
python seed.py

# Run full test suite (57 tests covering all features, RLS, radar, rehearsals, stubs, migrations, PII scrubbing, Gemini voice mocks, and edge cases)
pytest -v
```

### Frontend Setup & Build
```bash
cd frontend
npm install
npm run lint
npx tsc --noEmit
npm run build
```

---

## 🚀 Deployment Checklist (Render, Neon & Vercel)

Before opening the live platform to judges or evaluators, verify the following checklist:

1. **Database Migrations (`backend/migrate.py`)**:
   - For PostgreSQL deployments (e.g. Neon), migrations run automatically via `render.yaml` (`python migrate.py && uvicorn ...`).
   - `migrate.py` acquires a PostgreSQL session-level advisory lock (`SELECT pg_advisory_lock(847291);`) to safely serialize concurrent container startups.
   - To manually run or inspect migrations:
     ```bash
     cd backend
     python migrate.py
     ```
   - Checks `schema_migrations` and applies `001_rls.sql`, `002_fk_and_indexes.sql`, and `003_round3_features.sql` idempotently.
2. **Environment Variables**:
   - `ENVIRONMENT`: Set to `production` on live hosting (`development` locally).
   - `DATABASE_URL`: PostgreSQL connection string with `?sslmode=require` (or SQLite locally).
   - `GEMINI_API_KEY`: Google Gemini API key for structured question generation, claim synthesis, and speech-to-text.
   - `GEMINI_MODEL`: Default `gemini-2.5-flash` (or `gemini-1.5-flash`).
   - `GEMINI_TIMEOUT_SECONDS`: 15s server timeout with deterministic fallback.
   - `COOKIE_SECURE`: Set to `true` on production HTTPS (or leave unset to automatically match `ENVIRONMENT == "production"`).
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`: High-entropy 64-character strings (auto-generated in `render.yaml`).
   - `FRONTEND_URL`: URL of the Next.js frontend (e.g. `https://baton-frontend.vercel.app`).
   - `NEXT_PUBLIC_API_URL`: Backend URL for frontend proxying and server-side fetches.
3. **Verify Row-Level Security (RLS) & Health**:
   - Public health check: `GET /healthz` returns `{"status": "healthy"}` for Render uptime monitors without leaking database internals.
   - Approver RLS verification: Authenticate as an approver and call `GET /api/admin/health`. Verify `"all_enabled": true` under `"rls"` and all 6 sensitive tables (`sources`, `snippets`, `claims`, `claim_history`, `rehearsal_attempts`, `access_requests`) have PostgreSQL RLS active and enforced.
4. **Warm the Backend**:
   - Free or starter hosting instances spin down when idle. Send an initial ping `GET /healthz` to wake the server before demonstration. The frontend automatically shows a visible *"Waking the server..."* banner with retry if cold start exceeds 4 seconds.
5. **Test Voice Note Microphone over HTTPS**:
   - Web browser `navigator.mediaDevices.getUserMedia` requires a secure HTTPS context in production (or `localhost` in development). Ensure your frontend domain is served via HTTPS and grant microphone access when prompted.
6. **End-to-End Smoke Test**:
   - Run the automated lifecycle test: `python -m pytest tests/test_e2e_smoke.py -v`.
