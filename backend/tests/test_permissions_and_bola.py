from app.models import Project, ProjectMember, Source, Snippet, Claim, ClaimCitation
from tests.conftest import create_auth_headers_and_cookies

def test_bola_prevented_outsider_cannot_access_project(client, approver_user, outsider_user, db_session):
    # 1. Approver creates project
    project = Project(name="Project Alpha", description="Confidential", owner_id=approver_user.id)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    m1 = ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver")
    db_session.add(m1)
    db_session.commit()

    # 2. Outsider tries to access project by ID
    outsider_cookies, outsider_headers = create_auth_headers_and_cookies(outsider_user)
    resp = client.get(f"/api/projects/{project.id}", cookies=outsider_cookies, headers=outsider_headers)
    assert resp.status_code == 403
    assert "not a member" in resp.json()["detail"]

def test_claim_visibility_filtering_by_evidence_access_level(
    client, approver_user, incoming_user, restricted_user, db_session
):
    """
    TEST THE CRITICAL SCOPE RULE:
    A claim is visible only if the viewer may see ALL of its evidence.
    """
    project = Project(name="Orbit Rover", description="Test", owner_id=approver_user.id)
    db_session.add(project)
    db_session.commit()

    # Add all 3 users as project members with respective roles
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver"),
        ProjectMember(project_id=project.id, user_id=incoming_user.id, role="incoming"),
        ProjectMember(project_id=project.id, user_id=restricted_user.id, role="restricted")
    ])
    db_session.commit()

    # Create 3 snippets with different access levels
    snip_public = Snippet(
        source_id="src-1",
        project_id=project.id,
        content="Public claim content: Rover operates on solar power.",
        location="p. 1",
        author="Lead",
        timestamp="2026-01-01",
        access_level="public"
    )
    snip_team = Snippet(
        source_id="src-2",
        project_id=project.id,
        content="Team claim content: Internal staging cluster uses port 8080.",
        location="p. 2",
        author="Lead",
        timestamp="2026-01-01",
        access_level="team"
    )
    snip_restricted = Snippet(
        source_id="src-3",
        project_id=project.id,
        content="Restricted claim content: Executive contractor hourly rate is $250.",
        location="p. 3",
        author="Finance",
        timestamp="2026-01-01",
        access_level="restricted"
    )
    db_session.add_all([snip_public, snip_team, snip_restricted])
    db_session.commit()

    # Create Claim 1: backed ONLY by Public snippet
    claim_public = Claim(
        project_id=project.id,
        claim_text="Rover is solar powered",
        status="Verified",
        category="technical",
        created_by=approver_user.id
    )
    # Create Claim 2: backed by Team snippet
    claim_team = Claim(
        project_id=project.id,
        claim_text="Staging runs on 8080",
        status="Verified",
        category="technical",
        created_by=approver_user.id
    )
    # Create Claim 3: backed by Restricted snippet
    claim_restricted = Claim(
        project_id=project.id,
        claim_text="Contractor rate is $250/hr",
        status="Verified",
        category="financial",
        created_by=approver_user.id
    )
    # Create Claim 4: backed by both Team AND Restricted snippets
    claim_mixed = Claim(
        project_id=project.id,
        claim_text="Mixed cluster expenditure",
        status="Verified",
        category="financial",
        created_by=approver_user.id
    )
    db_session.add_all([claim_public, claim_team, claim_restricted, claim_mixed])
    db_session.commit()

    # Add citations
    db_session.add_all([
        ClaimCitation(claim_id=claim_public.id, snippet_id=snip_public.id, quoted_text="solar power"),
        ClaimCitation(claim_id=claim_team.id, snippet_id=snip_team.id, quoted_text="port 8080"),
        ClaimCitation(claim_id=claim_restricted.id, snippet_id=snip_restricted.id, quoted_text="$250"),
        ClaimCitation(claim_id=claim_mixed.id, snippet_id=snip_team.id, quoted_text="staging cluster"),
        ClaimCitation(claim_id=claim_mixed.id, snippet_id=snip_restricted.id, quoted_text="hourly rate"),
    ])
    db_session.commit()

    # TEST APPROVER VIEW: Can view ALL 4 claims (has access to public, team, restricted)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    resp_app = client.get(f"/api/projects/{project.id}/claims", cookies=app_cookies, headers=app_headers)
    assert resp_app.status_code == 200
    claims_app = resp_app.json()
    assert len(claims_app) == 4

    # TEST INCOMING VIEW: Can view public and team claims (2 claims), CANNOT view restricted or mixed claims!
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    resp_inc = client.get(f"/api/projects/{project.id}/claims", cookies=inc_cookies, headers=inc_headers)
    assert resp_inc.status_code == 200
    claims_inc = resp_inc.json()
    assert len(claims_inc) == 2
    claim_ids_inc = [c["id"] for c in claims_inc]
    assert claim_public.id in claim_ids_inc
    assert claim_team.id in claim_ids_inc
    assert claim_restricted.id not in claim_ids_inc
    assert claim_mixed.id not in claim_ids_inc

    # TEST RESTRICTED VIEWER: Can view ONLY public claim (1 claim)
    res_cookies, res_headers = create_auth_headers_and_cookies(restricted_user)
    resp_res = client.get(f"/api/projects/{project.id}/claims", cookies=res_cookies, headers=res_headers)
    assert resp_res.status_code == 200
    claims_res = resp_res.json()
    assert len(claims_res) == 1
    assert claims_res[0]["id"] == claim_public.id

def test_server_side_role_enforcement_on_claim_review(client, approver_user, incoming_user, db_session):
    project = Project(name="RoboProject", description="Desc", owner_id=approver_user.id)
    db_session.add(project)
    db_session.commit()

    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=approver_user.id, role="approver"),
        ProjectMember(project_id=project.id, user_id=incoming_user.id, role="incoming")
    ])
    claim = Claim(project_id=project.id, claim_text="Test claim", status="Verified", created_by=approver_user.id)
    db_session.add(claim)
    db_session.commit()

    # Incoming user attempts to approve claim (Must be rejected with 403)
    inc_cookies, inc_headers = create_auth_headers_and_cookies(incoming_user)
    resp_inc = client.post(
        f"/api/projects/{project.id}/claims/{claim.id}/review",
        json={"action": "approve"},
        cookies=inc_cookies,
        headers=inc_headers
    )
    assert resp_inc.status_code == 403
    assert "Forbidden" in resp_inc.json()["detail"]

    # Approver approves claim (Must succeed)
    app_cookies, app_headers = create_auth_headers_and_cookies(approver_user)
    resp_app = client.post(
        f"/api/projects/{project.id}/claims/{claim.id}/review",
        json={"action": "approve", "note": "Verified against design docs"},
        cookies=app_cookies,
        headers=app_headers
    )
    assert resp_app.status_code == 200
    assert resp_app.json()["review_status"] == "approved"

