"""Finance API endpoints."""

from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.finance import FinanceLine
from app.schemas.finance import FinanceLineResponse, VarianceInput, Commentary
from app.schemas.ml import FinanceAnomalyRecord
from app.services.commentary_service import generate_finance_commentary
from app.services.anomaly_service import run_anomaly_detection

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/lines", response_model=list[FinanceLineResponse])
async def get_finance_lines(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    year: Optional[int] = None,
    month: Optional[int] = None,
    gr: Optional[str] = None,
):
    """Paginated finance lines for a period."""
    q = select(FinanceLine)
    if year is not None:
        q = q.where(FinanceLine.year == year)
    if month is not None:
        q = q.where(FinanceLine.month == month)
    if gr:
        q = q.where(FinanceLine.gr == gr)
    q = q.offset(skip).limit(limit).order_by(FinanceLine.ordre, FinanceLine.code)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/anomalies", response_model=list[FinanceAnomalyRecord])
async def get_finance_anomalies(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(500, ge=1, le=2000),
    year: Optional[int] = None,
    method: str = Query("isolation_forest", description="isolation_forest | lof | one_class_svm | zscore"),
):
    """
    Run ML anomaly detection on finance lines (variances, budget vs real).
    Returns flagged rows with severity and explanation.
    """
    q = select(FinanceLine).order_by(FinanceLine.id.desc()).limit(limit)
    if year is not None:
        q = q.where(FinanceLine.year == year)
    result = await db.execute(q)
    rows = result.scalars().all()

    if not rows:
        return []

    data = [
        {
            "id": r.id,
            "code": r.code,
            "gr": str(r.gr) if r.gr else None,
            "label": str(r.label) if r.label else None,
            "ytd": float(r.ytd) if r.ytd else None,
            "n1": float(r.n1) if r.n1 else None,
            "budget": float(r.budget) if r.budget else None,
            "real": float(r.real) if r.real else None,
            "fy": float(r.fy) if r.fy else None,
            "var_b_r": float(r.var_b_r) if r.var_b_r else None,
            "var_pct": float(r.var_pct) if r.var_pct else None,
            "var_r_n1": float(r.var_r_n1) if r.var_r_n1 else None,
            "year": r.year,
            "month": r.month,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)
    df_out = run_anomaly_detection(df, method=method, domain="finance")
    flagged = df_out[df_out["is_anomaly"] == True]

    return [
        FinanceAnomalyRecord(
            id=int(row["id"]),
            code=str(row["code"]),
            gr=row.get("gr"),
            label=row.get("label"),
            budget=row.get("budget"),
            real=row.get("real"),
            n1=row.get("n1"),
            var_b_r=row.get("var_b_r"),
            var_pct=row.get("var_pct"),
            year=int(row["year"]) if pd.notna(row.get("year")) else None,
            month=int(row["month"]) if pd.notna(row.get("month")) else None,
            anomaly_score=float(row["anomaly_score"]),
            severity=str(row["severity"]),
            explanation=str(row.get("explanation", "")),
        )
        for _, row in flagged.iterrows()
    ]


@router.post("/commentary", response_model=Commentary)
async def post_finance_commentary(variance_input: VarianceInput):
    """
    Generate AI commentary from aggregated variance data.
    Stub: returns dummy until Azure OpenAI is configured.
    """
    return await generate_finance_commentary(variance_input)
