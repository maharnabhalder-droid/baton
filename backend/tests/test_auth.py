import pyotp
from app.models import User, Project
from tests.conftest import create_auth_headers_and_cookies

def test_user_registration_and_login(client):
    reg_resp = client.post(
        "/api/auth/register",
        json={"name": "Alice", "email": "newuser@example.com", "password": "SecurePassword123!"}
    )
    assert reg_resp.status_code == 200
    data = reg_resp.json()
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "incoming"
    assert data["name"] == "Alice"

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "newuser@example.com", "password": "SecurePassword123!"}
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.cookies
    assert "csrf_token" in login_resp.cookies
    assert login_resp.json()["csrf_token"] != ""

def test_register_no_role_escalation(client):
    """Client cannot escalate role by supplying role in registration payload."""
    resp = client.post(
        "/api/auth/register",
        json={
            "name": "Attacker",
            "email": "attacker@example.com",
            "password": "SecurePassword123!",
            "role": "approver"  # Attempt to escalate
        }
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "incoming"  # Role escalation blocked

def test_register_no_enumeration(client):
    """Registering duplicate email yields generic error without leaking account presence."""
    client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "SecurePassword123!"}
    )
    # Second registration with same email
    resp = client.post(
        "/api/auth/register",
        json={"name": "Bob", "email": "bob@example.com", "password": "SecurePassword123!"}
    )
    assert resp.status_code == 400
    # Must NOT say "email already registered"
    assert "already exists" not in resp.json()["detail"].lower()
    assert "Unable to complete registration" in resp.json()["detail"]

def test_logout_clears_cookies(client, approver_user):
    cookies, headers = create_auth_headers_and_cookies(approver_user)
    resp = client.post("/api/auth/logout", cookies=cookies, headers=headers)
    assert resp.status_code == 200
    # Check that cookies are deleted / set empty
    cookie_headers = [v for k, v in resp.headers.items() if k.lower() == "set-cookie"]
    assert any("access_token=\"\"" in c or "Max-Age=0" in c or "expires=" in c.lower() for c in cookie_headers)

def test_logout_invalidates_copied_token(client, approver_user):
    """Server-side session invalidation: token copied before logout is rejected afterwards."""
    cookies, headers = create_auth_headers_and_cookies(approver_user)
    # 1. Copied token works prior to logout
    copied_cookies = dict(cookies)
    me_resp_before = client.get("/api/auth/me", cookies=copied_cookies, headers=headers)
    assert me_resp_before.status_code == 200

    # 2. Perform logout (bumps token_version on server)
    logout_resp = client.post("/api/auth/logout", cookies=copied_cookies, headers=headers)
    assert logout_resp.status_code == 200

    # 3. Subsequent request with pre-logout copied token must be rejected
    me_resp_after = client.get("/api/auth/me", cookies=copied_cookies, headers=headers)
    assert me_resp_after.status_code == 401

def test_demo_isolation_and_mfa_exemption(client, db_session):
    # 1. Create a dummy Orbit Robotics project
    proj = Project(name="Orbit Robotics Core Platform", description="Demo Project", owner_id="owner-id")
    db_session.add(proj)
    db_session.commit()

    # 2. Request demo session as approver
    resp = client.post("/api/auth/demo", json={"role": "approver"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["is_demo"] is True
    assert data["user"]["role"] == "approver"
    assert "demo.approver." in data["user"]["email"]
    assert data["project_id"] == proj.id

    # 3. Demo users are authenticated immediately without MFA blocking
    assert "access_token" in resp.cookies

def test_login_invalid_credentials(client, approver_user):
    resp = client.post(
        "/api/auth/login",
        json={"email": approver_user.email, "password": "WrongPassword!"}
    )
    assert resp.status_code == 401
    assert "Invalid credentials" in resp.json()["detail"]

def test_mfa_setup_and_verification(client, approver_user, db_session):
    cookies, headers = create_auth_headers_and_cookies(approver_user)

    setup_resp = client.post("/api/auth/mfa/setup", cookies=cookies, headers=headers)
    assert setup_resp.status_code == 200
    data = setup_resp.json()
    secret = data["secret"]
    assert len(secret) >= 16
    assert data["qr_data_uri"].startswith("data:image/png;base64,")

    totp = pyotp.TOTP(secret)
    valid_code = totp.now()

    verify_resp = client.post(
        "/api/auth/mfa/verify",
        json={"code": valid_code},
        cookies=cookies,
        headers=headers
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["message"] == "MFA enabled successfully"

    db_session.refresh(approver_user)
    assert approver_user.mfa_enabled is True

def test_csrf_protection_on_state_change(client, approver_user):
    cookies, headers = create_auth_headers_and_cookies(approver_user)
    bad_headers = {}
    resp = client.post(
        "/api/projects",
        json={"name": "Attacker Project", "description": "CSRF exploit"},
        cookies=cookies,
        headers=bad_headers
    )
    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]
