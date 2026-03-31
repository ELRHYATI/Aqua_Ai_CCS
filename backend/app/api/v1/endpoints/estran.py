"""Estran API endpoints."""

from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_can_view_estran
from app.core.database import get_db
from app.models.user import User
from app.services.audit_service import log
from app.models.estran import EstranRecord
from app.schemas.estran import (
    EstranRecordResponse,
    EstranAnomalyRecord,
    EstranSheetInfo,
    EstranStatsResponse,
)
from app.schemas.estran_kpi import (
    EstranKpiResponse,
    EstranDashboardKpiResponse,
    ChartDataPoint,
    StockAgeDataPoint,
    EstranFiltersResponse,
    KpiChartResponse,
    KpiNewFiltersResponse,
    EstranDbPage,
    EstranDbCounts,
)
from app.services.anomaly_service import run_anomaly_detection
from app.services import estran_kpi_service
from app.services import estran_service
from app.services import estran_chart_service
from app.services import estran_db_service

import pandas as pd

router = APIRouter(prefix="/estran", tags=["estran"])


@router.get("/sheets", response_model=list[EstranSheetInfo])
async def get_estran_sheets(
    db: AsyncSession = Depends(get_db),
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """List available sheets (Primaire, Hors calibre) with record counts."""
    require_can_view_estran(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "estran", {"page_url": str(request.url)}, request, "success")
    q = (
        select(EstranRecord.sheet_name, func.count(EstranRecord.id).label("count"))
        .where(EstranRecord.sheet_name.isnot(None))
        .group_by(EstranRecord.sheet_name)
    )
    result = await db.execute(q)
    rows = result.all()
    if not rows:
        r = await db.execute(select(func.count(EstranRecord.id)))
        total = r.scalar()
        if total and total > 0:
            return [EstranSheetInfo(name="Tous", count=total)]
        return []
    out = [EstranSheetInfo(name=r.sheet_name, count=r.count) for r in rows]
    total = sum(s.count for s in out)
    out.insert(0, EstranSheetInfo(name="Tous", count=total))
    return out


@router.get("/stats", response_model=EstranStatsResponse)
async def get_estran_stats(
    db: AsyncSession = Depends(get_db),
    sheet: Optional[str] = Query(None, description="Filter by sheet: Primaire, Hors calibre, or Tous"),
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Moyenne taux recapture by Type récolte (Echantillonnage, Transfert) - Primaire only.
    Hors calibre does not have these stats.
    """
    require_can_view_estran(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "estran", {"page_url": str(request.url)}, request, "success")
    # Avg taux recapture for Transfert/Echantillonnage: ONLY from Primaire page
    q_prim = select(EstranRecord).where(
        EstranRecord.sheet_name == "Primaire",
        EstranRecord.taux_recapture.isnot(None),
    )
    result = await db.execute(q_prim)
    rows_prim = result.scalars().all()

    # Group by Objectif récolte (col 29) which has Echantillonnage, Transfert
    echantillonage = [r for r in rows_prim if r.objectif_recolte and "chantillonnage" in str(r.objectif_recolte).lower()]
    transfert = [r for r in rows_prim if r.objectif_recolte and "transfert" in str(r.objectif_recolte).lower()]

    def _avg(recs):
        vals = [float(r.taux_recapture) for r in recs if r.taux_recapture is not None]
        # taux_recapture is stored as decimal (0.39 = 39%)
        return round(sum(vals) / len(vals) * 100, 2) if vals else None

    # Objectifs récolte: from selected sheet or all
    q_obj = select(EstranRecord).where(EstranRecord.objectif_recolte.isnot(None))
    if sheet and sheet != "Tous":
        q_obj = q_obj.where(EstranRecord.sheet_name == sheet)
    r_obj = await db.execute(q_obj)
    objectifs = list(dict.fromkeys(r.objectif_recolte for r in r_obj.scalars().all() if r.objectif_recolte))[:20]

    return EstranStatsResponse(
        moyenne_taux_recapture_echantillonnage=_avg(echantillonage),
        moyenne_taux_recapture_transfert=_avg(transfert),
        objectifs_recolte=objectifs,
    )


@router.get("/records", response_model=list[EstranRecordResponse])
async def get_estran_records(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=2000),
    year: Optional[int] = None,
    parc_semi: Optional[str] = None,
    sheet: Optional[str] = Query(None, description="Filter by sheet: Primaire or Hors calibre"),
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """Paginated estran records."""
    require_can_view_estran(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "estran", {"page_url": str(request.url)}, request, "success")
    q = select(EstranRecord)
    if year is not None:
        q = q.where(EstranRecord.year == year)
    if parc_semi:
        q = q.where(EstranRecord.parc_semi == parc_semi)
    if sheet and sheet != "Tous":
        q = q.where(EstranRecord.sheet_name == sheet)
    q = q.offset(skip).limit(limit).order_by(EstranRecord.id.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/anomalies", response_model=list[EstranAnomalyRecord])
async def get_estran_anomalies(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(500, ge=1, le=2000),
    year: Optional[int] = None,
    sheet: Optional[str] = Query(None, description="Filter by sheet: Primaire or Hors calibre"),
    method: str = Query("isolation_forest", description="isolation_forest | lof | one_class_svm | zscore"),
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Run ML anomaly detection on estran records and return flagged rows.
    Algorithms: IsolationForest, LOF, One-Class SVM, or Z-Score.
    """
    require_can_view_estran(current_user)
    if background_tasks and request:
        background_tasks.add_task(log, str(current_user.id) if current_user else None, "page_view", "estran", {"page_url": str(request.url)}, request, "success")
    q = (
        select(EstranRecord)
        .order_by(EstranRecord.id.desc())
        .limit(limit)
    )
    if year is not None:
        q = q.where(EstranRecord.year == year)
    if sheet and sheet != "Tous":
        q = q.where(EstranRecord.sheet_name == sheet)
    result = await db.execute(q)
    rows = result.scalars().all()

    if not rows:
        return []

    # Convert to DataFrame for anomaly service (includes taux_recapture for ML training)
    data = [
        {
            "id": r.id,
            "parc_semi": r.parc_semi,
            "parc_an": r.parc_an,
            "ligne_num": r.ligne_num,
            "phase": r.phase,
            "date_semis": r.date_semis,
            "date_recolte": r.date_recolte,
            "effectif_seme": float(r.effectif_seme) if r.effectif_seme else None,
            "quantite_semee_kg": float(r.quantite_semee_kg) if r.quantite_semee_kg else None,
            "quantite_brute_recoltee_kg": float(r.quantite_brute_recoltee_kg) if r.quantite_brute_recoltee_kg else None,
            "quantite_casse_kg": float(r.quantite_casse_kg) if r.quantite_casse_kg else None,
            "biomasse_gr": float(r.biomasse_gr) if r.biomasse_gr else None,
            "biomasse_vendable_kg": float(r.biomasse_vendable_kg) if r.biomasse_vendable_kg else None,
            "pct_recolte": float(r.pct_recolte) if r.pct_recolte else None,
            "longueur_ligne": float(r.longueur_ligne) if r.longueur_ligne else None,
            "nb_ligne_semee_200m": float(r.nb_ligne_semee_200m) if r.nb_ligne_semee_200m else None,
            "statut": r.statut,
            "year": r.year,
            "month": r.month,
            "sheet_name": r.sheet_name,
            "type_recolte": r.type_recolte,
            "taux_recapture": float(r.taux_recapture) if r.taux_recapture else None,
            "objectif_recolte": r.objectif_recolte,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)

    df_out = run_anomaly_detection(df, method=method, domain="estran")
    flagged = df_out[df_out["is_anomaly"] == True]

    def _safe(val, to_type=str):
        """Convert pandas nan to None; optionally cast to int/float."""
        if pd.isna(val) or val is None:
            return None
        if to_type == int:
            try:
                return int(float(val))
            except (TypeError, ValueError):
                return None
        if to_type == float:
            try:
                f = float(val)
                return f if abs(f) != float("inf") else None
            except (TypeError, ValueError):
                return None
        return str(val) if not isinstance(val, str) else val

    result_list = []
    for _, row in flagged.iterrows():
        result_list.append(
            EstranAnomalyRecord(
                id=int(row["id"]),
                parc_semi=_safe(row.get("parc_semi")),
                parc_an=_safe(row.get("parc_an")),
                ligne_num=_safe(row.get("ligne_num"), int),
                phase=_safe(row.get("phase")),
                date_semis=row.get("date_semis") if pd.notna(row.get("date_semis")) else None,
                date_recolte=row.get("date_recolte") if pd.notna(row.get("date_recolte")) else None,
                quantite_brute_recoltee_kg=_safe(row.get("quantite_brute_recoltee_kg"), float),
                biomasse_gr=_safe(row.get("biomasse_gr"), float),
                biomasse_vendable_kg=_safe(row.get("biomasse_vendable_kg"), float),
                statut=_safe(row.get("statut")),
                year=_safe(row.get("year"), int),
                month=_safe(row.get("month"), int),
                sheet_name=_safe(row.get("sheet_name")),
                type_recolte=_safe(row.get("type_recolte")),
                taux_recapture=_safe(row.get("taux_recapture"), float),
                objectif_recolte=_safe(row.get("objectif_recolte")),
                created_at=row.get("created_at"),
                updated_at=row.get("updated_at"),
                anomaly_score=float(row["anomaly_score"]),
                severity=str(row["severity"]),
                is_anomaly=True,
                explanation=str(row["explanation"]) if "explanation" in row and pd.notna(row.get("explanation")) else None,
                reason=str(row["reason"]) if "reason" in row and pd.notna(row.get("reason")) and row["reason"] else None,
            )
        )
    return result_list


@router.get("/kpi", response_model=EstranDashboardKpiResponse)
async def get_estran_kpis_endpoint(
    db: AsyncSession = Depends(get_db),
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    annee: Optional[int] = None,
    base: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """6 KPI indicators (rendement, age, stock) for Primaire + HC with trend vs previous year."""
    require_can_view_estran(current_user)
    return await estran_kpi_service.get_estran_kpis(
        db, parc, annee, base, parc_an=parc_an, generation_semi=generation_semi
    )


@router.get("/kpi/production", response_model=EstranKpiResponse)
async def get_estran_kpis_production_endpoint(
    db: AsyncSession = Depends(get_db),
    base: Optional[str] = Query(None, description="primaire | hc"),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    parc: Optional[str] = None,
    residence: Optional[str] = None,
    origine: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """Production KPIs from KPI-Prod-par-l-IA.xlsx (9 detailed indicators)."""
    require_can_view_estran(current_user)
    return await estran_service.get_estran_kpis(
        db, base=base, year=year, month=month,
        parc=parc, residence=residence, origine=origine,
    )


@router.get("/charts/rendement", response_model=list[ChartDataPoint])
async def get_estran_charts_rendement(
    db: AsyncSession = Depends(get_db),
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    annee: Optional[int] = None,
    base: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_kpi_service.get_chart_rendement(
        db, parc, annee, base, parc_an=parc_an, generation_semi=generation_semi
    )


@router.get("/charts/age-recolte", response_model=list[ChartDataPoint])
async def get_estran_charts_age_recolte(
    db: AsyncSession = Depends(get_db),
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    annee: Optional[int] = None,
    base: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_kpi_service.get_chart_age_recolte(
        db, parc, annee, base, parc_an=parc_an, generation_semi=generation_semi
    )


@router.get("/charts/stock-lignes", response_model=list[ChartDataPoint])
async def get_estran_charts_stock_lignes(
    db: AsyncSession = Depends(get_db),
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    annee: Optional[int] = None,
    base: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_kpi_service.get_chart_stock_lignes(
        db, parc, annee, base, parc_an=parc_an, generation_semi=generation_semi
    )


@router.get("/charts/stock-age-sejour", response_model=list[StockAgeDataPoint])
async def get_estran_charts_stock_age_sejour(
    db: AsyncSession = Depends(get_db),
    parc: Optional[str] = None,
    parc_an: Optional[str] = None,
    generation_semi: Optional[str] = None,
    base: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_kpi_service.get_chart_stock_age_sejour(
        db, parc, base, parc_an=parc_an, generation_semi=generation_semi
    )


@router.get("/filters", response_model=EstranFiltersResponse)
async def get_estran_filters_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_service.get_estran_filters(db)


# ── New KPI chart endpoints ───────────────────────────

@router.get("/kpi/filters", response_model=KpiNewFiltersResponse)
async def get_kpi_filters_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.get_kpi_filters(db)


@router.get("/kpi/recapture-primaire", response_model=KpiChartResponse)
async def kpi_recapture_primaire(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_recapture_primaire(
        db, x_axis, group_by, periode, date_from, date_to,
    )


@router.get("/kpi/recapture-hc", response_model=KpiChartResponse)
async def kpi_recapture_hc(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    filtre2: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_recapture_hc(
        db, x_axis, group_by, periode, date_from, date_to, filtre2,
    )


@router.get("/kpi/biomasse-recuperee", response_model=KpiChartResponse)
async def kpi_biomasse_recuperee(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_biomasse_recuperee(
        db, x_axis, group_by, periode, date_from, date_to,
    )


@router.get("/kpi/vendable-ligne-primaire", response_model=KpiChartResponse)
async def kpi_vendable_ligne_primaire(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_vendable_ligne_primaire(
        db, x_axis, group_by, periode, date_from, date_to,
    )


@router.get("/kpi/vendable-ligne-hc", response_model=KpiChartResponse)
async def kpi_vendable_ligne_hc(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    filtre2: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_vendable_ligne_hc(
        db, x_axis, group_by, periode, date_from, date_to, filtre2,
    )


@router.get("/kpi/poids-moyen-primaire", response_model=KpiChartResponse)
async def kpi_poids_moyen_primaire(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_poids_moyen_primaire(
        db, x_axis, group_by, periode, date_from, date_to,
    )


@router.get("/kpi/poids-moyen-hc", response_model=KpiChartResponse)
async def kpi_poids_moyen_hc(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    filtre2: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_poids_moyen_hc(
        db, x_axis, group_by, periode, date_from, date_to, filtre2,
    )


@router.get("/kpi/stock-lignes-primaire", response_model=KpiChartResponse)
async def kpi_stock_lignes_primaire(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_stock_lignes_primaire(
        db, x_axis, group_by, periode, date_from, date_to,
    )


@router.get("/kpi/stock-lignes-hc", response_model=KpiChartResponse)
async def kpi_stock_lignes_hc(
    db: AsyncSession = Depends(get_db),
    x_axis: str = Query("annee_mois"),
    group_by: str = Query("parc"),
    periode: str = Query("cette_annee"),
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    filtre2: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_chart_service.kpi_stock_lignes_hc(
        db, x_axis, group_by, periode, date_from, date_to, filtre2,
    )


# ── DB viewer endpoints ───────────────────────────────

@router.get("/db/counts", response_model=EstranDbCounts)
async def get_estran_db_counts(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_db_service.get_estran_db_counts(db)


@router.get("/db/primaire", response_model=EstranDbPage)
async def get_estran_db_primaire(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    sort_by: str = Query("date_recolte"),
    sort_order: str = Query("desc"),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_db_service.get_estran_db_page(
        db, base="primaire", page=page, page_size=page_size,
        search=search, sort_by=sort_by, sort_order=sort_order,
    )


@router.get("/db/hc", response_model=EstranDbPage)
async def get_estran_db_hc(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    sort_by: str = Query("date_recolte"),
    sort_order: str = Query("desc"),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    return await estran_db_service.get_estran_db_page(
        db, base="hc", page=page, page_size=page_size,
        search=search, sort_by=sort_by, sort_order=sort_order,
    )


@router.get("/db/export")
async def export_estran_db(
    db: AsyncSession = Depends(get_db),
    base: str = Query("primaire"),
    search: Optional[str] = None,
    full: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_can_view_estran(current_user)
    today = date_type.today().strftime("%Y%m%d")
    filename = f"estran_{base}_{today}.csv"

    async def generate():
        async for chunk in estran_db_service.export_estran_csv(
            db, base=base, search=search, full=full, page=page, page_size=page_size,
        ):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
