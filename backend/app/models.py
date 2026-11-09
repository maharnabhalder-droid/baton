import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, default="Member")
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="incoming")  # approver, incoming, restricted
    mfa_secret = Column(String(64), nullable=True)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    needs_password_reset = Column(Boolean, default=False, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")
    reviews = relationship("ClaimHistory", back_populates="user")

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    sources = relationship("Source", back_populates="project", cascade="all, delete-orphan")
    claims = relationship("Claim", back_populates="project", cascade="all, delete-orphan")
    gaps = relationship("Gap", back_populates="project", cascade="all, delete-orphan")
    acknowledgements = relationship("HandoverAck", back_populates="project", cascade="all, delete-orphan")
    invites = relationship("ProjectInvite", back_populates="project", cascade="all, delete-orphan")

class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False, default="incoming")  # approver, incoming, restricted
    created_at = Column(DateTime, default=utc_now, nullable=False)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="memberships")

class ProjectInvite(Base):
    __tablename__ = "project_invites"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    role = Column(String(50), nullable=False, default="incoming")  # incoming, restricted
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=True)
    max_uses = Column(Integer, default=1, nullable=False)
    uses_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    project = relationship("Project", back_populates="invites")

class Source(Base):
    __tablename__ = "sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    access_level = Column(String(20), nullable=False, default="team")  # public, team, restricted
    author = Column(String(255), nullable=False, default="Unknown")
    original_filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    project = relationship("Project", back_populates="sources")
    snippets = relationship("Snippet", back_populates="source", cascade="all, delete-orphan")

class Snippet(Base):
    __tablename__ = "snippets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_id = Column(String(36), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    location = Column(String(100), nullable=False)
    author = Column(String(255), nullable=False)
    timestamp = Column(String(100), nullable=False)
    access_level = Column(String(20), nullable=False, default="team")
    created_at = Column(DateTime, default=utc_now, nullable=False)

    source = relationship("Source", back_populates="snippets")
    citations = relationship("ClaimCitation", back_populates="snippet", cascade="all, delete-orphan")

class Claim(Base):
    __tablename__ = "claims"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    claim_text = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="Verified")  # Verified, Inferred, Conflicting, Missing
    category = Column(String(50), nullable=False, default="technical")
    confidence = Column(Float, nullable=False, default=1.0)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    review_status = Column(String(20), nullable=False, default="pending")  # pending, approved, rejected
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    project = relationship("Project", back_populates="claims")
    citations = relationship("ClaimCitation", back_populates="claim", cascade="all, delete-orphan")
    history = relationship("ClaimHistory", back_populates="claim", cascade="all, delete-orphan")

class ClaimCitation(Base):
    __tablename__ = "claim_citations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    claim_id = Column(String(36), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True)
    snippet_id = Column(String(36), ForeignKey("snippets.id", ondelete="CASCADE"), nullable=False, index=True)
    quoted_text = Column(Text, nullable=False)

    claim = relationship("Claim", back_populates="citations")
    snippet = relationship("Snippet", back_populates="citations")

class ClaimHistory(Base):
    __tablename__ = "claim_history"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    claim_id = Column(String(36), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    action = Column(String(50), nullable=False)
    previous_state = Column(Text, nullable=True)
    new_state = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=utc_now, nullable=False)

    claim = relationship("Claim", back_populates="history")
    user = relationship("User", back_populates="reviews")

class Gap(Base):
    __tablename__ = "gaps"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    gap_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    entity_id = Column(String(255), nullable=True)
    answer = Column(Text, nullable=True)
    answered_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    answered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    project = relationship("Project", back_populates="gaps")

class HandoverAck(Base):
    __tablename__ = "handover_acks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    acknowledged_at = Column(DateTime, default=utc_now, nullable=False)
    notes = Column(Text, nullable=True)

    project = relationship("Project", back_populates="acknowledgements")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    action = Column(String(50), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(String(36), nullable=False)
    timestamp = Column(DateTime, default=utc_now, nullable=False)
