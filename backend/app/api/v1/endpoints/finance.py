"""Finance API endpoints."""

from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query, Request, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_can_view_finance
from app.core.database import get_db
from app.models.user import User
from app.services.audit_service import log
from app.models.finance import FinanceLine
from app.schemas.finance import (
    FinanceLineResponse,
    FinanceKpiResponse,
    FinanceKpiRowResponse,
    VarianceInput,
    Commentary,
)
from app.schemas.ml import FinanceAnomalyRecord
from app.services.commentary_service import generate_finance_commentary
from app.services.anomaly_service import run_anomaly_detection
from app.services.finance_excel_service import get_finance_kpis_summary
from app.services.ollama_service import generate_gl_commentary

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/gl-entries")
async def get_finance_gl_entries(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user),
    account: str = Query(..., description="Account code for drill-down"),
    year: Optional[int] = Query(None, description="Filter by year"),
):
    """GL line entries for a given account (drill-down from KPI table)."""
    require_can_view_finance(current_user)
    from app.services.finance_excel_service import get_gl_entries_for_account
    entries = get_gl_entries_for_account(account=account, year=year)
    background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "finance", {"page_url": str(request.url)}, request, "success")
    return {"account": account, "entries": entries}


@router.get("/kpi", response_model=FinanceKpiResponse)
async def get_finance_kpi(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user),
    year: Optional[int] = Query(None, description="Année filtrée (ex: 2026)"),
    source: str = Query(
        "rapport",
        description="Source : rapport (MODELE RAPPORT), bal (BAL MODELE), gl (MODELE GL + BAL)",
    ),
    month_to: Optional[int] = Query(None, description="Pour source=gl : mois limite YTD (1-12)"),
):
    """
    KPI Finance AZURA : YTD, Budget YTD, N-1 YTD, Var vs Budget %, Var vs N-1 %.
    Sources : rapport (CPC), bal (bilan), gl (Grand Livre + BAL pour B/N-1).
    """
    require_can_view_finance(current_user)
    background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "finance", {"page_url": str(request.url)}, request, "success")
    summary = get_finance_kpis_summary(year=year, source=source, month_to=month_to)
    rows = [
        FinanceKpiRowResponse(
            account=r.account,
            label=r.label,
            ytd=r.ytd,
            budget_ytd=r.budget_ytd,
            last_year_ytd=r.last_year_ytd,
            var_budget=r.var_budget,
            var_last_year=r.var_last_year,
            var_budget_div_zero=r.var_budget_div_zero,
            var_last_year_div_zero=r.var_last_year_div_zero,
        )
        for r in summary["rows"]
    ]
    return FinanceKpiResponse(
        total_ytd=summary["total_ytd"],
        total_budget_ytd=summary["total_budget_ytd"],
        total_last_year_ytd=summary["total_last_year_ytd"],
        var_budget_pct=summary["var_budget_pct"],
        var_last_year_pct=summary["var_last_year_pct"],
        rows=rows,
        year=year,
    )


@router.get("/lines", response_model=list[FinanceLineResponse])
async def get_finance_lines(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    year: Optional[int] = None,
    month: Optional[int] = None,
    gr: Optional[str] = None,
):
    """Paginated finance lines for a period."""
    require_can_view_finance(current_user)
    background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "finance", {"page_url": str(request.url)}, request, "success")
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
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Run ML anomaly detection on finance lines (variances, budget vs real).
    Returns flagged rows with severity and explanation.
    """
    require_can_view_finance(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "finance", {"page_url": str(request.url)}, request, "success")
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
async def post_finance_commentary(
    variance_input: VarianceInput,
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Generate AI commentary from aggregated variance data.
    Stub: returns dummy until Azure OpenAI is configured.
    """
    require_can_view_finance(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "data_export", "finance", {"format": "commentary"}, request, "success")
    return await generate_finance_commentary(variance_input)


@router.post("/gl-commentary")
async def post_finance_gl_commentary(
    account: str = Query(..., description="Compte (ex: P1131, E1110)"),
    year: Optional[int] = Query(None, description="Année (défaut: année courante)"),
    label: Optional[str] = Query(None, description="Libellé optionnel pour contexte"),
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Generate GL-based commentary for a specific account using Ollama.
    Format: POUR LE COMPTE X, L'EXPLICATION VIENT DU GL COMME SUIT: C'EST UNE FACTURE...
    Requires MODELE GL.xlsx and Ollama running.
    """
    require_can_view_finance(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "data_export", "finance", {"account": account}, request, "success")
    commentary = await generate_gl_commentary(account=account.strip(), year=year)
    return {"account": account, "commentary": commentary}
