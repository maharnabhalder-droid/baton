import os
from typing import List

class Settings:
    def __init__(self):
        self.ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
        db_url = os.getenv("DATABASE_URL", "sqlite:///./baton.db")
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        self.DATABASE_URL: str = db_url
        
        # Ensure SQLite handles threads properly in dev/test
        if self.DATABASE_URL.startswith("sqlite"):
            self.DATABASE_CONNECT_ARGS = {"check_same_thread": False}
        else:
            self.DATABASE_CONNECT_ARGS = {}

        # JWT & CSRF Secrets - enforce minimum 32 characters and reject CHANGE_ME
        self.JWT_SECRET: str = os.getenv(
            "JWT_SECRET", 
            "baton_super_secret_jwt_random_signing_key_32_bytes_min!"
        )
        self.JWT_REFRESH_SECRET: str = os.getenv(
            "JWT_REFRESH_SECRET",
            "baton_super_secret_refresh_signing_key_32_bytes_min!"
        )
        self.CSRF_SECRET: str = os.getenv(
            "CSRF_SECRET",
            "baton_super_secret_csrf_signing_key_32_bytes_min!"
        )
        
        for name, val in [
            ("JWT_SECRET", self.JWT_SECRET),
            ("JWT_REFRESH_SECRET", self.JWT_REFRESH_SECRET),
            ("CSRF_SECRET", self.CSRF_SECRET),
        ]:
            if not val or len(val) < 32 or val.startswith("CHANGE_ME"):
                raise RuntimeError(f"{name} must be set, at least 32 characters long, and cannot start with 'CHANGE_ME'.")

        self.JWT_ALGORITHM: str = "HS256"
        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
        self.REFRESH_TOKEN_EXPIRE_DAYS: int = 7

        # Rate Limiting Store (Redis for distributed multi-server, empty for in-memory fallback)
        self.REDIS_URL: str = os.getenv("REDIS_URL", "")

        # Origins & CORS
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.CORS_ORIGINS: List[str] = [origin.strip() for origin in frontend_url.split(",") if origin.strip()]

        # Third-party APIs & Webhooks
        self.GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
        self.GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "baton_github_webhook_hmac_secret_32_bytes!")
        self.GITHUB_PAT: str = os.getenv("GITHUB_PAT", "")

        # Upload limits
        self.UPLOAD_DIR: str = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads")))
        self.MAX_UPLOAD_BYTES: int = int(os.getenv("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))  # 10 MB default

        os.makedirs(self.UPLOAD_DIR, exist_ok=True)

settings = Settings()

