# Baton — Project Task & Design System Documentation

## Design Context

### Users
- **Primary Users:**
  1. **Departing Staff / Tech Leads (Approvers):** Under time pressure, offboarding high-context projects, eager to hand over responsibility cleanly without endless post-departure emergency messages.
  2. **Incoming Engineers / Successors:** Feeling imposter syndrome, overwhelmed by unfamiliar architectural decisions, need proof and rationale rather than speculation.
  3. **Engineering Executives / Auditors (Restricted Viewers):** Need governance proof that critical systems have documented resilience, zero single-point-of-failure (SPOF) risks, and compliant security postures.
- **Context & Job to be Done:**
  - Prevent institutional brain-drain when key engineers leave software organizations.
  - Convert unstructured documents (Slack transcripts, RFCs, PR discussions, PDFs, spreadsheets) into a verifiable evidence graph.
  - Conduct targeted, minimal gap interviews so the leaver is only asked what documentation cannot explain.
  - Enable mathematically backed receipt sign-offs where successors verify they understood the system.
- **Emotional Goals:**
  - **Reassurance & Clarity:** Moving from chaotic fear of the unknown to crystalline confidence.
  - **Integrity & Gravitas:** The platform feels like a trusted flight recorder or scientific ledger, not a casual social feed or disposable notes app.

---

### Brand Personality
- **3-Word Personality:** *Rigorous. Nocturnal. Illuminated.*
- **Voice & Tone:**
  - Objective, exact, and calm.
  - Speaks with cryptographic certitude: "verified by verbatim citation", "evidence record", "audit trace".
  - Never uses hype or vague corporate jargon. Every claim either has proof or is flagged.
- **Visual Metaphor:**
  - **The Constellation System:** Claims are stars in the sky. Verbatim citations are the connecting lines. Blind spots are unlit stars that ignite with amber light when the departing member provides answers.

---

### Aesthetic Direction
- **Dual-Theme Nocturnal & Dawn Palette:**
  - **Dark Mode ("Deep Midnight Navy"):**
    - Background: `hsl(224, 50%, 6%)` (Deep cosmic navy)
    - Foreground: `hsl(210, 40%, 98%)` (Warm star-white)
    - Primary Accent: `hsl(38, 92%, 50%)` (Luminous baton amber)
    - Surfaces: `hsl(224, 45%, 9%)` with soft celestial starfield speckles (`.starfield-bg`)
  - **Light Mode ("Pale Dawn"):**
    - Background: `hsl(218, 30%, 97%)` (Soft morning atmospheric slate-mist)
    - Foreground: `hsl(222, 47%, 12%)` (Deep contrast ink navy)
    - Primary Accent: `hsl(38, 92%, 46%)` (Warm refined amber)
    - Surfaces: Pure white cards (`hsl(0, 0%, 100%)`) with delicate border delineation (`hsl(215, 25%, 87%)`) and subtle dawn speckles
- **Status Constellation Tokens:**
  - **Verified:** Mint / Emerald (`hsl(158, 64%, 42%)` in light, `hsl(158, 64%, 48%)` in dark)
  - **Inferred:** Amber (`hsl(38, 92%, 44%)` in light, `hsl(38, 92%, 50%)` in dark)
  - **Conflicting:** Coral / Crimson (`hsl(0, 84%, 55%)` in light, `hsl(0, 84%, 60%)` in dark)
  - **Missing:** Dashed hollow star (`hsl(215, 16%, 45%)` in light, `hsl(215, 16%, 50%)` in dark)
- **Typography:**
  - **Headings & Display:** `Fraunces` (Characterful, editorial serif with classical weight)
  - **UI & Body:** `Inter` (Clean, neutral geometric sans-serif for UI density)
  - **Citations & Hashes:** `JetBrains Mono` (Tabular numbers, verbatim quoted passages, snippet IDs)
- **Anti-References:**
  - Must NOT look like generic purple SaaS templates or cartoonish dashboards.
  - No noisy gradient borders, gratuitous 3D blobs, or low-contrast gray-on-gray text.
  - Motion is restrained, purpose-driven, and respects `prefers-reduced-motion`.

---

### Design Principles
1. **Verbatim Traceability Over Pretty Summaries:**
   - Every claim presented to a human must reveal its verbatim anchor on demand. If a quote cannot be verified, it has no place in the constellation.
2. **Atmospheric Contrast & Legibility:**
   - Whether in Deep Midnight Navy or Pale Dawn, high contrast ratios (WCAG AAA for text) must be preserved. Amber is reserved for the "baton"—the active handover baton particle, primary action, or ignited knowledge star.
3. **Respect Clearance with Spatial Dignity:**
   - When a claim is invisible due to lack of restricted clearance, the UI never taunts the user with lock-screens or paywalls. It smoothly presents the complete graph of what they are authorized to see.
4. **Frictionless Dual-Theme Parity:**
   - Light and dark themes are first-class peers. The theme toggle persists across reloads via local storage and applies instantaneously without flash of unstyled content.
5. **Calm, Deliberate Motion:**
   - Transitions (fade, slight slide, star ignition) must be smooth and intentional (300-500ms ease-out). No bouncy springs, looping spinners without purpose, or layout shifts.

