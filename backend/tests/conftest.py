import os
os.environ["TESTING"] = "1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import User, Project, ProjectMember
from app.security import hash_password, create_access_token, generate_csrf_token

# In-memory SQLite test database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def approver_user(db_session):
    user = User(
        email="approver@test.com",
        hashed_password=hash_password("ApproverStrongPass123!"),
        role="approver",
        mfa_enabled=False
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def incoming_user(db_session):
    user = User(
        email="incoming@test.com",
        hashed_password=hash_password("IncomingStrongPass123!"),
        role="incoming",
        mfa_enabled=False
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def restricted_user(db_session):
    user = User(
        email="restricted@test.com",
        hashed_password=hash_password("RestrictedStrongPass123!"),
        role="restricted",
        mfa_enabled=False
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def outsider_user(db_session):
    user = User(
        email="outsider@test.com",
        hashed_password=hash_password("OutsiderStrongPass123!"),
        role="incoming",
        mfa_enabled=False
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

def create_auth_headers_and_cookies(user: User):
    token = create_access_token({"sub": user.id, "role": user.role})
    csrf = generate_csrf_token()
    cookies = {"access_token": token, "csrf_token": csrf}
    headers = {"X-CSRF-Token": csrf}
    return cookies, headers
