"""AZURA AQUA - FastAPI application."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.limiter import limiter
from app.core.config import get_settings
from app.core.database import init_db

settings = get_settings()

# CORS: restrict to frontend URL (security)
FRONTEND_URL = os.getenv("FRONTEND_URL", settings.frontend_url)

# Rate limiting (see app.core.limiter)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan: startup/shutdown."""
    # Check Ollama availability on startup
    if getattr(settings, "ollama_enabled", True):
        from app.services.ollama_service import get_ollama_service
        ollama = get_ollama_service()
        if not await ollama.check_available():
            import logging
            logging.getLogger("app").warning(
                "Ollama non accessible ou modèle non trouvé. "
                "Lancez: ollama serve && ollama pull mistral:7b"
            )
    yield
    # Shutdown: close engine if needed
    pass


app = FastAPI(
    title=settings.app_name,
    description="IA Finance / Estran / Achats",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter


def rate_limit_handler(request, exc: RateLimitExceeded):
    """Return HTTP 429 with clear French message when rate limit exceeded."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Trop de requêtes. Veuillez patienter avant de réessayer."},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
