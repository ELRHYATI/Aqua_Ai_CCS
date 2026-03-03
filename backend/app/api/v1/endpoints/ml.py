"""ML analysis API - clustering, trends, automated insights."""

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC
from app.schemas.ml import (
    MLAnalysisResponse,
    ClusterResult,
    TrendResult,
    InsightItem,
)
from app.services.anomaly_service import run_anomaly_detection
from app.services.ml_analysis_service import (
    cluster_finance_lines,
    detect_finance_trends,
    generate_insights,
)

router = APIRouter(prefix="/ml", tags=["ml"])


@router.get("/analysis", response_model=MLAnalysisResponse)
async def get_ml_analysis(db: AsyncSession = Depends(get_db)):
    """
    Run full ML analysis: clustering, trends, anomaly counts, automated insights.
    """
    anomaly_counts = {"estran": 0, "finance": 0, "achats": 0}
    estran_df = None
    finance_df = None
    achats_df = None

    # Estran: fetch and run anomaly detection for count
    r_estran = await db.execute(select(EstranRecord).limit(500))
    estran_rows = r_estran.scalars().all()
    if estran_rows:
        estran_data = [
            {
                "id": r.id,
                "effectif_seme": float(r.effectif_seme) if r.effectif_seme else None,
                "quantite_semee_kg": float(r.quantite_semee_kg) if r.quantite_semee_kg else None,
                "quantite_brute_recoltee_kg": float(r.quantite_brute_recoltee_kg) if r.quantite_brute_recoltee_kg else None,
                "biomasse_gr": float(r.biomasse_gr) if r.biomasse_gr else None,
                "biomasse_vendable_kg": float(r.biomasse_vendable_kg) if r.biomasse_vendable_kg else None,
                "pct_recolte": float(r.pct_recolte) if r.pct_recolte else None,
            }
            for r in estran_rows
        ]
        estran_df = pd.DataFrame(estran_data)
        df_anom = run_anomaly_detection(estran_df, domain="estran")
        anomaly_counts["estran"] = int(df_anom["is_anomaly"].sum())

    # Finance: fetch, anomalies, clustering, trends
    r_finance = await db.execute(select(FinanceLine).limit(500))
    finance_rows = r_finance.scalars().all()
    if finance_rows:
        finance_data = [
            {
                "id": r.id,
                "code": r.code,
                "label": r.label,
                "ytd": float(r.ytd) if r.ytd else None,
                "n1": float(r.n1) if r.n1 else None,
                "budget": float(r.budget) if r.budget else None,
                "real": float(r.real) if r.real else None,
                "var_b_r": float(r.var_b_r) if r.var_b_r else None,
                "var_pct": float(r.var_pct) if r.var_pct else None,
            }
            for r in finance_rows
        ]
        finance_df = pd.DataFrame(finance_data)
        df_fin_anom = run_anomaly_detection(finance_df, domain="finance")
        anomaly_counts["finance"] = int(df_fin_anom["is_anomaly"].sum())

    # Achats: fetch and run anomaly for count
    r_da = await db.execute(select(PurchaseDA).limit(300))
    r_bc = await db.execute(select(PurchaseBC).limit(300))
    da_rows = r_da.scalars().all()
    bc_rows = r_bc.scalars().all()
    achats_data = []
    for r in da_rows:
        achats_data.append({
            "id": r.id, "type": "da",
            "amount": float(r.amount) if r.amount else 0,
            "delay_days": r.delay_days or 0,
        })
    for r in bc_rows:
        achats_data.append({
            "id": r.id, "type": "bc",
            "amount": float(r.amount) if r.amount else 0,
            "delay_days": r.delay_days or 0,
        })
    if achats_data:
        achats_df = pd.DataFrame(achats_data)
        df_ach_anom = run_anomaly_detection(achats_df, domain="achats")
        anomaly_counts["achats"] = int(df_ach_anom["is_anomaly"].sum())

    # Clustering on finance
    clusters = []
    if finance_df is not None and len(finance_df) >= 4:
        cluster_results = cluster_finance_lines(finance_df, n_clusters=4)
        clusters = [
            ClusterResult(
                cluster_id=c.cluster_id,
                label=c.label,
                count=c.count,
                centroid_summary=c.centroid_summary,
                top_members=c.top_members,
            )
            for c in cluster_results
        ]

    # Trends on finance
    trends = []
    if finance_df is not None:
        trend_results = detect_finance_trends(finance_df)
        trends = [
            TrendResult(
                metric=t.metric,
                direction=t.direction,
                change_pct=t.change_pct,
                recent_avg=t.recent_avg,
                prior_avg=t.prior_avg,
            )
            for t in trend_results
        ]

    # Generate insights
    insight_items = generate_insights(
        estran_df=estran_df,
        finance_df=finance_df,
        achats_df=achats_df,
        anomaly_results=anomaly_counts,
    )
    insights = [
        InsightItem(
            type=i.type,
            title=i.title,
            description=i.description,
            severity=i.severity,
            data=i.data,
        )
        for i in insight_items
    ]

    return MLAnalysisResponse(
        clusters=clusters,
        trends=trends,
        insights=insights,
        anomaly_counts=anomaly_counts,
    )
