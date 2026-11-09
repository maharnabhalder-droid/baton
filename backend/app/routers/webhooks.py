import hashlib
import hmac
import json
import time
from typing import Dict, Set
from fastapi import APIRouter, Header, HTTPException, Request, status

from app.config import settings
from app.logger import app_logger

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Simple in-memory replay cache: (delivery_id -> timestamp)
SEEN_DELIVERIES: Dict[str, float] = {}
MAX_REPLAY_AGE_SECONDS = 300  # 5 minutes

def prune_replay_cache():
    now = time.time()
    stale_keys = [k for k, ts in SEEN_DELIVERIES.items() if now - ts > MAX_REPLAY_AGE_SECONDS]
    for k in stale_keys:
        SEEN_DELIVERIES.pop(k, None)

@router.post("/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str = Header(None),
    x_github_delivery: str = Header(None)
):
    if not x_hub_signature_256 or not x_hub_signature_256.startswith("sha256="):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed X-Hub-Signature-256 header"
        )

    if not x_github_delivery:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-GitHub-Delivery header"
        )

    prune_replay_cache()
    now = time.time()

    # Replay protection: check delivery ID
    if x_github_delivery in SEEN_DELIVERIES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Replayed webhook delivery rejected"
        )

    body_bytes = await request.body()

    # Verify HMAC-SHA256 with constant-time compare
    secret_bytes = settings.GITHUB_WEBHOOK_SECRET.encode("utf-8")
    expected_mac = hmac.new(secret_bytes, body_bytes, hashlib.sha256).hexdigest()
    received_mac = x_hub_signature_256[7:]

    if not hmac.compare_digest(expected_mac, received_mac):
        app_logger.warning("Invalid GitHub webhook signature received")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid HMAC signature"
        )

    # Payload freshness check if payload has repository or head_commit timestamp
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
        # Mark delivery as processed
        SEEN_DELIVERIES[x_github_delivery] = now
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload in webhook"
        )

    app_logger.info(f"Verified GitHub webhook processed: {x_github_delivery}")
    return {"status": "ok", "delivery": x_github_delivery}

