import re
from typing import List, Dict, Any, Optional

FAILURE_KEYWORDS = re.compile(
    r"\b(recurring|build failure|flaky|race condition|timeout|broken|failing|error|crashes|segfault)\b",
    re.IGNORECASE
)
DEADLINE_KEYWORDS = re.compile(
    r"\b(deadline|due date|target date|launch|milestone|audit|cutoff|q3|q4|december|november)\b",
    re.IGNORECASE
)
OWNER_KEYWORDS = re.compile(
    r"\b(owner|assigned to|lead|dri|maintainer|authored by)\b",
    re.IGNORECASE
)

# Standard area mappings for technical project decomposition
CORE_AREAS = [
    {
        "id": "ci_pipeline",
        "name": "CI/CD & Build Infrastructure",
        "keywords": ["ci", "runner", "build", "pipeline", "docker", "simulation", "camera packet", "hil", "hardware-in-the-loop"]
    },
    {
        "id": "telemetry",
        "name": "Telemetry & Monitoring Pipeline",
        "keywords": ["telemetry", "websocket", "zeromq", "nats", "datadog", "metrics", "heartbeat"]
    },
    {
        "id": "sponsor_portal",
        "name": "Sponsor Portal & Authentication",
        "keywords": ["sponsor", "portal", "oauth", "token", "exchange", "auth"]
    },
    {
        "id": "core_control",
        "name": "Core Control Runtime & Hosting",
        "keywords": ["core control", "runtime", "kubernetes", "ecs", "frankfurt", "bare-metal", "cluster"]
    },
    {
        "id": "finance_contractor",
        "name": "Cloud Infrastructure & Contractor Spend",
        "keywords": ["cloud infrastructure", "spend", "contractor", "rates", "aws cloud", "monthly cost", "rate: $"]
    }
]

def calculate_bus_factor_radar(
    snippets: List[Dict[str, Any]],
    claims: List[Dict[str, Any]],
    gaps: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Computes transparent fragility scores (0-100) across technical areas:
    - Owner Concentration: single owner or unassigned (0-30 pts, 30%)
    - Problem Recurrence: build failures, flakiness, repeated errors (0-30 pts, 30%)
    - Time to Deadline: upcoming deadlines, launch pressures (0-20 pts, 20%)
    - Unresolved Status: conflicting/missing claims or unanswered gaps (0-20 pts, 20%)
    Total Fragility Score = Owner Concentration (30%) + Problem Recurrence (30%) + Time to Deadline (20%) + Unresolved Status (20%)
    """
    radar_areas = []

    for area in CORE_AREAS:
        area_keywords = area["keywords"]
        matched_snippets = []
        matched_authors = set()
        recurrence_hits = 0
        deadline_hits = 0
        unassigned_hits = 0

        for s in snippets:
            content_lower = s["content"].lower()
            if any(k in content_lower for k in area_keywords):
                matched_snippets.append(s)
                matched_authors.add(s.get("author", "Unknown"))
                
                # Check for failure recurrence
                found_failures = FAILURE_KEYWORDS.findall(s["content"])
                if found_failures:
                    recurrence_hits += len(found_failures)

                # Check for deadlines
                found_deadlines = DEADLINE_KEYWORDS.findall(s["content"])
                if found_deadlines:
                    deadline_hits += len(found_deadlines)

                # Check for unassigned status
                if "unassigned" in content_lower or "no owner" in content_lower:
                    unassigned_hits += 1

        # If no snippets match this area under the current user's visibility, skip the area entirely
        if not matched_snippets:
            continue

        # Matched claims
        matched_claims = []
        for c in claims:
            c_text_lower = c["claim_text"].lower()
            if any(k in c_text_lower for k in area_keywords):
                matched_claims.append(c)

        # Matched gaps
        matched_gaps = []
        for g in gaps:
            g_text_lower = (g.get("title", "") + " " + g.get("description", "")).lower()
            if any(k in g_text_lower for k in area_keywords):
                matched_gaps.append(g)

        # 1. Owner Concentration Score (0 - 30)
        # 1 owner = 25 pts, unassigned = 30 pts, 2+ owners = 5 pts
        if unassigned_hits > 0:
            owner_score = 30.0
            owner_notes = f"Unassigned work items detected; no active primary DRI."
        elif len(matched_authors) <= 1:
            owner_score = 25.0
            author_name = list(matched_authors)[0] if matched_authors else "Single Author"
            owner_notes = f"High concentration: single owner ({author_name}). Zero peer backup."
        else:
            owner_score = 10.0
            owner_notes = f"Distributed across {len(matched_authors)} engineers ({', '.join(list(matched_authors)[:2])})."

        # 2. Recurrence Score (0 - 30)
        if recurrence_hits >= 2:
            recurrence_score = 30.0
            recurrence_notes = f"Critical recurring problems documented ({recurrence_hits} failure indicators)."
        elif recurrence_hits == 1:
            recurrence_score = 18.0
            recurrence_notes = "Flaky behavior or failure pattern mentioned in source evidence."
        else:
            recurrence_score = 0.0
            recurrence_notes = "No recurring failure patterns recorded in visible evidence."

        # 3. Time to Deadline Score (0 - 20)
        if deadline_hits >= 1:
            deadline_score = 20.0
            deadline_notes = "High pressure: approaching milestone, audit, or release deadline referenced."
        else:
            deadline_score = 5.0
            deadline_notes = "Standard timeline without immediate deadline risk."

        # 4. Unresolved Status Score (0 - 20)
        conflicting_claims = [c for c in matched_claims if c.get("status") == "Conflicting"]
        missing_claims = [c for c in matched_claims if c.get("status") == "Missing"]
        unresolved_gaps = [g for g in matched_gaps if not g.get("answer")]

        unresolved_score = 0.0
        if conflicting_claims:
            unresolved_score += 12.0
        if missing_claims:
            unresolved_score += 4.0
        if unresolved_gaps:
            unresolved_score += min(len(unresolved_gaps) * 4.0, 8.0)
        unresolved_score = min(unresolved_score, 20.0)

        unresolved_notes = (
            f"{len(conflicting_claims)} conflicting claims, {len(missing_claims)} missing claims, "
            f"{len(unresolved_gaps)} open gaps."
        )

        total_score = round(owner_score + recurrence_score + deadline_score + unresolved_score, 1)

        severity = "Critical" if total_score >= 70 else ("Elevated" if total_score >= 45 else "Moderate")

        evidence_items = [
            {
                "snippet_id": s["id"],
                "location": s.get("location", ""),
                "author": s.get("author", "Unknown"),
                "content": s["content"]
            }
            for s in matched_snippets[:4]
        ]

        radar_areas.append({
            "id": area["id"],
            "name": area["name"],
            "score": total_score,
            "severity": severity,
            "breakdown": {
                "owner_concentration": {
                    "score": owner_score,
                    "max": 30,
                    "explanation": owner_notes
                },
                "recurrence": {
                    "score": recurrence_score,
                    "max": 30,
                    "explanation": recurrence_notes
                },
                "time_to_deadline": {
                    "score": deadline_score,
                    "max": 20,
                    "explanation": deadline_notes
                },
                "unresolved_status": {
                    "score": unresolved_score,
                    "max": 20,
                    "explanation": unresolved_notes
                }
            },
            "evidence": evidence_items,
            "claims_count": len(matched_claims),
            "gaps_count": len(matched_gaps)
        })

    # Sort descending by fragility score
    radar_areas.sort(key=lambda a: a["score"], reverse=True)
    for idx, a in enumerate(radar_areas):
        a["rank"] = idx + 1

    return radar_areas
