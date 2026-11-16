import json
import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from app.config import settings
from app.logger import app_logger

REHEARSAL_GENERATE_PROMPT = """
You are an expert technical assessor creating scenario-based handover onboarding questions.
Based ONLY on the provided approved claims and their verified citations, generate between 5 and 8 practical operational scenario questions.

CRITICAL RULES:
1. Every question MUST directly test knowledge asserted in one or more of the provided claims.
2. Tag each question with the exact `claim_ids` it tests.
3. DO NOT introduce or assume external facts not found in the provided claims.
4. Each question should pose a concrete situation an incoming engineer will encounter (e.g., system failure, deployment, config change, vendor contact).
5. Provide a short reference answer / rubric explaining what a correct response must mention based on the claim.

Return ONLY a valid JSON list of questions matching this schema:
[
  {
    "id": "q_1",
    "scenario": "A description of the scenario and the specific question asked...",
    "claim_ids": ["claim-uuid-1"],
    "category": "technical | operational | architecture | process",
    "expected_concepts": ["concept1", "concept2"],
    "guidance": "Brief hint or key principle tested"
  }
]
"""

REHEARSAL_GRADE_PROMPT = """
You are an objective evaluator grading an incoming engineer's answer to a handover rehearsal scenario.
Grade the student's answer strictly against the reference claim text and expected concepts.

Scenario: {scenario}
Reference Claim(s): {claim_text}
Expected Concepts: {expected_concepts}
Student Answer: {student_answer}

RULES:
1. Score from 0.0 to 1.0 (1.0 = fully accurate and mentions core concepts; 0.5 = partial understanding; 0.0 = incorrect or missing key facts).
2. Flag `passed: true` if score >= 0.70, otherwise `passed: false`.
3. Provide constructive feedback explaining what was correct and what key points were missed.
4. If failed, summarize the single core topic the engineer needs to review in `topic`.

Return ONLY a valid JSON object matching this schema:
{
  "score": 0.85,
  "passed": true,
  "feedback": "...",
  "topic": "..."
}
"""

