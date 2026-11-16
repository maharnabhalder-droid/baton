import pytest
from app.models import Project, ProjectMember, Source, Snippet, Claim, ClaimCitation, Gap
from tests.conftest import create_auth_headers_and_cookies

@pytest.fixture
def radar_test_project(db_session, approver_user, incoming_user, restricted_user):
    proj = Project(name="Radar Test Project", description="Testing bus-factor radar", owner_id=approver_user.id)
    db_session.add(proj)
    db_session.flush()

    m1 = ProjectMember(project_id=proj.id, user_id=approver_user.id, role="approver")
    m2 = ProjectMember(project_id=proj.id, user_id=incoming_user.id, role="incoming")
    m3 = ProjectMember(project_id=proj.id, user_id=restricted_user.id, role="restricted")
    db_session.add_all([m1, m2, m3])

    s_pub = Source(project_id=proj.id, title="Architecture Docs", file_path="virtual://arch", access_level="public", original_filename="arch.md", file_type="virtual")
    s_team = Source(project_id=proj.id, title="Sprint Tasks", file_path="virtual://tasks", access_level="team", original_filename="tasks.md", file_type="virtual")
    s_res = Source(project_id=proj.id, title="Finance & Rates", file_path="virtual://fin", access_level="restricted", original_filename="fin.csv", file_type="virtual")
    db_session.add_all([s_pub, s_team, s_res])
    db_session.flush()

    # CI Pipeline Snippet: High Recurrence Failure Trap
    snip_ci = Snippet(
        source_id=s_pub.id,
        project_id=proj.id,
        content="Hardware-in-the-loop CI runner suffers from recurring build failure and flaky race condition during camera packet simulation, failing repeatedly on every merge.",
        location="arch.md:40",
        author="Elena Vance",
        timestamp="2026-08-10",
        access_level="public"
    )

    # Core Control Snippet: Conflicting Decision
    snip_core1 = Snippet(
        source_id=s_pub.id,
        project_id=proj.id,
        content="Core control runtime runs on bare-metal Kubernetes in Frankfurt datacenter.",
        location="arch.md:10",
        author="Elena Vance",
        timestamp="2026-08-10",
        access_level="public"
    )
    snip_core2 = Snippet(
        source_id=s_team.id,
        project_id=proj.id,
        content="Core control runtime migrated to AWS ECS cluster due to maintenance issues.",
        location="tasks.md:15",
        author="Marcus Brody",
        timestamp="2026-09-01",
        access_level="team"
    )

    # Restricted Finance Snippet: Contractor Rates Trap
    snip_fin = Snippet(
        source_id=s_res.id,
        project_id=proj.id,
        content="Vendor: AWS Cloud Infrastructure, monthly cost spend: $14,200 USD. Contractor rate: $185/hr for Sensor Lead.",
        location="fin.csv:1",
        author="Finance Dept",
        timestamp="2026-09-30",
        access_level="restricted"
    )

    db_session.add_all([snip_ci, snip_core1, snip_core2, snip_fin])
    db_session.flush()

    # Claims
    c_ci = Claim(
        project_id=proj.id,
        claim_text="Hardware CI runner suffers from recurring build failure.",
        status="Verified",
        category="technical",
        created_by=approver_user.id,
        review_status="approved"
    )
    c_core_conflict = Claim(
        project_id=proj.id,
        claim_text="Core control runtime hosting conflict between bare-metal and AWS ECS.",
        status="Conflicting",
        category="technical",
        created_by=approver_user.id,
        review_status="approved"
    )
    db_session.add_all([c_ci, c_core_conflict])
    db_session.flush()

    cit_ci = ClaimCitation(claim_id=c_ci.id, snippet_id=snip_ci.id, quoted_text="recurring build failure")
    cit_core = ClaimCitation(claim_id=c_core_conflict.id, snippet_id=snip_core1.id, quoted_text="bare-metal Kubernetes")
    db_session.add_all([cit_ci, cit_core])
    db_session.commit()

    return proj

def test_radar_recurring_build_failure_ranks_high(client, incoming_user, radar_test_project):
    """The recurring build failure trap ranks high due to owner concentration and failure recurrence."""
    proj = radar_test_project
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    resp = client.get(f"/api/projects/{proj.id}/radar", cookies=cookies, headers=headers)
    assert resp.status_code == 200
    areas = resp.json()

    assert len(areas) >= 1
    # CI/CD pipeline should be among top ranked areas
    ci_area = next((a for a in areas if a["id"] == "ci_pipeline"), None)
    assert ci_area is not None
    assert ci_area["rank"] in (1, 2)
    assert ci_area["score"] >= 50.0  # High fragility score
    assert ci_area["breakdown"]["recurrence"]["score"] >= 18.0
    assert ci_area["severity"] in ("Critical", "Elevated")
    # Verify evidence citations contain the snippet
    assert any("recurring build failure" in e["content"] for e in ci_area["evidence"])

def test_radar_restricted_items_never_appear_for_lower_roles(client, approver_user, incoming_user, restricted_user, radar_test_project):
    """Restricted-only areas (e.g. Finance & Contractor Rates) must never appear for incoming or restricted roles."""
    proj = radar_test_project
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    res_cookies, res_headers = create_auth_headers_and_cookies(restricted_user)

    # 1. Approver sees the finance/contractor spend area
    app_resp = client.get(f"/api/projects/{proj.id}/radar", cookies=app_cookies, headers=app_headers)
    assert app_resp.status_code == 200
    app_areas = app_resp.json()
    assert any(a["id"] == "finance_contractor" for a in app_areas)

    # 2. Incoming user NEVER sees finance/contractor spend area
    inc_resp = client.get(f"/api/projects/{proj.id}/radar", cookies=inc_cookies, headers=inc_headers)
    assert inc_resp.status_code == 200
    inc_areas = inc_resp.json()
    assert not any(a["id"] == "finance_contractor" for a in inc_areas)
    # Check whole payload for any leak of contractor rate or salary
    inc_raw = inc_resp.text
    assert "$185" not in inc_raw
    assert "$14,200" not in inc_raw

    # 3. Restricted user NEVER sees finance/contractor spend area
    res_resp = client.get(f"/api/projects/{proj.id}/radar", cookies=res_cookies, headers=res_headers)
    assert res_resp.status_code == 200
    res_areas = res_resp.json()
    assert not any(a["id"] == "finance_contractor" for a in res_areas)
    assert "$185" not in res_resp.text

def test_radar_transparent_score_breakdown(client, incoming_user, radar_test_project):
    """Transparent score breakdown must match overall score and detail each component."""
    proj = radar_test_project
    cookies, headers = create_auth_headers_and_cookies(incoming_user)

    resp = client.get(f"/api/projects/{proj.id}/radar", cookies=cookies, headers=headers)
    assert resp.status_code == 200
    areas = resp.json()

    for a in areas:
        b = a["breakdown"]
        calc_sum = round(
            b["owner_concentration"]["score"] +
            b["recurrence"]["score"] +
            b["time_to_deadline"]["score"] +
            b["unresolved_status"]["score"],
            1
        )
        assert a["score"] == calc_sum
        assert b["owner_concentration"]["max"] == 30
        assert b["recurrence"]["max"] == 30
        assert b["time_to_deadline"]["max"] == 20
        assert b["unresolved_status"]["max"] == 20
        assert len(b["owner_concentration"]["explanation"]) > 5
