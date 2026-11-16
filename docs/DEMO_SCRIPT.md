# Baton 3–5 Minute Demo Video Script

**Target Duration**: 3:30 – 4:30 minutes  
**Audience**: Technical Leads, Engineering Directors, Onboarding Managers  
**Scenario**: Handover of the Orbit Robotics Autonomous Rover Platform from departing lead Elena to incoming engineer Marcus.

---

## [0:00 – 0:40] Act 1: The Problem & The Evidence Constellation

### Visuals
- Screen starts on Baton Landing Page (`/login`).
- Point out the one-click **Demo Approver** and **Demo Incoming** buttons (no password typing required for evaluators).
- Quick cut to the Orbit Robotics project dashboard (`/projects/{id}`).
- Show the Night Sky Constellation graph with Mint (Verified), Amber (Inferred), and Coral (Conflicting) stars.

### Spoken Script
> *"When a core technical lead leaves a company, tribal knowledge usually evaporates. Teams get a hasty document dump, but nobody knows if it matches reality.*  
> *Meet Baton. Baton is an evidence-backed knowledge handover platform that turns departure debt into verifiable truth.*  
> *Here in our demo project, Orbit Robotics, we're looking at the institutional memory constellation. Every claim here is anchored by exact character-for-character verbatim citations to ground-truth documentation."*

---

## [0:41 – 1:30] Act 2: Reconstruct, Verify & Redaction Stubs

### Visuals
- Click into `/projects/{id}/claims`.
- Show verified claims with exact quote cards.
- Scroll down to the Redaction Stub: show the card displaying `"1 restricted source: ask the approver"` with zero text leaked.
- Switch to Marcus's view (`incoming@orbitrobotics.com`). Click `"Request Access"`.
- Switch back to Elena's view (`approver@orbitrobotics.com`), show the Request Inbox, and click `"Grant Access"`.

### Spoken Script
> *"Notice this claim here: it cites a restricted credential vault. Because Marcus is an incoming engineer without executive credentials, Baton enforces zero-leak Redaction Stubs.*  
> *The system renders only the count and category. No quotes, filenames, or snippet IDs leak through the database RLS.*  
> *Marcus can request access right from the stub card, and Elena can review and grant it instantly from her approver inbox."*

---

## [1:31 – 2:20] Act 3: Voice-Note Gap Interview

### Visuals
- Navigate to `/projects/{id}/gaps`.
- Show the rule-based scanner detecting unlit gaps (e.g., telemetry bus decision).
- Elena clicks `"Answer as Departing Member"`.
- Click `"Record Voice Note"`, speak for 5 seconds: *"We chose ZeroMQ over ROS2 DDS because the embedded Cortex-M7 lacked memory for DDS discovery."*
- Click `"Stop"`, then `"Transcribe with Gemini"`.
- Show the transcript appearing in the editable box. Elena tweaks a word and clicks `"Confirm & Save (Ignite Star)"`.
- The gap turns into an ignited star tagged `"stated by departing member"`.

### Spoken Script
> *"Documentation never covers everything. Baton's gap engine scans for decisions made without written rationales.*  
> *Rather than forcing Elena to write essays, she can record a quick voice note.*  
> *Baton processes the audio strictly in-memory—no audio files ever touch the disk or database. Gemini transcribes it, Elena verifies the technical terms, and confirms it. The answer is instantly ignited into the project's evidence graph."*

---

## [2:21 – 3:15] Act 4: Bus-Factor Radar & Handover Rehearsal

### Visuals
- Click `"Bus-Factor Radar"` in the navigation bar.
- Point out the ranked fragility list: the CI runner race condition ranks as Critical/Elevated with its transparent formula score.
- Click to drill down into the cited evidence snippet.
- Navigate to `/projects/{id}/handover`.
- Show that the `"Acknowledge Receipt"` button is locked behind the Rehearsal Gate.
- Click `"Generate Rehearsal Exam"`. Marcus answers the scenario questions.
- Submit for grading: show score breakdown (e.g. 88%) and show how weak answers populate the approver's queue.

### Spoken Script
> *"How do we know where the real risks lie? The Bus-Factor Radar calculates an objective fragility score based on single-owner concentration, recurrence of failures, and approaching deadlines.*  
> *Here, our flaky CI simulation runner ranks at the very top.*  
> *Finally, before Marcus can acknowledge the handover, he doesn't just sign a blank form—he takes a Scenario Rehearsal generated only from approved claims he can see.*  
> *Weak answers go straight to Elena's 'not yet understood' queue for mentoring."*

---

## [3:16 – 3:45] Act 5: Cryptographic Receipt & Conclusion

### Visuals
- Marcus clicks `"Acknowledge Knowledge Transfer"`.
- Display the generated tamper-evident receipt with Receipt ID (`RCPT-...`), SHA-256 fingerprint, rehearsal score, missed topics, and export to Markdown.

### Spoken Script
> *"Once passed, Marcus signs off. Baton issues a tamper-evident, cryptographically signed handover receipt recording his score, verified claims, and missed topics.*  
> *Knowledge is preserved, verified, and understood.*  
> *That is Baton—ensuring institutional memory never walks out the door."*

---

## Note on AI-Assisted Development & Third-Party Services
Baton was engineered with AI-assisted design and development tooling (Google DeepMind Antigravity and Google Gemini APIs). External cloud services utilized include:
- **Google Gemini API**: For structured claim extraction, scenario question synthesis, multi-criteria rehearsal grading, and in-memory speech-to-text transcription.
- **Neon Serverless PostgreSQL**: For Row-Level Security (RLS) enforcement.
- **Render / Vercel**: For containerized backend hosting and edge frontend deployment.
