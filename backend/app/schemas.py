import email_validator
email_validator.TEST_ENVIRONMENT = True

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

# User & Auth
class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100, default="Member")
    email: EmailStr
    password: str = Field(min_length=12)
    invite_code: Optional[str] = None  # Role is NEVER client-chosen; determined by invite code

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12)

class DemoLoginRequest(BaseModel):
    role: str = Field(default="incoming", pattern="^(approver|incoming|restricted)$")

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    mfa_enabled: bool
    needs_password_reset: bool
    is_demo: bool
    created_at: datetime

    class Config:
        from_attributes = True

class MFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_data_uri: str

class MFAVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)

# Project & Invites
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None

class ProjectInviteCreate(BaseModel):
    role: str = Field(default="incoming", pattern="^(incoming|restricted)$")
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_hours: int = Field(default=72, ge=1, le=720)

class ProjectInviteResponse(BaseModel):
    id: str
    code: str
    role: str
    expires_at: Optional[datetime]
    max_uses: int
    uses_count: int
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectJoinRequest(BaseModel):
    code: str = Field(min_length=6)

class ProjectMemberAdd(BaseModel):
    email: EmailStr
    role: str = Field(default="incoming", pattern="^(approver|incoming|restricted)$")

class ProjectMemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Snippets & Sources
class SnippetResponse(BaseModel):
    id: str
    source_id: str
    project_id: str
    content: str
    location: str
    author: str
    timestamp: str
    access_level: str
    created_at: datetime

    class Config:
        from_attributes = True

class SourceResponse(BaseModel):
    id: str
    project_id: str
    title: str
    access_level: str
    author: str
    original_filename: str
    file_type: str
    size_bytes: int
    snippets_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True

# Claims & Citations
class CitationResponse(BaseModel):
    id: str
    snippet_id: str
    quoted_text: str
    snippet: Optional[SnippetResponse] = None

    class Config:
        from_attributes = True

class ClaimHistoryResponse(BaseModel):
    id: str
    user_id: str
    action: str
    previous_state: Optional[str]
    new_state: str
    timestamp: datetime

    class Config:
        from_attributes = True

class ClaimResponse(BaseModel):
    id: str
    project_id: str
    claim_text: str
    status: str  # Verified, Inferred, Conflicting, Missing
    category: str
    confidence: float
    created_by: str
    review_status: str  # pending, approved, rejected
    citations: List[CitationResponse] = []
    history: List[ClaimHistoryResponse] = []
    is_redacted: bool = False
    restricted_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ClaimEditRequest(BaseModel):
    claim_text: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(Verified|Inferred|Conflicting|Missing)$")
    category: Optional[str] = None

class ClaimReviewAction(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    note: Optional[str] = None

# Gaps
class GapResponse(BaseModel):
    id: str
    project_id: str
    gap_type: str
    title: str
    description: str
    entity_id: Optional[str]
    answer: Optional[str]
    answered_by: Optional[str]
    answered_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

class GapAnswerRequest(BaseModel):
    answer: str = Field(min_length=2)

# Handover
class HandoverAckRequest(BaseModel):
    notes: Optional[str] = None
    score: Optional[float] = None
    missed_topics: Optional[List[str]] = None
    time_taken_seconds: Optional[int] = None
    rehearsal_attempt_id: Optional[str] = None

class HandoverAckResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    acknowledged_at: datetime
    notes: Optional[str]
    score: Optional[float] = None
    missed_topics: Optional[str] = None
    time_taken_seconds: Optional[int] = None
    completed_rehearsal: bool = False

    class Config:
        from_attributes = True

# Rehearsal Schemas
class RehearsalQuestion(BaseModel):
    id: str
    scenario: str
    claim_ids: List[str]
    category: str = "technical"
    guidance: Optional[str] = None

class RehearsalGenerateResponse(BaseModel):
    project_id: str
    attempt_id: str
    questions: List[RehearsalQuestion]
    status: str = "ready"  # ready | unavailable_no_claims | fallback_active
    message: Optional[str] = None

class RehearsalAnswerItem(BaseModel):
    question_id: str
    answer_text: str

class RehearsalSubmitRequest(BaseModel):
    attempt_id: str
    answers: List[RehearsalAnswerItem]
    time_taken_seconds: int = 0

class QuestionGrade(BaseModel):
    question_id: str
    score: float  # 0.0 to 1.0
    passed: bool
    feedback: str
    claim_ids: List[str]
    topic: str

class RehearsalResultResponse(BaseModel):
    attempt_id: str
    score: float
    passed: bool
    total_questions: int
    correct_count: int
    weak_topics: List[str]
    grades: List[QuestionGrade]
    time_taken_seconds: int

class WeakTopicItem(BaseModel):
    attempt_id: str
    user_id: str
    user_name: Optional[str] = None
    topic: str
    question_scenario: str
    claim_ids: List[str]
    submitted_answer: Optional[str] = None
    feedback: Optional[str] = None
    created_at: datetime

# Access Request Schemas
class AccessRequestCreate(BaseModel):
    claim_id: Optional[str] = None
    category: str = "restricted"
    reason: Optional[str] = Field(default=None, max_length=500)

class AccessRequestResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    claim_id: Optional[str] = None
    category: str
    reason: Optional[str] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None

    class Config:
        from_attributes = True

class HandoverSummaryResponse(BaseModel):
    project_id: str
    total_sources: int
    total_snippets: int
    total_claims: int
    claims_by_status: dict
    pending_gaps: int
    resolved_gaps: int
    acknowledgements: List[HandoverAckResponse] = []
