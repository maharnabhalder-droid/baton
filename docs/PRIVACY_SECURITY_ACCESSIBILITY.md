# Privacy, Security & Accessibility Architecture

## 1. Privacy Controls & Data Boundary

Baton is designed on the principle of **evidence-backed truth with strict multi-tenant boundaries**:

- **Row-Level Security (RLS)**:
  - In PostgreSQL, every table (`projects`, `project_members`, `sources`, `snippets`, `claims`, `claim_citations`, `gaps`, `handover_acks`, `access_requests`, `rehearsal_attempts`) is protected by RLS policies scoped to `app.current_user_id` and project membership.
  - Multi-tenant leaks are prevented at the database kernel level; an outsider cannot access project records even if an endpoint lacks an explicit application check.
- **In-Memory Audio Processing**:
  - Voice recordings for knowledge gaps are transcribed in RAM.
  - The raw audio buffer is never persisted to disk (`uploads/` directory) and never stored in the database.
  - Audio blobs are destroyed immediately after transcription completes.
- **Ingestion PII Redaction**:
  - When the user enables PII redaction on file upload, standard regex engines scrub email addresses and phone numbers before the text is chunked into snippets or stored in the database.
- **Zero-Leak Redaction Stubs & Opaque References**:
  - When claims cite restricted evidence, non-privileged viewers receive only aggregate counts and category metadata.
  - Real claim UUIDs, snippet text, file paths, author names, and quotation records are never exposed.
  - Instead, the API emits a cryptographically signed, viewer-bound HMAC stub reference (`stub_ref_...`). When requesting access, this reference is resolved and verified server-side, preventing enumeration attacks or cross-user replay.
- **CSRF Protection on All State Changes**:
  - All state-changing POST/PUT/PATCH/DELETE endpoints (including file uploads, password changes, and MFA enrollment) enforce `Depends(require_csrf)` with double-submit cookie validation.

---

## 2. What Gemini Sees (LLM Privacy Perimeter)

When Baton communicates with Google Gemini, it enforces strict data boundaries:

| Pipeline Stage | What is Sent to Gemini | What is NEVER Sent |
| :--- | :--- | :--- |
| **Claim Extraction** | Raw text of uploaded documents for chunking and verbatim claim extraction. | User passwords, session tokens, MFA secrets, or other projects' sources. |
| **Rehearsal Generation** | Approved claims that are visible to the requesting user's role. | Unapproved claims, claims citing restricted evidence above user's tier. |
| **Rehearsal Grading** | Candidate's submitted answer text alongside the relevant claim statements. | Other users' attempts, personal identity details. |
| **Audio Transcription** | In-memory raw audio bytes and the title of the specific gap being answered. | Audio files from other sources, user profile data. |

### Configurable Model Name & Timeouts
To ensure future compatibility and prevent hanging processes, model parameters are fully configurable:
- `GEMINI_MODEL`: Defaults to `gemini-2.5-flash` (can be overridden via environment variable).
- `GEMINI_TIMEOUT_SECONDS`: Hard 15-second timeout on all LLM requests with automatic failover to deterministic algorithmic alternatives.

---

## 3. Human Approval & The Leaver Protocol

Baton never auto-merges or auto-approves AI deductions into the authoritative evidence graph:
1. **Claims**: All claims extracted by Gemini enter a `Proposed` state. An approver must review, verify citations, and approve each claim before it appears in Rehearsal or is marked verified.
2. **Knowledge Gaps**: Departing engineers record voice or text answers, but the response is **never saved automatically**. The engineer must review the transcribed text, edit technical nuances, and explicitly click `"Confirm & Save"` to create an evidence snippet tagged `"stated by departing member"`.

---

## 4. Accessibility & UI Polish

Baton's user interface is designed for high accessibility (WCAG AA compliance):
- **Heading Hierarchy**: Strict `h1` -> `h2` -> `h3` hierarchy across all pages.
- **Permissions-Policy**: Explicitly sets `camera=(), microphone=(self), geolocation=(), browsing-topics=()` in both FastAPI HTTP headers and Next.js proxy configs, permitting self-origin mic capture while strictly blocking camera, geolocation, and ad topics.
- **Voice Recorder Polish & Screen Reader Live Regions**:
  - Live `aria-live="polite"` announcements for recording initiation, manual/auto stop, and transcription completion.
  - Visible countdown formatted as `"Remaining M:SS"` against the 120-second recording cap.
  - Friendly browser support error messaging with graceful fallback to typed text responses.
- **Accessible Access Request Modal**:
  - Replaces hardcoded strings with an accessible modal dialog (`role="dialog"`, `aria-modal="true"`).
  - Business justification input with real-time 500-character counter.
  - Active keyboard focus trap and `Escape` key listener for fluid dismissals.
- **Mobile Touch Targets & Navigation**:
  - All interactive buttons and tab navigation links meet the >= 44x44px minimum tap target sizing.
  - Responsive horizontal tab strip and hamburger drawer ensure complete project navigation (Sources, Claims, Gaps, Radar, Handover, Members) below 1024px.
  - Validated on 375px mobile viewports without horizontal page overflow.
- **Keyboard Navigation & Visible Focus**: Every interactive control, modal, and button has focus-visible ring styling (`focus:ring-2 focus:ring-amber-400`).
- **Reduced Motion**:
  - Global `@media (prefers-reduced-motion: reduce)` rule completely zeroes CSS animation/transition durations.
  - Root layout wraps all visual components in Framer Motion's `<MotionConfig reducedMotion="user">`, ensuring hero constellation graphs, page reveals, and modal entries are rendered statically for users requesting reduced motion.
- **Contrast & Theme Dual-Mode (WCAG AA & AAA Compliance)**:
  - **Light Theme**:
    - Primary amber buttons use dark navy text (`--primary-foreground: 224 50% 6%`), achieving **7.76:1** contrast (previously failed at 2.52:1).
    - Muted text achieves **7.25:1** contrast on card surfaces.
    - Status badges (Inferred, Verified, Conflicting, Missing) achieve **4.54:1 to 7.16:1** contrast.
    - Input borders achieve **3.03:1** (satisfying WCAG 2.1 Non-Text Contrast >= 3:1).
    - Radar chart axis labels use dynamic CSS variables (`hsl(var(--foreground))`) achieving **> 15:1** contrast.
  - **Dark Theme**: The dark "Night Sky" theme uses high-contrast foreground text (`text-foreground`) against midnight navy (`224 50% 6%`), with glowing amber accents and compliant badges.
