import json
import re
from typing import List, Dict, Any, Optional

from app.config import settings
from app.logger import app_logger

CLAIM_EXTRACTION_PROMPT = """
You are a precise knowledge-handover verification analyst.
Analyze the following source snippets and extract verifiable atomic claims.

RULES:
1. Every claim MUST cite one or more valid snippet IDs from the provided input.
2. Every citation MUST include a `quoted_text` string that appears VERBATIM in that snippet's content.
3. If an assertion cannot be backed by a verbatim quote from the snippet, DO NOT include it.
4. Categorize each claim: technical, operational, financial, architecture, process.
5. Assign initial status: "Verified", "Inferred", "Conflicting", or "Missing".

Return ONLY a JSON array conforming to this schema:
[
  {
    "claim_text": "string",
    "status": "Verified | Inferred | Conflicting | Missing",
    "category": "technical | operational | financial | architecture | process",
    "confidence": 0.0 - 1.0,
    "citations": [
      {
        "snippet_id": "string",
        "quoted_text": "verbatim text copied exactly from snippet content"
      }
    ]
  }
]
"""

def extract_claims_with_gemini(snippets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not settings.GEMINI_API_KEY:
        app_logger.info("GEMINI_API_KEY not configured, using deterministic fallback extractor")
        return extract_claims_fallback(snippets)

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={"response_mime_type": "application/json"}
        )

        snippets_payload = [
            {
                "id": s["id"],
                "author": s["author"],
                "location": s["location"],
                "content": s["content"]
            }
            for s in snippets
        ]

        prompt = f"{CLAIM_EXTRACTION_PROMPT}\n\nSNIPPETS:\n{json.dumps(snippets_payload, indent=2)}"
        response = model.generate_content(prompt)
        text_output = response.text.strip()
        data = json.loads(text_output)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "claims" in data:
            return data["claims"]
        return []
    except Exception as e:
        app_logger.warning(f"Gemini API claim extraction failed ({e}), falling back to heuristic engine")
        return extract_claims_fallback(snippets)

def extract_claims_fallback(snippets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based extractor that guarantees verbatim quotes
    from the snippets for local development, offline runs, and unit tests.
    """
    extracted_claims = []
    
    for s in snippets:
        content = s["content"]
        # Split content into sentences / clauses
        sentences = [sent.strip() for sent in re.split(r"(?<=[.!?\n])\s+", content) if len(sent.strip()) > 15]
        
        for sent in sentences:
            category = "technical"
            status = "Verified"
            
            lower_sent = sent.lower()
            if any(w in lower_sent for w in ("cost", "spend", "rate", "$", "budget", "salary", "usd")):
                category = "financial"
            elif any(w in lower_sent for w in ("architecture", "system", "infrastructure", "cluster", "deploy", "hosting")):
                category = "architecture"
            elif any(w in lower_sent for w in ("process", "meeting", "review", "sprint", "release")):
                category = "process"
            elif any(w in lower_sent for w in ("incident", "support", "ticket", "portal", "task")):
                category = "operational"

            if any(w in lower_sent for w in ("conflict", "contradicts", "disagrees", "deprecated")):
                status = "Conflicting"
            elif any(w in lower_sent for w in ("assumed", "likely", "probably", "might", "inferred")):
                status = "Inferred"
            elif any(w in lower_sent for w in ("missing", "unknown", "unassigned", "todo", "tbd")):
                status = "Missing"

            # Quoted text MUST exist verbatim in s["content"]
            quoted_text = sent
            if quoted_text in content:
                extracted_claims.append({
                    "claim_text": sent,
                    "status": status,
                    "category": category,
                    "confidence": 0.95 if status == "Verified" else 0.8,
                    "citations": [
                        {
                            "snippet_id": s["id"],
                            "quoted_text": quoted_text
                        }
                    ]
                })

    return extracted_claims

def filter_and_validate_citations(
    candidate_claims: List[Dict[str, Any]],
    snippet_map: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    STRICT CITATION RULE:
    Every claim must cite snippet IDs AND quote text that exists VERBATIM
    in the snippet; otherwise discard it.
    """
    valid_claims = []

    for c in candidate_claims:
        citations = c.get("citations", [])
        if not citations:
            app_logger.info("Discarding claim: no citations provided")
            continue

        all_citations_valid = True
        validated_citations = []

        for cit in citations:
            snippet_id = cit.get("snippet_id")
            quoted_text = cit.get("quoted_text", "").strip()

            if not snippet_id or not quoted_text:
                all_citations_valid = False
                break

            snippet = snippet_map.get(snippet_id)
            if not snippet:
                all_citations_valid = False
                break

            # Verbatim check: quoted_text MUST exist inside snippet content
            if quoted_text not in snippet["content"]:
                all_citations_valid = False
                break

            validated_citations.append({
                "snippet_id": snippet_id,
                "quoted_text": quoted_text
            })

        if all_citations_valid and validated_citations:
            c["citations"] = validated_citations
            valid_claims.append(c)
        else:
            app_logger.info("Discarding claim: cited quote does not exist verbatim in snippet")

    return valid_claims

def second_pass_verify_and_conflict_check(claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Second verify pass: checks support and conflicts across claims.
    Flags mutual contradictions as 'Conflicting'.
    """
    # Key concept conflict pairs (e.g., AWS ECS vs bare-metal Kubernetes)
    conflict_signatures = [
        (r"\baws\s+(?:ecs|fargate|cloud)\b", r"\bbare[- ]metal\b|\bfrankfurt\b|\bon[- ]prem\b"),
        (r"\bpostgres\b|\bpostgresql\b", r"\bmongodb\b|\bmongo\b"),
        (r"\brest\b|\brestful\b", r"\bgraphql\b"),
        (r"\bzeromq\b", r"\bnats\b"),
    ]

    for i in range(len(claims)):
        text_a = claims[i]["claim_text"].lower()
        for j in range(i + 1, len(claims)):
            text_b = claims[j]["claim_text"].lower()

            for pattern_a, pattern_b in conflict_signatures:
                match_a_first = re.search(pattern_a, text_a) and re.search(pattern_b, text_b)
                match_b_first = re.search(pattern_b, text_a) and re.search(pattern_a, text_b)
                if match_a_first or match_b_first:
                    claims[i]["status"] = "Conflicting"
                    claims[j]["status"] = "Conflicting"

    return claims

def run_claim_pipeline(snippets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Executes complete pipeline:
    1. Extract candidate claims with strict JSON schema (Gemini or deterministic engine).
    2. Enforce strict verbatim citation rule (discard any unverified).
    3. Second pass: verify and detect conflicts.
    """
    if not snippets:
        return []

    snippet_map = {s["id"]: s for s in snippets}
    candidates = extract_claims_with_gemini(snippets)
    verified_candidates = filter_and_validate_citations(candidates, snippet_map)
    final_claims = second_pass_verify_and_conflict_check(verified_candidates)
    return final_claims

