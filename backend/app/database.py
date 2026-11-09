from sqlalchemy import create_engine, text, inspect
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

def apply_auto_migrations(target_engine):
    """
    Ensures newly added columns and constraints exist on the database.
    SQLAlchemy's create_all() skips existing tables, so this handles schema evolution automatically.
    """
    try:
        with target_engine.begin() as conn:
            inspector = inspect(conn)
            tables = inspector.get_table_names()
            if "users" in tables:
                columns = {c["name"] for c in inspector.get_columns("users")}
                if "name" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(255) DEFAULT 'Member';"))
                if "role" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'incoming';"))
                if "token_version" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;"))
                if "is_demo" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_demo BOOLEAN DEFAULT 0;"))
                if "needs_password_reset" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN needs_password_reset BOOLEAN DEFAULT 0;"))
                if "mfa_enabled" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT 0;"))
                if "mfa_secret" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(64);"))
    except Exception as e:
        print(f"[AutoMigration] Warning: Schema evolution check encountered: {e}")

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

