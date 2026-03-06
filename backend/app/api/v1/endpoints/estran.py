"""Estran API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.estran import EstranRecord
from app.schemas.estran import (
    EstranRecordResponse,
    EstranAnomalyRecord,
    EstranSheetInfo,
    EstranStatsResponse,
)
from app.services.anomaly_service import run_anomaly_detection

import pandas as pd

router = APIRouter(prefix="/estran", tags=["estran"])


@router.get("/sheets", response_model=list[EstranSheetInfo])
async def get_estran_sheets(db: AsyncSession = Depends(get_db)):
    """List available sheets (Primaire, Hors calibre) with record counts."""
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
):
    """
    Moyenne taux recapture by Type récolte (Echantillonnage, Transfert) - Primaire only.
    Hors calibre does not have these stats.
    """
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
):
    """Paginated estran records."""
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
):
    """
    Run ML anomaly detection on estran records and return flagged rows.
    Algorithms: IsolationForest, LOF, One-Class SVM, or Z-Score.
    """
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

    result_list = []
    for _, row in flagged.iterrows():
        result_list.append(
            EstranAnomalyRecord(
                id=int(row["id"]),
                parc_semi=row.get("parc_semi"),
                parc_an=row.get("parc_an"),
                ligne_num=int(row["ligne_num"]) if pd.notna(row.get("ligne_num")) else None,
                phase=row.get("phase"),
                date_semis=row.get("date_semis"),
                date_recolte=row.get("date_recolte"),
                quantite_brute_recoltee_kg=row.get("quantite_brute_recoltee_kg"),
                biomasse_gr=row.get("biomasse_gr"),
                biomasse_vendable_kg=row.get("biomasse_vendable_kg"),
                statut=row.get("statut"),
                year=int(row["year"]) if pd.notna(row.get("year")) else None,
                month=int(row["month"]) if pd.notna(row.get("month")) else None,
                sheet_name=row.get("sheet_name"),
                type_recolte=row.get("type_recolte"),
                taux_recapture=(
                    float(row["taux_recapture"])
                    if "taux_recapture" in row and pd.notna(row.get("taux_recapture"))
                    else None
                ),
                objectif_recolte=row.get("objectif_recolte"),
                created_at=row.get("created_at"),
                updated_at=row.get("updated_at"),
                anomaly_score=float(row["anomaly_score"]),
                severity=str(row["severity"]),
                is_anomaly=True,
                explanation=str(row["explanation"]) if "explanation" in row and pd.notna(row.get("explanation")) else None,
            )
        )
    return result_list
