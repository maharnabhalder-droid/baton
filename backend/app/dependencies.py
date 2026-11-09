from typing import Optional, List
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db, set_rls_session_context
from app.models import User, Project, ProjectMember
from app.security import decode_token, verify_csrf_token

def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    # Check httpOnly cookie first, then fallback to Authorization header
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        return None

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        token_ver = payload.get("token_version")
        if token_ver is not None and token_ver != getattr(user, "token_version", 1):
            return None
        return user
    except Exception:
        return None

def get_current_user(
    request: Request,
    user: Optional[User] = Depends(get_current_user_optional)
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return user

def require_csrf(request: Request) -> None:
    """Enforces CSRF token check on state-changing requests."""
    verify_csrf_token(request)

class ProjectMemberContext:
    def __init__(self, project: Project, membership: ProjectMember, user: User):
        self.project = project
        self.membership = membership
        self.user = user
        self.role = membership.role

def get_project_member_context(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
) -> ProjectMemberContext:
    """
    Core BOLA guard: validates that the authenticated user is an active member
    of the target project and returns their project-scoped role context.
    Also primes PostgreSQL RLS session variables.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    # Check project membership
    membership = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )

    # If project owner, ensure approver membership
    if not membership and project.owner_id == user.id:
        membership = ProjectMember(project_id=project.id, user_id=user.id, role="approver")
        db.add(membership)
        db.commit()
        db.refresh(membership)

    if not membership:
        # BOLA protection: user cannot access projects they are not a member of
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you are not a member of this project"
        )

    # Configure session variables for Postgres RLS
    set_rls_session_context(db, user.id, membership.role)

    return ProjectMemberContext(project=project, membership=membership, user=user)

def require_role(allowed_roles: List[str]):
    def role_checker(ctx: ProjectMemberContext = Depends(get_project_member_context)) -> ProjectMemberContext:
        if ctx.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: role '{ctx.role}' does not have sufficient permission (requires: {allowed_roles})"
            )
        return ctx
    return role_checker

def can_user_view_access_level(role: str, access_level: str) -> bool:
    """
    Access Level Permissions:
    - approver: public, team, restricted
    - incoming: public, team
    - restricted: public only
    """
    if role == "approver":
        return True
    if role == "incoming":
        return access_level in ("public", "team")
    if role == "restricted":
        return access_level == "public"
    return False

