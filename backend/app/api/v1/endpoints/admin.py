"""Admin endpoints: users, privileges, audit."""

from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_admin
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User
from app.schemas.admin import UserCreate, UserResponse, UserUpdate, UserPrivileges
from app.services.audit_service import log

router = APIRouter(prefix="/admin", tags=["admin"])


def _user_to_response(u: User) -> UserResponse:
    return UserResponse(
        id=u.id,
        full_name=u.full_name,
        email=u.email,
        role=u.role,
        department=u.department,
        is_active=u.is_active,
        can_export_pdf=u.can_export_pdf,
        can_upload_files=u.can_upload_files,
        can_use_chatbot=u.can_use_chatbot,
        can_view_finance=u.can_view_finance,
        can_view_estran=u.can_view_estran,
        can_view_achat=u.can_view_achat,
        can_run_ml=u.can_run_ml,
        can_manage_users=u.can_manage_users,
        notes=u.notes,
    )


@router.post("/users", response_model=UserResponse)
async def create_user(
    payload: UserCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Create a new user. Requires role admin."""
    require_admin(current_user)

    r = await db.execute(select(User).where(User.email == payload.email))
    if r.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un utilisateur avec cet email existe déjà")

    u = User(
        full_name=payload.full_name,
        email=payload.email,
        role=payload.role,
        department=payload.department,
        can_export_pdf=payload.can_export_pdf,
        can_upload_files=payload.can_upload_files,
        can_use_chatbot=payload.can_use_chatbot,
        can_view_finance=payload.can_view_finance,
        can_view_estran=payload.can_view_estran,
        can_view_achat=payload.can_view_achat,
        can_run_ml=payload.can_run_ml,
        can_manage_users=payload.can_manage_users,
        notes=payload.notes,
    )
    db.add(u)
    await db.flush()
    await db.refresh(u)

    background_tasks.add_task(
        log,
        user_id=str(current_user.id) if current_user else None,
        action="user_created",
        module="admin",
        details={"new_user_email": payload.email, "role": payload.role, "department": payload.department},
        request=request,
        status="success",
    )
    return _user_to_response(u)


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """List all users. Requires role admin."""
    require_admin(current_user)
    r = await db.execute(select(User).order_by(User.email))
    return [_user_to_response(u) for u in r.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Update a user. Requires role admin."""
    require_admin(current_user)

    r = await db.execute(select(User).where(User.id == user_id))
    u = r.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    update_data = payload.model_dump(exclude_unset=True)
    new_password = update_data.pop("password", None)
    if new_password:
        u.password_hash = hash_password(new_password)
    if "email" in update_data and update_data["email"]:
        update_data["email"] = str(update_data["email"]).strip().lower()
    change_keys = list(update_data.keys())
    if new_password:
        change_keys.append("password")
    for k, v in update_data.items():
        setattr(u, k, v)
    await db.flush()
    await db.refresh(u)

    background_tasks.add_task(
        log,
        user_id=str(current_user.id) if current_user else None,
        action="user_updated",
        module="admin",
        details={"target_user_email": u.email, "changes": change_keys},
        request=request,
        status="success",
    )
    return _user_to_response(u)


@router.post("/users/{user_id}/privileges", response_model=UserResponse)
async def update_user_privileges(
    user_id: UUID,
    payload: UserPrivileges,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Update only privileges for a user. Logs changes in activity_logs."""
    require_admin(current_user)

    r = await db.execute(select(User).where(User.id == user_id))
    u = r.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    changes: list[str] = []
    priv_fields = [
        "can_export_pdf", "can_upload_files", "can_use_chatbot",
        "can_view_finance", "can_view_estran", "can_view_achat",
        "can_run_ml", "can_manage_users",
    ]
    for f in priv_fields:
        v = getattr(payload, f)
        if v is not None:
            old = getattr(u, f)
            if old != v:
                changes.append(f"{f}: {old} → {v}")
                setattr(u, f, v)

    await db.flush()
    await db.refresh(u)

    if changes:
        background_tasks.add_task(
            log,
            user_id=str(current_user.id) if current_user else None,
            action="user_privileges_changed",
            module="admin",
            details={"target_user_email": u.email, "changes": changes},
            request=request,
            status="success",
        )
    return _user_to_response(u)


# --- Admin Stats ---

@router.get("/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Live admin stats for the admin dashboard header."""
    require_admin(current_user)
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    active_users = await db.execute(select(func.count()).select_from(User).where(User.is_active == True))
    total_active = active_users.scalar() or 0

    today_actions = await db.execute(text(
        "SELECT COUNT(*) FROM audit_logs WHERE timestamp >= :ts"
    ), {"ts": today_start})
    actions_today = today_actions.scalar() or 0

    failed_1h = await db.execute(text(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'login_attempt' AND status = 'failed' AND timestamp >= :ts"
    ), {"ts": now - timedelta(hours=1)})
    alerts_active = failed_1h.scalar() or 0

    return {
        "active_users": total_active,
        "active_sessions": 0,
        "actions_today": actions_today,
        "alerts_active": alerts_active,
    }


# --- Audit API ---

@router.get("/audit")
async def get_audit_logs(
    user_id: Optional[UUID] = Query(None),
    module: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Get paginated audit logs. Requires admin."""
    require_admin(current_user)

    uid_str = str(user_id) if user_id else None
    conditions = []
    params: dict[str, Any] = {}

    if uid_str:
        conditions.append("a.user_id = :user_id")
        params["user_id"] = uid_str
    if module:
        conditions.append("a.module = :module")
        params["module"] = module
    if action:
        conditions.append("a.action ILIKE :action")
        params["action"] = f"%{action}%"
    if status:
        conditions.append("a.status = :status")
        params["status"] = status
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            params["date_from"] = dt_from
            conditions.append("a.timestamp >= :date_from")
        except (ValueError, TypeError):
            pass
    if date_to:
        try:
            dt_to_str = date_to + " 23:59:59" if len(date_to) <= 10 else date_to
            dt_to = datetime.fromisoformat(dt_to_str.replace("Z", "+00:00"))
            params["date_to"] = dt_to
            conditions.append("a.timestamp <= :date_to")
        except (ValueError, TypeError):
            pass
    if search:
        conditions.append("(a.chat_message ILIKE :search OR CAST(a.details AS text) ILIKE :search)")
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions) if conditions else "1=1"

    count_sql = text(f"""
        SELECT COUNT(*) FROM audit_logs a
        WHERE {where}
    """)
    r_count = await db.execute(count_sql, params)
    total = r_count.scalar() or 0

    params_items = {**params, "limit": page_size, "offset": (page - 1) * page_size}
    items_sql = text(f"""
        SELECT a.id, a.timestamp, a.user_id, a.action, a.module, a.status,
               a.ip_address, a.file_name, a.chat_message, a.duration_ms, a.details,
               u.full_name, u.email
        FROM audit_logs a
        LEFT JOIN users u ON CAST(u.id AS text) = a.user_id
        WHERE {where}
        ORDER BY a.timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    r_items = await db.execute(items_sql, params_items)
    rows = r_items.fetchall()

    items = []
    for row in rows:
        items.append({
            "id": row.id,
            "timestamp": row.timestamp.isoformat() if row.timestamp else None,
            "user_id": row.user_id,
            "full_name": row.full_name,
            "email": row.email,
            "action": row.action,
            "module": row.module,
            "status": row.status,
            "ip_address": row.ip_address,
            "file_name": row.file_name,
            "chat_message": row.chat_message,
            "duration_ms": row.duration_ms,
            "details": row.details,
        })

    pages = (total + page_size - 1) // page_size if total else 1
    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/audit/summary")
async def get_audit_summary(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Get audit stats for last 30 days. Requires admin."""
    require_admin(current_user)

    since = datetime.utcnow() - timedelta(days=30)

    r = await db.execute(text("""
        SELECT
            COUNT(*) as total_events,
            COUNT(*) FILTER (WHERE action = 'login_attempt' AND status = 'failed') as failed_logins,
            COUNT(*) FILTER (WHERE status = 'blocked') as blocked_attempts,
            COUNT(*) FILTER (WHERE action = 'file_upload') as files_uploaded,
            COUNT(*) FILTER (WHERE action = 'chat_message') as chatbot_questions
        FROM audit_logs
        WHERE timestamp >= :since
    """), {"since": since})
    row = r.fetchone()

    r2 = await db.execute(text("""
        SELECT user_id, COUNT(*) as cnt
        FROM audit_logs
        WHERE timestamp >= :since AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY cnt DESC
        LIMIT 5
    """), {"since": since})
    top_users = [{"user_id": r2_row.user_id, "count": r2_row.cnt} for r2_row in r2.fetchall()]

    r3 = await db.execute(text("""
        SELECT DATE(timestamp) as d, COUNT(*) as cnt
        FROM audit_logs
        WHERE timestamp >= :since
        GROUP BY DATE(timestamp)
        ORDER BY d
    """), {"since": since})
    events_per_day = [{"date": str(r3_row.d), "count": r3_row.cnt} for r3_row in r3.fetchall()]

    r4 = await db.execute(text("""
        SELECT module, COUNT(*) as cnt
        FROM audit_logs
        WHERE timestamp >= :since AND module IS NOT NULL
        GROUP BY module
    """), {"since": since})
    most_used_modules = [{"module": r4_row.module, "count": r4_row.cnt} for r4_row in r4.fetchall()]

    r5 = await db.execute(text("""
        SELECT ip_address, COUNT(*) as cnt
        FROM audit_logs
        WHERE action = 'login_attempt' AND status = 'failed' AND timestamp >= :since
        GROUP BY ip_address
        HAVING COUNT(*) > 10
    """), {"since": since})
    suspicious_ips = [r5_row.ip_address for r5_row in r5.fetchall() if r5_row.ip_address]

    return {
        "total_events": row.total_events or 0,
        "failed_logins": row.failed_logins or 0,
        "blocked_attempts": row.blocked_attempts or 0,
        "files_uploaded": row.files_uploaded or 0,
        "chatbot_questions": row.chatbot_questions or 0,
        "most_active_users": top_users,
        "events_per_day": events_per_day,
        "most_used_modules": most_used_modules,
        "suspicious_ips": suspicious_ips,
    }


@router.get("/audit/user/{user_id}")
async def get_audit_user_timeline(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Get full timeline for one user. Requires admin."""
    require_admin(current_user)

    uid_str = str(user_id)
    r_user = await db.execute(select(User).where(User.id == user_id))
    u = r_user.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    r_events = await db.execute(text("""
        SELECT id, timestamp, action, module, status, ip_address, details,
               file_name, file_size_kb, chat_message, duration_ms
        FROM audit_logs
        WHERE user_id = :user_id
        ORDER BY timestamp DESC
    """), {"user_id": uid_str})
    events = r_events.fetchall()

    r_stats = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE action = 'login_attempt' AND status = 'success') as total_logins,
            COUNT(*) FILTER (WHERE action = 'file_upload') as files_uploaded,
            COUNT(*) FILTER (WHERE action = 'chat_message') as chatbot_questions,
            COUNT(*) FILTER (WHERE action = 'access_denied' OR status = 'blocked') as access_denied
        FROM audit_logs
        WHERE user_id = :user_id
    """), {"user_id": uid_str})
    stats = r_stats.fetchone()

    r_first_last = await db.execute(text("""
        SELECT MIN(timestamp) as first_login, MAX(timestamp) as last_login
        FROM audit_logs
        WHERE user_id = :user_id AND action = 'login_attempt'
    """), {"user_id": uid_str})
    fl = r_first_last.fetchone()

    by_day: dict[str, list] = {}
    for e in events:
        d = e.timestamp.date().isoformat() if e.timestamp else ""
        if d not in by_day:
            by_day[d] = []
        by_day[d].append({
            "id": e.id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "action": e.action,
            "module": e.module,
            "status": e.status,
            "ip_address": e.ip_address,
            "details": e.details,
            "file_name": e.file_name,
            "file_size_kb": e.file_size_kb,
            "chat_message": e.chat_message,
            "duration_ms": e.duration_ms,
        })

    timeline = [{"date": d, "events": sorted(evs, key=lambda x: x["timestamp"] or "", reverse=True)} for d, evs in sorted(by_day.items(), reverse=True)]

    return {
        "user": _user_to_response(u),
        "stats": {
            "total_logins": stats.total_logins or 0,
            "last_login": fl.last_login.isoformat() if fl and fl.last_login else None,
            "first_login": fl.first_login.isoformat() if fl and fl.first_login else None,
            "files_uploaded": stats.files_uploaded or 0,
            "chatbot_questions": stats.chatbot_questions or 0,
            "access_denied": stats.access_denied or 0,
        },
        "timeline": timeline,
    }
