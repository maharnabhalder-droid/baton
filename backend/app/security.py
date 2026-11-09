import base64
import hmac
import io
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional

import jwt
import nh3
import pyotp
import qrcode
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

def get_client_ip(request: Request) -> str:
    """
    Retrieves the real client IP behind reverse proxies (Render / Vercel).
    Reads the first IP from X-Forwarded-For when present.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return client_ip
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"

# Rate Limiter (shared Redis in production, in-memory fallback for local development)
limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
)

# Password Hasher (Argon2id)
if os.getenv("TESTING") == "1":
    ph = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1, hash_len=16, salt_len=8)
else:
    ph = PasswordHasher(
        time_cost=2,
        memory_cost=65536,
        parallelism=2,
        hash_len=32,
        salt_len=16
    )

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False

# MFA Helpers
def generate_mfa_secret() -> str:
    return pyotp.random_base32()

def get_mfa_provisioning_uri(secret: str, email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="Baton Handover")

def generate_qr_code_data_uri(otpauth_url: str) -> str:
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"

def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

# JWT Tokens
def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "refresh", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str, is_refresh: bool = False) -> Dict[str, Any]:
    secret = settings.JWT_REFRESH_SECRET if is_refresh else settings.JWT_SECRET
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

# CSRF Token
def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)

def verify_csrf_token(request: Request, cookie_name: str = "csrf_token") -> None:
    # State-changing methods only
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        cookie_csrf = request.cookies.get(cookie_name)
        header_csrf = request.headers.get("X-CSRF-Token")
        if not cookie_csrf or not header_csrf or not hmac.compare_digest(cookie_csrf, header_csrf):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing or mismatch"
            )

# Input Sanitization
def sanitize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    # nh3.clean strips all dangerous HTML / JS tags while keeping clean plain text
    return nh3.clean(text, tags=set())

# File Upload Verification
ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".docx", ".csv", ".json"}

MAGIC_BYTE_SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".docx": [b"PK\x03\x04"],  # Standard zip header for docx
    ".json": [],  # Validated by JSON decoding
    ".csv": [],   # Validated by UTF-8 / text structure
    ".txt": [],
    ".md": [],
}

def validate_uploaded_file(filename: str, file_bytes: bytes) -> str:
    if len(file_bytes) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size ({settings.MAX_UPLOAD_BYTES // (1024*1024)}MB)"
        )
    
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' is not permitted. Allowed: {list(ALLOWED_EXTENSIONS)}"
        )
    
    # Magic bytes check
    expected_signatures = MAGIC_BYTE_SIGNATURES.get(ext, [])
    if expected_signatures:
        if not any(file_bytes.startswith(sig) for sig in expected_signatures):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File content does not match its claimed file extension signature"
            )
    else:
        # Check text / JSON validity
        try:
            file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File contains non-decodable binary data for expected text format"
            )

    # Return safe server-side filename (UUID + safe ext)
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    return safe_filename
