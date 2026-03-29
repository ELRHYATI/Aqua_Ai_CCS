"""Audit logging for all endpoints. Never blocks the main request."""

import logging
from typing import Any, Optional

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


def _extract_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _extract_user_agent(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    ua = request.headers.get("user-agent")
    return (ua or "")[:500] if ua else None


async def log(
    user_id: Optional[str],
    action: str,
    module: str,
    details: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    status: str = "success",
    file_name: Optional[str] = None,
    file_size_kb: Optional[int] = None,
    chat_message: Optional[str] = None,
    chat_response_length: Optional[int] = None,
    duration_ms: Optional[int] = None,
) -> None:
    """
    Log an audit event. Never raises — wraps in try/except.
    Chat messages truncated to 500 chars.
    """
    try:
        ip_address = _extract_ip(request)
        user_agent = _extract_user_agent(request)
        chat_msg_truncated = (chat_message or "")[:500] if chat_message else None

        import json
        details_json = json.dumps(details) if details is not None else "null"

        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO audit_logs (
                        user_id, endpoint, query_text, response_length,
                        action, module, details, ip_address, user_agent,
                        duration_ms, file_name, file_size_kb,
                        chat_message, chat_response_length, status
                    ) VALUES (
                        :user_id, :endpoint, :query_text, :response_length,
                        :action, :module, CAST(:details AS jsonb), :ip_address, :user_agent,
                        :duration_ms, :file_name, :file_size_kb,
                        :chat_message, :chat_response_length, :status
                    )
                """),
                {
                    "user_id": user_id,
                    "endpoint": f"{module}/{action}",
                    "query_text": chat_msg_truncated,
                    "response_length": chat_response_length,
                    "action": action,
                    "module": module,
                    "details": details_json,
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                    "duration_ms": duration_ms,
                    "file_name": file_name,
                    "file_size_kb": file_size_kb,
                    "chat_message": chat_msg_truncated,
                    "chat_response_length": chat_response_length,
                    "status": status,
                },
            )
            await session.commit()
    except Exception as e:
        logger.exception("Audit log failed: %s", e)


async def log_chat_request(
    endpoint: str,
    query_text: Optional[str],
    ip_address: Optional[str],
    response_length: int,
    user_id: Optional[str] = None,
) -> None:
    """Legacy: Log a /chat request. Kept for backward compatibility during migration."""
    await log(
        user_id=str(user_id) if user_id else None,
        action="chat_message",
        module="chat",
        request=None,
        status="success",
        chat_message=query_text,
        chat_response_length=response_length,
    )
