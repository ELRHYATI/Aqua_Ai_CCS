"""Login, first-time setup, and token issuance."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, SetupRequest, TokenResponse
from app.services.audit_service import log

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(User).where(func.lower(User.email) == body.email.strip().lower())
    )
    user = r.scalar_one_or_none()
    if not user or not user.is_active:
        background_tasks.add_task(
            log,
            user_id=None,
            action="login_attempt",
            module="auth",
            details={"email": body.email, "reason": "unknown_user"},
            request=request,
            status="failed",
        )
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.password_hash or not verify_password(body.password, user.password_hash):
        background_tasks.add_task(
            log,
            user_id=str(user.id),
            action="login_attempt",
            module="auth",
            details={"email": body.email, "reason": "bad_password_or_no_password"},
            request=request,
            status="failed",
        )
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    background_tasks.add_task(
        log,
        user_id=str(user.id),
        action="login_attempt",
        module="auth",
        details={"email": user.email},
        request=request,
        status="success",
    )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.post("/setup", response_model=TokenResponse)
async def setup_first_admin(
    body: SetupRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Create the first admin user when the users table is empty. Disabled once any user exists."""
    cnt = await db.scalar(select(func.count()).select_from(User))
    if cnt and cnt > 0:
        raise HTTPException(status_code=403, detail="L'application est déjà initialisée")

    email = body.email.strip().lower()
    u = User(
        full_name=body.full_name.strip(),
        email=email,
        role="admin",
        password_hash=hash_password(body.password),
        can_export_pdf=True,
        can_upload_files=True,
        can_use_chatbot=True,
        can_view_finance=True,
        can_view_estran=True,
        can_view_achat=True,
        can_run_ml=True,
        can_manage_users=True,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)

    background_tasks.add_task(
        log,
        user_id=str(u.id),
        action="first_setup",
        module="auth",
        details={"email": u.email},
        request=request,
        status="success",
    )

    token = create_access_token(u.id)
    return TokenResponse(
        access_token=token,
        user_id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
    )
