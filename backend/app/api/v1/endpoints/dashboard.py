"""Dashboard analytics - aggregated data for charts."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """
    Aggregated stats for dashboard charts.
    """
    stats: dict = {
        "estran": {"by_parc": [], "by_year_month": [], "totals": {}, "anomaly_hint": 0},
        "finance": {"budget_vs_real": {}, "top_variances": [], "totals": {}},
        "achats": {"da_bc_summary": [], "by_risk": []},
    }

    # Estran: biomasse by parc
    r = await db.execute(
        select(EstranRecord.parc_semi, func.sum(EstranRecord.biomasse_gr).label("total"))
        .where(EstranRecord.parc_semi.isnot(None))
        .group_by(EstranRecord.parc_semi)
    )
    stats["estran"]["by_parc"] = [
        {"parc": row.parc_semi, "biomasse": float(row.total or 0)}
        for row in r.all()
    ]

    # Estran: by year
    r = await db.execute(
        select(EstranRecord.year, func.count().label("cnt"))
        .where(EstranRecord.year.isnot(None))
        .group_by(EstranRecord.year)
    )
    stats["estran"]["by_year_month"] = [{"year": row.year, "count": row.cnt} for row in r.all()]

    # Estran totals
    r = await db.execute(select(func.count()).select_from(EstranRecord))
    stats["estran"]["totals"]["records"] = r.scalar() or 0
    r = await db.execute(select(func.sum(EstranRecord.biomasse_gr)).select_from(EstranRecord))
    stats["estran"]["totals"]["biomasse_gr"] = float(r.scalar() or 0)

    # Finance: budget vs real vs n1
    r = await db.execute(
        select(
            func.sum(FinanceLine.budget).label("budget"),
            func.sum(FinanceLine.real).label("real"),
            func.sum(FinanceLine.n1).label("n1"),
            func.sum(FinanceLine.ytd).label("ytd"),
        ).select_from(FinanceLine)
    )
    row = r.one()
    stats["finance"]["budget_vs_real"] = {
        "budget": float(row.budget or 0),
        "real": float(row.real or 0),
        "n1": float(row.n1 or 0),
        "ytd": float(row.ytd or 0),
    }
    stats["finance"]["totals"] = {"lines": 0}
    r = await db.execute(select(func.count()).select_from(FinanceLine))
    stats["finance"]["totals"]["lines"] = r.scalar() or 0

    # Finance: top variances (by abs var_b_r)
    r = await db.execute(
        select(FinanceLine.code, FinanceLine.label, FinanceLine.var_b_r, FinanceLine.var_pct)
        .where(FinanceLine.var_b_r.isnot(None))
        .order_by(func.abs(FinanceLine.var_b_r).desc())
        .limit(10)
    )
    stats["finance"]["top_variances"] = [
        {"code": row.code, "label": (row.label or "")[:40], "var_b_r": float(row.var_b_r or 0), "var_pct": float(row.var_pct or 0)}
        for row in r.all()
    ]

    # Achats: DA vs BC amounts
    r = await db.execute(select(func.sum(PurchaseDA.amount)).select_from(PurchaseDA))
    da_total = float(r.scalar() or 0)
    r = await db.execute(select(func.count()).select_from(PurchaseDA))
    da_count = r.scalar() or 0
    r = await db.execute(select(func.sum(PurchaseBC.amount)).select_from(PurchaseBC))
    bc_total = float(r.scalar() or 0)
    r = await db.execute(select(func.count()).select_from(PurchaseBC))
    bc_count = r.scalar() or 0

    stats["achats"]["da_bc_summary"] = [
        {"type": "DA", "count": da_count, "amount": da_total},
        {"type": "BC", "count": bc_count, "amount": bc_total},
    ]

    # Achats: priorities for risk distribution (we'll use from /achat/priorities or compute)
    r = await db.execute(
        select(PurchaseDA.delay_days, PurchaseDA.amount, PurchaseDA.critical_flag)
    )
    da_rows = r.all()
    r = await db.execute(
        select(PurchaseBC.delay_days, PurchaseBC.amount, PurchaseBC.critical_flag)
    )
    bc_rows = r.all()
    risk_buckets = {"low": 0, "medium": 0, "high": 0}
    for row in da_rows + bc_rows:
        d = row.delay_days or 0
        amt = float(row.amount or 0)
        crit = row.critical_flag or False
        score = d * 0.1 + (amt / 10000) * 0.02 + (20 if crit else 0)
        if score > 15:
            risk_buckets["high"] += 1
        elif score > 5:
            risk_buckets["medium"] += 1
        else:
            risk_buckets["low"] += 1
    stats["achats"]["by_risk"] = [
        {"level": k, "count": v} for k, v in risk_buckets.items()
    ]

    # Enriched fields for dashboard redesign
    stock_q = await db.execute(
        select(func.count()).select_from(EstranRecord).where(EstranRecord.date_recolte.is_(None))
    )
    estran_stock_total = stock_q.scalar() or 0

    budget_val = stats["finance"]["budget_vs_real"].get("budget", 0)
    ytd_val = stats["finance"]["budget_vs_real"].get("ytd", 0)
    finance_variance_pct = round(((ytd_val - budget_val) / budget_val) * 100, 2) if budget_val else 0.0

    da_pending = da_count
    da_urgent = len([r for r in da_rows if (r.delay_days or 0) > 5 or r.critical_flag])

    last_sync_q = await db.execute(text(
        "SELECT MAX(timestamp) FROM audit_logs WHERE action = 'file_upload' OR action = 'sync'"
    ))
    last_sync_row = last_sync_q.scalar()
    last_sync_at = last_sync_row.isoformat() if last_sync_row else None

    stats["estran_stock_total"] = estran_stock_total
    stats["finance_variance_pct"] = finance_variance_pct
    stats["achat_da_pending"] = da_pending
    stats["achat_da_urgent"] = da_urgent
    stats["anomalies_estran"] = stats["estran"].get("anomaly_hint", 0)
    stats["anomalies_finance"] = len([v for v in (stats["finance"].get("top_variances") or []) if abs(v.get("var_pct", 0)) > 10])
    stats["last_sync_at"] = last_sync_at

    return stats


@router.get("/activity/recent")
async def get_recent_activity(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Last N activity log entries for the current user (not admin-only)."""
    user_id = str(current_user.id) if current_user else None
    # Only audit_logs columns here — full_name lives on users (avoids UndefinedColumnError).
    q = text("""
        SELECT id, timestamp, user_id, action, module, status, details
        FROM audit_logs
        WHERE (:uid IS NULL OR user_id = :uid)
        ORDER BY timestamp DESC
        LIMIT :lim
    """)
    result = await db.execute(q, {"uid": user_id, "lim": limit})
    rows = result.mappings().all()

    user_uuids: set[UUID] = set()
    for r in rows:
        raw = r.get("user_id")
        if not raw:
            continue
        try:
            user_uuids.add(UUID(str(raw)))
        except (ValueError, TypeError):
            pass

    name_by_id: dict[str, Optional[str]] = {}
    if user_uuids:
        ru = await db.execute(select(User.id, User.full_name).where(User.id.in_(user_uuids)))
        for uid, fname in ru.all():
            name_by_id[str(uid)] = fname

    return [
        {
            "id": r["id"],
            "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
            "user_id": r["user_id"],
            "full_name": name_by_id.get(str(r["user_id"])) if r.get("user_id") else None,
            "action": r["action"],
            "module": r["module"],
            "status": r["status"],
            "details": r["details"],
        }
        for r in rows
    ]
