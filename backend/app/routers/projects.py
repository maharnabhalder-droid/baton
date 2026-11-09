import secrets
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, ProjectMember, ProjectInvite, User, AuditLog
from app.schemas import (
    ProjectCreate, ProjectResponse, ProjectMemberAdd, ProjectMemberResponse,
    ProjectInviteCreate, ProjectInviteResponse, ProjectJoinRequest
)
from app.dependencies import (
    get_current_user, get_project_member_context, require_role,
    ProjectMemberContext, require_csrf
)
from app.security import sanitize_text

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all()
    project_ids = [m.project_id for m in memberships]
    projects = db.query(Project).filter(Project.id.in_(project_ids)).all()
    return projects

@router.post("", response_model=ProjectResponse, dependencies=[Depends(require_csrf)])
def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_name = sanitize_text(payload.name)
    clean_desc = sanitize_text(payload.description)

    project = Project(
        name=clean_name,
        description=clean_desc,
        owner_id=user.id
    )
    db.add(project)
    db.flush()

    # Automatically add creator as approver member
    membership = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        role="approver"
    )
    db.add(membership)

    audit = AuditLog(
        user_id=user.id,
        project_id=project.id,
        action="create_project",
        resource_type="project",
        resource_id=project.id
    )
    db.add(audit)
    db.commit()
    db.refresh(project)
    return project

@router.post("/join", response_model=ProjectResponse, dependencies=[Depends(require_csrf)])
def join_project(
    payload: ProjectJoinRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_code = payload.code.strip()
    invite = db.query(ProjectInvite).filter(ProjectInvite.code == clean_code).first()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or non-existent invite code"
        )

    now = datetime.now(timezone.utc)
    if invite.expires_at and invite.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invite code has expired"
        )

    if invite.uses_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invite code has reached its maximum number of uses"
        )

    # Check if user is already a member
    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == invite.project_id, ProjectMember.user_id == user.id)
        .first()
    )
    if existing:
        return existing.project

    # Role is fixed by the invite!
    member = ProjectMember(
        project_id=invite.project_id,
        user_id=user.id,
        role=invite.role
    )
    db.add(member)
    invite.uses_count += 1
    db.commit()

    return db.query(Project).filter(Project.id == invite.project_id).first()

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    ctx: ProjectMemberContext = Depends(get_project_member_context)
):
    return ctx.project

@router.get("/{project_id}/members", response_model=List[ProjectMemberResponse])
def get_members(
    ctx: ProjectMemberContext = Depends(get_project_member_context),
    db: Session = Depends(get_db)
):
    members = (
        db.query(ProjectMember, User.email)
        .join(User, ProjectMember.user_id == User.id)
        .filter(ProjectMember.project_id == ctx.project.id)
        .all()
    )
    return [
        ProjectMemberResponse(
            id=m.ProjectMember.id,
            user_id=m.ProjectMember.user_id,
            email=m.email,
            role=m.ProjectMember.role,
            created_at=m.ProjectMember.created_at
        )
        for m in members
    ]

@router.post("/{project_id}/invites", response_model=ProjectInviteResponse, dependencies=[Depends(require_csrf)])
def create_invite(
    payload: ProjectInviteCreate,
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    code = secrets.token_urlsafe(16)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_hours)

    invite = ProjectInvite(
        project_id=ctx.project.id,
        code=code,
        role=payload.role,
        created_by=ctx.user.id,
        expires_at=expires_at,
        max_uses=payload.max_uses,
        uses_count=0
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite

@router.get("/{project_id}/invites", response_model=List[ProjectInviteResponse])
def list_invites(
    ctx: ProjectMemberContext = Depends(require_role(["approver"])),
    db: Session = Depends(get_db)
):
    invites = db.query(ProjectInvite).filter(ProjectInvite.project_id == ctx.project.id).all()
    return invites
