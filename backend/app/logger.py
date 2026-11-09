import json
import logging
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_REGEX = re.compile(r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")
BEARER_REGEX = re.compile(r"Bearer\s+([A-Za-z0-9\-._~+/]+=*)", re.IGNORECASE)

SENSITIVE_KEYS = {
    "password", "hashed_password", "token", "access_token", "refresh_token",
    "csrf_token", "secret", "jwt_secret", "mfa_secret", "totp", "prompt",
    "snippet_text", "content", "quoted_text", "authorization"
}

def redact_sensitive(obj: Any) -> Any:
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                cleaned[k] = "[REDACTED]"
            else:
                cleaned[k] = redact_sensitive(v)
        return cleaned
    elif isinstance(obj, list):
        return [redact_sensitive(item) for item in obj]
    elif isinstance(obj, str):
        val = EMAIL_REGEX.sub("[EMAIL_REDACTED]", obj)
        val = PHONE_REGEX.sub("[PHONE_REDACTED]", val)
        val = BEARER_REGEX.sub("Bearer [TOKEN_REDACTED]", val)
        return val
    return obj

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive(record.getMessage()),
        }
        if hasattr(record, "props") and isinstance(record.props, dict):
            payload["props"] = redact_sensitive(record.props)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)

def setup_logger(name: str = "baton") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.propagate = False
    return logger

app_logger = setup_logger("baton.app")
audit_logger = setup_logger("baton.audit")

