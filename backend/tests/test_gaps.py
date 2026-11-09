from app.models import Project, ProjectMember, Gap, Snippet
from app.services.gaps import detect_project_gaps
from tests.conftest import create_auth_headers_and_cookies

def test_detect_all_four_gap_types():
    snippets = [
        # 1. Decision without rationale (mentions "decided" but lacks "because/reason")
        {
            "id": "s-1",
            "content": "We decided to migrate the telemetry broker from NATS to ZeroMQ yesterday.",
            "location": "line 12",
            "author": "Elena Vance"
        },
        # 2. Task without owner (mentions TODO / half-finished, unassigned)
        {
            "id": "s-2",
            "content": "The sponsor-portal integration is half-finished and status is unassigned.",
            "location": "line 45",
            "author": "Elena Vance"
        },
        # 3. Single-owner area (only Elena Vance touches sponsor-portal & firmware)
        {
            "id": "s-3",
            "content": "Updated firmware motor-control drivers for rev3 board.",
            "location": "line 60",
            "author": "Elena Vance"
        },
        # 4. Dependency without contact (mentions AWS without contact info)
        {
            "id": "s-4",
            "content": "Production workloads rely heavily on AWS infrastructure for GPU compute.",
            "location": "line 90",
            "author": "Elena Vance"
        }
    ]

    gaps = detect_project_gaps(snippets)
    types_found = {g["gap_type"] for g in gaps}

    assert "decision_without_rationale" in types_found
    assert "task_without_owner" in types_found
    assert "single_owner_area" in types_found
    assert "dependency_without_contact" in types_found

def test_gap_answering_stores_evidence_tagged_stated_by_departing_member(client, approver_user, db_session):
    project = Project(name="Project Gaps", description="Gap testing", owner_id=approver_user.id)
    db_session.add(project)
    db_session.commit()

    db_session.add(ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver"))
    gap = Gap(
        project_id=project.id,
        gap_type="decision_without_rationale",
        title="ZeroMQ switch without rationale",
        description="Why was ZeroMQ chosen over NATS?"
    )
    db_session.add(gap)
    db_session.commit()

    cookies, headers = create_auth_headers_and_cookies(approver_user)
    answer_text = "ZeroMQ was chosen because of zero external daemon dependencies on embedded Linux."
    resp = client.post(
        f"/api/projects/{project.id}/gaps/{gap.id}/answer",
        json={"answer": answer_text},
        cookies=cookies,
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["answer"] == answer_text

    # Verify evidence snippet created in database with tag "stated by departing member"
    evidence_snippet = (
        db_session.query(Snippet)
        .filter(Snippet.project_id == project.id, Snippet.author == "stated by departing member")
        .first()
    )
    assert evidence_snippet is not None
    assert answer_text in evidence_snippet.content
    assert evidence_snippet.author == "stated by departing member"

