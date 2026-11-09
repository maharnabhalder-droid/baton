import re
from datetime import datetime, timezone
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from app.models import Gap, Snippet, Source, Project
from app.security import sanitize_text

DECISION_WORDS = re.compile(r"\b(decided|chose|chosen|switched|selected|migrated|adopted|deprecated|replaced)\b", re.IGNORECASE)
RATIONALE_WORDS = re.compile(r"\b(because|due to|in order to|rationale|reason|as a result|so that|since)\b", re.IGNORECASE)

TASK_WORDS = re.compile(r"\b(todo|in-progress|in progress|half-finished|wip|unfinished|pending review)\b", re.IGNORECASE)
OWNER_WORDS = re.compile(r"\b(assigned to|owner:\s*\w+|lead:\s*\w+|dri:\s*\w+)\b", re.IGNORECASE)
UNASSIGNED_WORDS = re.compile(r"\b(unassigned|nobody|tbd|no owner|none)\b", re.IGNORECASE)

EXTERNAL_DEPENDENCIES = ["aws", "datadog", "zeromq", "nats", "stripe", "sendgrid", "auth0", "cloudflare", "pagerduty"]

def detect_project_gaps(snippets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Plain Python rule-based gap detector:
    1. Decision without rationale
    2. Task without owner
    3. Single-owner area
    4. Dependency without contact
    """
    detected_gaps = []
    author_areas: Dict[str, set] = {}
    dependency_mentions: Dict[str, Dict[str, Any]] = {}

    for s in snippets:
        content = s["content"]
        lower = content.lower()
        snippet_id = s.get("id", "")
        author = s.get("author", "Unknown")

        # Rule 1: Decision without rationale
        if DECISION_WORDS.search(content):
            if not RATIONALE_WORDS.search(content):
                detected_gaps.append({
                    "gap_type": "decision_without_rationale",
                    "title": f"Decision made without documented rationale in {s.get('location', 'source')}",
                    "description": f"The snippet states: \"{content[:150]}...\", but does not explain the reasoning or technical trade-offs.",
                    "entity_id": snippet_id
                })

        # Rule 2: Task without owner
        if TASK_WORDS.search(content):
            has_explicit_owner = bool(OWNER_WORDS.search(content)) and not bool(UNASSIGNED_WORDS.search(content))
            if not has_explicit_owner or UNASSIGNED_WORDS.search(content):
                detected_gaps.append({
                    "gap_type": "task_without_owner",
                    "title": f"Unassigned or in-progress task in {s.get('location', 'source')}",
                    "description": f"Ongoing or unfinished task found without an assigned owner: \"{content[:150]}...\".",
                    "entity_id": snippet_id
                })

        # Collect area info for Single-Owner Area check
        for area in ["sponsor-portal", "telemetry", "motor-control", "ci-pipeline", "firmware", "billing"]:
            if area in lower:
                author_areas.setdefault(area, set()).add(author)

        # Collect dependency mentions for Dependency Without Contact check
        for dep in EXTERNAL_DEPENDENCIES:
            if dep in lower:
                has_email = "@" in content
                has_contact = any(k in lower for k in ("contact", "support", "rep", "account manager", "slack"))
                dependency_mentions.setdefault(dep, {
                    "has_contact": False,
                    "snippet_id": snippet_id,
                    "location": s.get("location", "")
                })
                if has_email or has_contact:
                    dependency_mentions[dep]["has_contact"] = True

    # Rule 3: Single-owner area
    for area, authors in author_areas.items():
        if len(authors) == 1:
            only_author = list(authors)[0]
            detected_gaps.append({
                "gap_type": "single_owner_area",
                "title": f"Single person of failure for '{area}'",
                "description": f"All knowledge and code for the '{area}' component is held exclusively by '{only_author}'. No peer backup identified.",
                "entity_id": f"area:{area}"
            })

    # Rule 4: Dependency without contact
    for dep, info in dependency_mentions.items():
        if not info["has_contact"]:
            detected_gaps.append({
                "gap_type": "dependency_without_contact",
                "title": f"External dependency '{dep.upper()}' lacks vendor contact",
                "description": f"The project relies on external service '{dep}', but no contact person, escalation path, or support contract is recorded.",
                "entity_id": info.get("snippet_id", "")
            })

    return detected_gaps

def answer_gap_and_create_evidence(
    db: Session,
    gap: Gap,
    user_id: str,
    answer_text: str
) -> Snippet:
    """
    Stores gap answer and creates new evidence snippet tagged 'stated by departing member'.
    """
    clean_answer = sanitize_text(answer_text)
    gap.answer = clean_answer
    gap.answered_by = user_id
    gap.answered_at = datetime.now(timezone.utc)

    # Find or create a dedicated 'Handover Clarifications' source for the project
    clarification_source = (
        db.query(Source)
        .filter(Source.project_id == gap.project_id, Source.title == "Handover Clarifications (Departing Member)")
        .first()
    )
    if not clarification_source:
        clarification_source = Source(
            project_id=gap.project_id,
            title="Handover Clarifications (Departing Member)",
            file_path="virtual://handover-clarifications",
            access_level="team",
            author="Departing Member",
            original_filename="handover_qa.md",
            file_type="virtual",
            size_bytes=len(clean_answer)
        )
        db.add(clarification_source)
        db.flush()

    new_evidence = Snippet(
        source_id=clarification_source.id,
        project_id=gap.project_id,
        content=f"Q ({gap.title}): {gap.description}\nA: {clean_answer}",
        location=f"Gap QA: {gap.gap_type}",
        author="stated by departing member",
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        access_level="team"
    )
    db.add(new_evidence)
    db.commit()
    db.refresh(gap)
    db.refresh(new_evidence)
    return new_evidence

