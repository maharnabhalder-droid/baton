from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine, Base, apply_auto_migrations
from app.security import limiter
from app.routers import auth, projects, sources, claims, gaps, handovers, webhooks

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables & automatically apply schema migrations
    Base.metadata.create_all(bind=engine)
    apply_auto_migrations(engine)
    yield

app = FastAPI(
    title="Baton API",
    description="Evidence-backed knowledge handover platform",
    version="2.0.0",
    lifespan=lifespan
)

# SlowAPI Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration - strict explicit allowlist, credentials enabled, no wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-MFA-Code", "X-GitHub-Delivery", "X-Hub-Signature-256"],
)

# Strict HTTP Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), browsing-topics=()"
    if request.url.path.startswith("/api") and (
        "access_token" in request.cookies or "Authorization" in request.headers
    ):
        response.headers["Cache-Control"] = "private, no-store"
    return response

# Include Routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(sources.router)
app.include_router(claims.router)
app.include_router(gaps.router)
app.include_router(handovers.router)
app.include_router(webhooks.router)

@app.get("/healthz")
def healthz():
    return {"status": "healthy", "service": "baton-api"}

