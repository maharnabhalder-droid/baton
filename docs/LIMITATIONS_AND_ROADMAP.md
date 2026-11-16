# Limitations & Realistic Roadmap

In accordance with our commitment to engineering honesty, this document catalogs the current architectural boundaries of Baton Round 3 and outlines realistic future milestones.

---

## Current Technical Limitations

### 1. Ingestion Formats & File Sizes
- **Current Support**: Plain text (`.txt`), Markdown (`.md`), JSON (`.json`), Python source files (`.py`), and CSV (`.csv`).
- **File Size Caps**: Uploaded source documents are capped at 5MB; audio recordings are capped at 10MB.
- **Binary Formats**: Complex binary document formats (PDFs with vector drawings, proprietary CAD files, DOCX with embedded OLE objects) are not natively parsed by the backend snippet splitter; text must be extracted prior to upload.

### 2. Audio & Speech Recognition
- **Audio Codecs**: Supported MIME types are limited to `audio/webm`, `audio/wav`, `audio/mp4`, `audio/ogg`, and `audio/mpeg`.
- **Duration Limit**: Voice recordings are limited to 120 seconds per gap to prevent excessive memory consumption and keep knowledge transfer focused and modular.
- **Offline Fallback Transcription**: While the deterministic fallback returns an honest mock transcription during Gemini outages, offline speech-to-text without internet connectivity requires an external whisper-compatible server.

### 3. Rehearsal Question Complexity
- **Source Material**: Rehearsal questions are generated strictly from approved claims visible to the user. If an engineering domain relies heavily on unspoken tribal knowledge that has not yet been captured as a claim, the rehearsal cannot evaluate it.
- **Subjective Coding Evaluations**: The rehearsal grader evaluates operational understanding, architecture choices, and recovery steps. It does not compile or run arbitrary code submitted by candidates.

---

## Realistic Roadmap

### Phase 1: Native Document Parsers & OCR (Q1 2027)
- Integrate PDF and DOCX parsers with optical character recognition (OCR) for scanned schematics and architecture diagrams.
- Add support for OpenAPI/Swagger spec parsing to automatically generate API contract claims.

### Phase 2: Live Integrations & Issue Trackers (Q2 2027)
- **GitHub / GitLab Integration**: Connect to pull requests, issue threads, and commit messages to continuously detect orphaned tasks and bus-factor bottlenecks.
- **Slack & Linear Sync**: Stream team discussions into a staging buffer to extract decision rationales directly from team threads.

### Phase 3: Hardware-in-the-Loop Simulation (Q3 2027)
- Enable interactive sandbox environments where the incoming engineer executes dry-run incident response scenarios directly from the Rehearsal page.

### Phase 4: Granular Field-Level Encryption (Q4 2027)
- Integrate per-tenant envelope encryption (KMS) for restricted snippets, allowing client-side zero-knowledge decryption for enterprise compliance.
