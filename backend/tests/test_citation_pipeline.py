from app.services.pipeline import (
    filter_and_validate_citations,
    second_pass_verify_and_conflict_check,
    run_claim_pipeline
)

def test_verbatim_citation_rule_preserves_exact_quote():
    snippets = {
        "snip-1": {
            "id": "snip-1",
            "content": "The telemetry service uses WebSockets with heartbeats every 5 seconds.",
            "author": "Elena Vance"
        }
    }

    candidates = [
        {
            "claim_text": "Telemetry relies on WebSockets with 5s heartbeats.",
            "status": "Verified",
            "category": "technical",
            "confidence": 0.95,
            "citations": [
                {
                    "snippet_id": "snip-1",
                    "quoted_text": "The telemetry service uses WebSockets with heartbeats every 5 seconds."
                }
            ]
        }
    ]

    validated = filter_and_validate_citations(candidates, snippets)
    assert len(validated) == 1
    assert validated[0]["claim_text"] == candidates[0]["claim_text"]
    assert validated[0]["citations"][0]["quoted_text"] in snippets["snip-1"]["content"]

def test_citation_rule_discards_hallucinated_quote():
    snippets = {
        "snip-1": {
            "id": "snip-1",
            "content": "The telemetry service uses WebSockets with heartbeats every 5 seconds.",
            "author": "Elena Vance"
        }
    }

    # Quote modified slightly ("uses gRPC" instead of "uses WebSockets")
    candidates = [
        {
            "claim_text": "Telemetry uses gRPC protocol.",
            "status": "Verified",
            "category": "technical",
            "confidence": 0.9,
            "citations": [
                {
                    "snippet_id": "snip-1",
                    "quoted_text": "The telemetry service uses gRPC with heartbeats every 5 seconds."
                }
            ]
        }
    ]

    validated = filter_and_validate_citations(candidates, snippets)
    # Must be discarded because quoted_text does NOT exist verbatim in snippet!
    assert len(validated) == 0

def test_citation_rule_discards_missing_or_empty_citation():
    snippets = {
        "snip-1": {
            "id": "snip-1",
            "content": "Postgres database backups run at midnight daily.",
            "author": "Marcus Brody"
        }
    }

    candidates = [
        # Claim with no citations
        {
            "claim_text": "Backups run daily.",
            "status": "Verified",
            "category": "operational",
            "confidence": 0.9,
            "citations": []
        },
        # Claim with non-existent snippet_id
        {
            "claim_text": "Database is Postgres.",
            "status": "Verified",
            "category": "technical",
            "confidence": 0.9,
            "citations": [
                {
                    "snippet_id": "snip-999-invalid",
                    "quoted_text": "Postgres database backups run at midnight daily."
                }
            ]
        }
    ]

    validated = filter_and_validate_citations(candidates, snippets)
    assert len(validated) == 0

def test_second_pass_detects_conflicting_hosting_decisions():
    claims = [
        {
            "claim_text": "Orbit Robotics core control system runs on bare-metal Kubernetes in Frankfurt.",
            "status": "Verified",
            "category": "architecture",
            "confidence": 0.95
        },
        {
            "claim_text": "We decided to migrate core control system to AWS ECS clusters.",
            "status": "Verified",
            "category": "architecture",
            "confidence": 0.95
        }
    ]

    analyzed = second_pass_verify_and_conflict_check(claims)
    assert len(analyzed) == 2
    assert analyzed[0]["status"] == "Conflicting"
    assert analyzed[1]["status"] == "Conflicting"

def test_full_pipeline_verifies_orbit_robotics_snippets():
    snippets = [
        {
            "id": "s-1",
            "content": "Hardware-in-the-loop CI runner suffers from recurring build failure and flaky race condition.",
            "location": "lines 1-5",
            "author": "Elena",
            "timestamp": "2026-08-10",
            "access_level": "public"
        },
        {
            "id": "s-2",
            "content": "Task: sponsor-portal OAuth token exchange is half-finished and currently in-progress with status unassigned.",
            "location": "lines 10-15",
            "author": "Elena",
            "timestamp": "2026-08-12",
            "access_level": "team"
        }
    ]

    results = run_claim_pipeline(snippets)
    assert len(results) >= 2
    # Check that all resulting claims possess verbatim citations
    for claim in results:
        assert len(claim["citations"]) > 0
        cit = claim["citations"][0]
        matching_snippet = next(s for s in snippets if s["id"] == cit["snippet_id"])
        assert cit["quoted_text"] in matching_snippet["content"]