def generate_rehearsal_scenarios(claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generates 5 to 8 scenario questions from visible approved claims.
    Uses Gemini if configured, otherwise falls back to deterministic heuristic generator.
    """
    if not claims:
        return []

    # If Gemini is configured, attempt generation with timeout
    if settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                generation_config={"response_mime_type": "application/json"}
            )
            payload = [
                {
                    "id": c["id"],
                    "claim_text": c["claim_text"],
                    "category": c.get("category", "technical"),
                    "citations": [cit.get("quoted_text", "") for cit in c.get("citations", [])]
                }
                for c in claims
            ]
            prompt = f"{REHEARSAL_GENERATE_PROMPT}\n\nAPPROVED CLAIMS:\n{json.dumps(payload, indent=2)}"
            
            response = model.generate_content(
                prompt,
                request_options={"timeout": settings.GEMINI_TIMEOUT_SECONDS}
            )
            data = json.loads(response.text.strip())
            if isinstance(data, list) and len(data) >= 1:
                # Ensure each question has an id and valid claim_ids
                valid_claim_ids = {c["id"] for c in claims}
                sanitized_questions = []
                for idx, q in enumerate(data[:8]):
                    filtered_cids = [cid for cid in q.get("claim_ids", []) if cid in valid_claim_ids]
                    if not filtered_cids:
                        filtered_cids = [claims[idx % len(claims)]["id"]]
                    sanitized_questions.append({
                        "id": q.get("id") or f"q_{idx+1}",
                        "scenario": q.get("scenario", f"Scenario regarding {q.get('category', 'technical')}"),
                        "claim_ids": filtered_cids,
                        "category": q.get("category", "technical"),
                        "expected_concepts": q.get("expected_concepts", []),
                        "guidance": q.get("guidance", "Refer to the approved claims for details.")
                    })
                if len(sanitized_questions) >= 1:
                    return sanitized_questions
        except Exception as e:
            app_logger.warning(f"Gemini rehearsal generation failed ({e}), falling back to deterministic generator")

    return generate_scenarios_deterministic(claims)

def generate_scenarios_deterministic(claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based generator that creates 5 to 8 scenario questions
    directly from approved claims with zero external dependencies.
    """
    questions = []
    # Target 5 to 8 questions (or total number of claims if fewer)
    target_count = min(8, max(len(claims), 5))
    
    for i in range(target_count):
        claim = claims[i % len(claims)]
        claim_id = claim["id"]
        claim_text = claim["claim_text"]
        category = claim.get("category", "technical")
        
        # Extract keywords for expected concepts
        words = [w.strip(".,;:()") for w in claim_text.split() if len(w) > 4 and w.lower() not in (
            "about", "their", "there", "which", "should", "would", "could", "these", "those"
        )]
        key_concepts = words[:3] if words else ["architecture", "process"]
        
        if category == "technical":
            scenario = (
                f"During an operational incident, the team reports an anomaly related to: \"{claim_text}\". "
                f"How should the incoming engineer respond, and what are the critical operational constraints "
                f"or architecture choices governing this subsystem?"
            )
        elif category == "operational":
            scenario = (
                f"You need to verify regular system operations concerning: \"{claim_text}\". "
                f"What procedures, tools, or contacts should you consult to ensure continuous compliance?"
            )
        elif category == "financial":
            scenario = (
                f"Budget and vendor allocations require review: \"{claim_text}\". "
                f"What are the approved financial parameters and who is accountable?"
            )
        else:
            scenario = (
                f"A team member asks you about the documented handover standard: \"{claim_text}\". "
                f"Explain how this requirement is structured and how to safely proceed."
            )

        questions.append({
            "id": f"q_{i+1}_{claim_id[:6]}",
            "scenario": scenario,
            "claim_ids": [claim_id],
            "category": category,
            "expected_concepts": key_concepts,
            "guidance": f"Key aspect: {', '.join(key_concepts)}"
        })

    return questions

def grade_rehearsal_answers(
    questions: List[Dict[str, Any]],
    submitted_answers: Dict[str, str],
    claims_by_id: Dict[str, Dict[str, Any]]
) -> Tuple[float, List[Dict[str, Any]], List[str]]:
    """
    Grades answers against claims and citations.
    Returns (total_score_pct, grades_list, weak_topics_list).
    """
    grades = []
    weak_topics = []
    total_score = 0.0

    for q in questions:
        qid = q["id"]
        answer_text = (submitted_answers.get(qid) or "").strip()
        claim_ids = q.get("claim_ids", [])
        
        # Aggregate claim texts and citation quotes for this question
        relevant_claims = [claims_by_id[cid] for cid in claim_ids if cid in claims_by_id]
        combined_claim_text = " ".join(c.get("claim_text", "") for c in relevant_claims)
        expected_concepts = q.get("expected_concepts", [])
        topic_name = relevant_claims[0].get("category", "technical").capitalize() if relevant_claims else "General"
        if relevant_claims:
            topic_name += f": {relevant_claims[0]['claim_text'][:40]}..."

        score, passed, feedback, flagged_topic = grade_single_answer(
            scenario=q["scenario"],
            student_answer=answer_text,
            claim_text=combined_claim_text,
            expected_concepts=expected_concepts,
            default_topic=topic_name
        )

        grades.append({
            "question_id": qid,
            "score": round(score, 2),
            "passed": passed,
            "feedback": feedback,
            "claim_ids": claim_ids,
            "topic": flagged_topic or topic_name
        })

        total_score += score
        if not passed:
            weak_topics.append(flagged_topic or topic_name)

    overall_pct = round((total_score / len(questions)) * 100.0, 1) if questions else 0.0
    return overall_pct, grades, weak_topics

def grade_single_answer(
    scenario: str,
    student_answer: str,
    claim_text: str,
    expected_concepts: List[str],
    default_topic: str
) -> Tuple[float, bool, str, str]:
    """
    Grades an individual question. Tries Gemini with fallback to deterministic heuristic.
    """
    if not student_answer:
        return 0.0, False, "No answer was provided for this scenario.", default_topic

    if settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                generation_config={"response_mime_type": "application/json"}
            )
            prompt = REHEARSAL_GRADE_PROMPT.format(
                scenario=scenario,
                claim_text=claim_text,
                expected_concepts=", ".join(expected_concepts),
                student_answer=student_answer
            )
            res = model.generate_content(
                prompt,
                request_options={"timeout": settings.GEMINI_TIMEOUT_SECONDS}
            )
            data = json.loads(res.text.strip())
            score = float(data.get("score", 0.0))
            passed = bool(data.get("passed", score >= 0.7))
            feedback = data.get("feedback", "Evaluation completed.")
            topic = data.get("topic", default_topic)
            return score, passed, feedback, topic
        except Exception as e:
            app_logger.warning(f"Gemini answer grading failed ({e}), using deterministic keyword grader")

    return grade_deterministic(student_answer, claim_text, expected_concepts, default_topic)

def grade_deterministic(
    student_answer: str,
    claim_text: str,
    expected_concepts: List[str],
    default_topic: str
) -> Tuple[float, bool, str, str]:
    """
    Deterministic rubric grader:
    Checks keyword/concept presence, answer length, and relevant overlap.
    """
    lower_answer = student_answer.lower()
    
    # 1. Answer length heuristic (too short = insufficient detail)
    if len(student_answer.split()) < 4:
        return 0.2, False, "Answer is too brief to demonstrate operational comprehension.", default_topic

    # 2. Concept overlap check
    matched_concepts = [c for c in expected_concepts if c.lower() in lower_answer]
    concept_ratio = len(matched_concepts) / len(expected_concepts) if expected_concepts else 0.5

    # 3. Claim term overlap
    claim_words = {w.lower().strip(".,;:()") for w in claim_text.split() if len(w) > 4}
    matched_claim_words = {w for w in claim_words if w in lower_answer}
    claim_ratio = len(matched_claim_words) / len(claim_words) if claim_words else 0.5

    # Combined score
    score = (concept_ratio * 0.6) + (min(claim_ratio, 1.0) * 0.4)
    # Give reasonable credit if the student wrote a thoughtful explanation (>20 words)
    if len(student_answer.split()) >= 15 and score < 0.7:
        score = min(score + 0.25, 0.95)

    passed = score >= 0.7
    if passed:
        feedback = f"Solid answer: demonstrates understanding of key operational points ({', '.join(matched_concepts) if matched_concepts else 'general knowledge'})."
        return round(score, 2), True, feedback, default_topic
    else:
        missing = [c for c in expected_concepts if c not in matched_concepts]
        missing_str = f" Missed critical concepts: {', '.join(missing)}." if missing else ""
        feedback = f"Partial or incomplete response.{missing_str} Review the approved handover documentation."
        return round(score, 2), False, feedback, default_topic
