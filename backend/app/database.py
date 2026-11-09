from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=settings.DATABASE_CONNECT_ARGS,
    echo=False,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def set_rls_session_context(db: Session, user_id: str, role: str):
    """
    Sets Postgres per-request session variables for Row-Level Security (RLS).
    Ignored silently on SQLite.
    """
    if "postgresql" in settings.DATABASE_URL:
        try:
            db.execute(
                text("SET LOCAL app.user_id = :uid; SET LOCAL app.role = :role;"),
                {"uid": str(user_id), "role": str(role)}
            )
        except Exception:
            pass

