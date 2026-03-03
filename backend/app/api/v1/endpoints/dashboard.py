"""Dashboard analytics - aggregated data for charts."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC

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

    return stats
