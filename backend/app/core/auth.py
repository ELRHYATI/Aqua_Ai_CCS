"""Auth and privilege dependencies."""

from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Resolve current user: JWT Bearer when auth enabled; X-User-Id when auth_disabled (dev)."""
    settings = get_settings()
    if settings.auth_disabled:
        user_id_str = request.headers.get("x-user-id")
        if user_id_str:
            try:
                uid = UUID(user_id_str)
                r = await db.execute(select(User).where(User.id == uid, User.is_active == True))
                u = r.scalar_one_or_none()
                return u
            except (ValueError, TypeError):
                pass
        return None

    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        uid = decode_access_token(token)
        if uid:
            r = await db.execute(select(User).where(User.id == uid, User.is_active == True))
            return r.scalar_one_or_none()
    return None


def require_can_use_chatbot(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.can_use_chatbot)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_export_pdf(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.can_export_pdf)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_upload_files(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.can_upload_files)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def _allow_no_auth() -> bool:
    return get_settings().auth_disabled


def require_can_view_finance(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.department == "finance") or (user and user.can_view_finance)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_view_estran(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.department == "estran") or (user and user.can_view_estran)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_view_achat(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.department == "achat") or (user and user.can_view_achat)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_run_ml(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.can_run_ml)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_admin(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    if not (user and user.role == "admin"):
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")


def require_can_manage_users(user: Optional[User]) -> None:
    if _allow_no_auth() and user is None:
        return
    ok = (user and user.role == "admin") or (user and user.can_manage_users)
    if not ok:
        raise HTTPException(status_code=403, detail="Vous n'avez pas les droits pour effectuer cette action")
