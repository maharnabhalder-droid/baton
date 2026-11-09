import os
import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Project, ProjectMember, ProjectInvite, AuditLog
from app.schemas import (
    UserRegister, UserLogin, UserResponse, MFASetupResponse, MFAVerifyRequest,
    PasswordChangeRequest, DemoLoginRequest
)
from app.security import (
    limiter, hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, generate_mfa_secret,
    get_mfa_provisioning_uri, generate_qr_code_data_uri, verify_totp,
    generate_csrf_token, sanitize_text
)
from app.dependencies import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/auth", tags=["auth"])

def set_auth_cookies(response: Response, user: User, is_secure: bool = False) -> str:
    ver = getattr(user, "token_version", 1) or 1
    access_token = create_access_token({"sub": user.id, "role": user.role, "token_version": ver})
    refresh_token = create_refresh_token({"sub": user.id, "token_version": ver})
    csrf_token = generate_csrf_token()

    # Access Token (15m)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",  # Rewrites proxy through frontend origin, lax allows reliable navigations
        max_age=15 * 60,
        path="/"
    )

    # Refresh Token (7d)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/api/auth/refresh"
    )

    # CSRF Token (Readable by frontend to send in X-CSRF-Token header)
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=is_secure,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/"
    )

    return csrf_token

@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
def register(
    request: Request,
    response: Response,
    payload: UserRegister,
    db: Session = Depends(get_db)
):
    # Enforce minimum 12 chars password
    if len(payload.password) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 12 characters long"
        )

    clean_email = sanitize_text(payload.email.lower().strip())
    clean_name = sanitize_text(payload.name.strip() or "Member")

    # Prevent user enumeration: generic error message if email already exists
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to complete registration with the provided details. Please verify your email or sign in."
        )

    # Role is NEVER client-chosen. Default is incoming unless joining via valid invite.
    assigned_role = "incoming"
    target_project_id = None

    if payload.invite_code:
        invite = (
            db.query(ProjectInvite)
            .filter(ProjectInvite.code == payload.invite_code.strip())
            .first()
        )
        if invite:
            now = datetime.now(timezone.utc)
            if (not invite.expires_at or invite.expires_at > now) and invite.uses_count < invite.max_uses:
                assigned_role = invite.role
                target_project_id = invite.project_id
                invite.uses_count += 1

    user = User(
        name=clean_name,
        email=clean_email,
        hashed_password=hash_password(payload.password),
        role=assigned_role,
        needs_password_reset=False,
        is_demo=False
    )
    db.add(user)
    db.flush()

    if target_project_id:
        member = ProjectMember(
            project_id=target_project_id,
            user_id=user.id,
            role=assigned_role
        )
        db.add(member)

    db.commit()
    db.refresh(user)

    is_production = os.getenv("ENVIRONMENT") == "production"
    set_auth_cookies(response, user, is_secure=is_production)
    return user

@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    payload: UserLogin,
    db: Session = Depends(get_db)
):
    clean_email = sanitize_text(payload.email.lower().strip())
    user = db.query(User).filter(User.email == clean_email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # MFA requirement: approver requires MFA UNLESS flagged as demo user
    if user.role == "approver" and not user.is_demo and user.mfa_enabled:
        otp_code = request.headers.get("X-MFA-Code")
        if not otp_code or not verify_totp(user.mfa_secret, otp_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA verification required for approver role"
            )

    is_production = os.getenv("ENVIRONMENT") == "production"
    csrf_token = set_auth_cookies(response, user, is_secure=is_production)

    audit = AuditLog(
        user_id=user.id,
        action="login",
        resource_type="auth",
        resource_id=user.id
    )
    db.add(audit)
    db.commit()

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
            "needs_password_reset": user.needs_password_reset,
            "is_demo": user.is_demo
        },
        "csrf_token": csrf_token
    }

@router.post("/demo")
@limiter.limit("10/minute")
def try_demo(
    request: Request,
    response: Response,
    payload: DemoLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Creates an ephemeral demo user joined to the Orbit Robotics project.
    Demo users are MFA-exempt and strictly bound to the demo dataset.
    """
    target_role = payload.role if payload.role in ("approver", "incoming", "restricted") else "incoming"

    # Find Orbit Robotics project
    project = db.query(Project).filter(Project.name.like("%Orbit Robotics%")).first()
    if not project:
        # Fallback to first project or auto-create demo project
        project = db.query(Project).first()
        if not project:
            from seed import seed_orbit_robotics
            seed_orbit_robotics()
            project = db.query(Project).filter(Project.name.like("%Orbit Robotics%")).first()

    unique_suffix = uuid.uuid4().hex[:6]
    demo_email = f"demo.{target_role}.{unique_suffix}@demo.orbitrobotics.io"
    demo_name = f"Demo {target_role.capitalize()} ({unique_suffix})"
    random_pwd = secrets.token_urlsafe(16)

    demo_user = User(
        name=demo_name,
        email=demo_email,
        hashed_password=hash_password(random_pwd),
        role=target_role,
        mfa_enabled=False,
        needs_password_reset=False,
        is_demo=True
    )
    db.add(demo_user)
    db.flush()

    if project:
        member = ProjectMember(
            project_id=project.id,
            user_id=demo_user.id,
            role=target_role
        )
        db.add(member)

    db.commit()
    db.refresh(demo_user)

    is_production = os.getenv("ENVIRONMENT") == "production"
    csrf_token = set_auth_cookies(response, demo_user, is_secure=is_production)

    return {
        "message": "Demo session initialized",
        "project_id": project.id if project else None,
        "user": {
            "id": demo_user.id,
            "name": demo_user.name,
            "email": demo_user.email,
            "role": demo_user.role,
            "mfa_enabled": demo_user.mfa_enabled,
            "needs_password_reset": demo_user.needs_password_reset,
            "is_demo": True
        },
        "csrf_token": csrf_token
    }

@router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    if len(payload.new_password) < 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 12 characters long"
        )

    user.hashed_password = hash_password(payload.new_password)
    user.needs_password_reset = False
    user.token_version = getattr(user, "token_version", 1) + 1
    db.commit()
    return {"message": "Password changed successfully"}

@router.post("/mfa/setup", response_model=MFASetupResponse)
def setup_mfa(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    secret = generate_mfa_secret()
    user.mfa_secret = secret
    db.commit()

    otpauth_url = get_mfa_provisioning_uri(secret, user.email)
    qr_data_uri = generate_qr_code_data_uri(otpauth_url)

    return MFASetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        qr_data_uri=qr_data_uri
    )

@router.post("/mfa/verify")
@limiter.limit("5/minute")
def verify_mfa(
    request: Request,
    payload: MFAVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.mfa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA setup has not been initiated"
        )

    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid MFA code"
        )

    user.mfa_enabled = True
    db.commit()
    return {"message": "MFA enabled successfully"}

@router.post("/refresh")
def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token_cookie = request.cookies.get("refresh_token")
    if not refresh_token_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    payload = decode_token(refresh_token_cookie, is_refresh=True)
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    token_ver = payload.get("token_version")
    if token_ver is not None and token_ver != getattr(user, "token_version", 1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or was revoked"
        )

    is_production = os.getenv("ENVIRONMENT") == "production"
    csrf_token = set_auth_cookies(response, user, is_secure=is_production)
    return {"message": "Token refreshed successfully", "csrf_token": csrf_token}

@router.post("/logout")
def logout(
    response: Response,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    if user:
        user.token_version = getattr(user, "token_version", 1) + 1
        db.commit()
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    response.delete_cookie("csrf_token", path="/")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user
