"""Chat API endpoints - Ollama (mistral:7b) for chat, analysis, and PDF reports."""

import re
import time
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_can_export_pdf, require_can_use_chatbot
from app.core.database import get_chatbot_db
from app.models.user import User
from app.core.config import get_settings
from app.core.limiter import limiter
from app.schemas.chat import (
    ChatMessage,
    ChatResponse,
    ChatAnalyzeRequest,
    ChatAnalyzeResponse,
    ChatReportRequest,
)
from app.services.ollama_service import (
    get_ollama_service,
    fetch_context_for_message,
)
from app.services.pdf_report_service import markdown_to_pdf, REPORTS_DIR
from app.services.audit_service import log
from app.middleware.chat_security import sanitize_chat_input, filter_chat_output

router = APIRouter(prefix="/chat", tags=["chat"])


def _get_client_ip(request: Request) -> str | None:
    """Get client IP from request headers (proxy-safe)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _slug(text: str) -> str:
    """Create filename-safe slug from text."""
    s = re.sub(r"[^\w\s-]", "", text.lower())[:40]
    return re.sub(r"[-\s]+", "_", s).strip("_") or "report"


@router.get("/config")
async def get_chat_config():
    """Returns chat config. preferBackend=true so frontend always uses backend (Ollama)."""
    return {"preferBackend": True}


@router.get("/status")
async def get_chat_status():
    """Lightweight ping to check if Ollama is reachable. Returns within 500ms."""
    import httpx
    s = get_settings()
    url = (getattr(s, "ollama_url", None) or getattr(s, "ollama_base_url", None) or "http://localhost:11434").rstrip("/")
    model = getattr(s, "ollama_model", None) or "mistral:7b"
    try:
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=0.5) as client:
            r = await client.get(f"{url}/api/tags")
            latency = int((time.perf_counter() - t0) * 1000)
            return {"ollama_online": r.status_code == 200, "model": model, "latency_ms": latency}
    except Exception:
        return {"ollama_online": False, "model": model, "latency_ms": -1}


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
async def post_chat(
    message: ChatMessage,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_chatbot_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Chatbot popup - Ollama with real data context. # TODO: replace with Azure OpenAI when ready"""
    require_can_use_chatbot(current_user)
    t0 = time.perf_counter()
    sanitized = sanitize_chat_input(message.message)
    if not sanitized:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "chat_blocked", "chat", {"reason": "empty or invalid input"}, request, "blocked")
        return ChatResponse(
            response="Veuillez poser une question sur Estran, Finance ou Achats.",
            citations=[],
        )

    context, data_sources, gl_instruction = await fetch_context_for_message(db, sanitized)
    ollama = get_ollama_service()
    reply = await ollama.chat(sanitized, context, instruction_override=gl_instruction)
    safe_reply = filter_chat_output(reply)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    background_tasks.add_task(
        log,
        str(current_user.id) if current_user else None,
        "chat_message",
        "chat",
        None,
        request,
        "success",
        chat_message=sanitized[:500],
        chat_response_length=len(safe_reply),
        duration_ms=duration_ms,
    )

    return ChatResponse(response=safe_reply, citations=["Ollama"], data_used=data_sources)


@router.post("/analyze", response_model=ChatAnalyzeResponse)
@limiter.limit("10/minute")
async def post_chat_analyze(
    body: ChatAnalyzeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_chatbot_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Deep analysis mode - longer structured response."""
    require_can_use_chatbot(current_user)
    t0 = time.perf_counter()
    sanitized = sanitize_chat_input(body.message)
    if not sanitized:
        return ChatAnalyzeResponse(
            response="Veuillez poser une question d'analyse.",
            data_used=[],
            model="mistral:7b",
            timestamp=datetime.now().isoformat(),
        )

    context, data_sources, _ = await fetch_context_for_message(db, sanitized, include_all=body.include_data)
    ollama = get_ollama_service()
    reply = await ollama.analyze(sanitized, context)
    safe_reply = filter_chat_output(reply)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    background_tasks.add_task(
        log,
        str(current_user.id) if current_user else None,
        "chat_message",
        "chat",
        None,
        request,
        "success",
        chat_message=sanitized[:500],
        chat_response_length=len(safe_reply),
        duration_ms=duration_ms,
    )

    return ChatAnalyzeResponse(
        response=safe_reply,
        data_used=data_sources,
        model="mistral:7b",
        timestamp=datetime.now().isoformat(),
    )


@router.post("/report")
@limiter.limit("5/minute")
async def post_chat_report(
    body: ChatReportRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_chatbot_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Generate PDF report from Ollama. Returns file download and saves to backend/reports/."""
    require_can_export_pdf(current_user)
    t0 = time.perf_counter()
    sanitized = sanitize_chat_input(body.message)
    if not sanitized:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Message requis")

    context, data_sources, _ = await fetch_context_for_message(db, sanitized, include_all=True)
    ollama = get_ollama_service()
    markdown_content = await ollama.generate_report(sanitized, context)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = _slug(body.title or body.message)
    filename = f"report_{ts}_{slug}.pdf"
    output_path = REPORTS_DIR / filename

    markdown_to_pdf(
        markdown_content=markdown_content,
        title=body.title or "Rapport Azura Aqua",
        data_sources=data_sources or ["estran_records", "finance_lines", "purchase_da", "purchase_bc"],
        output_path=output_path,
    )
    duration_ms = int((time.perf_counter() - t0) * 1000)
    background_tasks.add_task(
        log,
        str(current_user.id) if current_user else None,
        "chat_report_generated",
        "chat",
        {"file_name": filename},
        request,
        "success",
        file_name=filename,
        duration_ms=duration_ms,
    )

    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports")
async def get_chat_reports():
    """List saved reports from backend/reports/."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(REPORTS_DIR.glob("report_*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
        stat = f.stat()
        files.append({
            "filename": f.name,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "size_kb": round(stat.st_size / 1024, 1),
        })
    return {"reports": files}


@router.get("/reports/{filename:path}")
async def get_chat_report_download(filename: str):
    """Download a saved report by filename."""
    # Security: only allow report_*.pdf filenames
    if not filename.startswith("report_") or not filename.endswith(".pdf"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = REPORTS_DIR / filename
    if not filepath.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
