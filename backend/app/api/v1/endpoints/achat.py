"""Achat (purchase) API endpoints."""

from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.purchase import PurchaseDA, PurchaseBC
from app.schemas.achat import PurchaseDAResponse, PurchaseBCResponse, PurchasePriority
from app.schemas.ml import AchatAnomalyRecord
from app.services.kpi_service import get_priorities
from app.services.anomaly_service import run_anomaly_detection

router = APIRouter(prefix="/achat", tags=["achat"])


@router.get("/da", response_model=list[PurchaseDAResponse])
async def get_purchase_da(db: AsyncSession = Depends(get_db)):
    """List Demandes d'Achat en cours."""
    result = await db.execute(select(PurchaseDA).order_by(PurchaseDA.id.desc()))
    return result.scalars().all()


@router.get("/bc", response_model=list[PurchaseBCResponse])
async def get_purchase_bc(db: AsyncSession = Depends(get_db)):
    """List Bons de Commande non livrés."""
    result = await db.execute(select(PurchaseBC).order_by(PurchaseBC.id.desc()))
    return result.scalars().all()


@router.get("/anomalies", response_model=list[AchatAnomalyRecord])
async def get_achat_anomalies(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(500, ge=1, le=2000),
    method: str = Query("isolation_forest", description="isolation_forest | lof | one_class_svm | zscore"),
):
    """
    Run ML anomaly detection on DA/BC (amount, delay). Returns flagged rows.
    """
    r_da = await db.execute(select(PurchaseDA).order_by(PurchaseDA.id.desc()).limit(limit))
    r_bc = await db.execute(select(PurchaseBC).order_by(PurchaseBC.id.desc()).limit(limit))
    da_rows = r_da.scalars().all()
    bc_rows = r_bc.scalars().all()

    data = []
    for r in da_rows:
        data.append({
            "id": r.id,
            "type": "da",
            "reference": r.reference,
            "amount": float(r.amount) if r.amount else 0,
            "delay_days": r.delay_days or 0,
            "status": r.status,
            "critical_flag": r.critical_flag or False,
            "expected_delivery_date": None,
        })
    for r in bc_rows:
        data.append({
            "id": r.id,
            "type": "bc",
            "reference": r.reference,
            "amount": float(r.amount) if r.amount else 0,
            "delay_days": r.delay_days or 0,
            "status": r.status,
            "critical_flag": r.critical_flag or False,
            "expected_delivery_date": str(r.expected_delivery_date) if r.expected_delivery_date else None,
        })

    if not data:
        return []

    df = pd.DataFrame(data)
    df_out = run_anomaly_detection(df, method=method, domain="achats")
    flagged = df_out[df_out["is_anomaly"] == True]

    return [
        AchatAnomalyRecord(
            id=int(row["id"]),
            type=str(row["type"]),
            reference=row.get("reference"),
            amount=row.get("amount"),
            delay_days=int(row.get("delay_days", 0)),
            status=row.get("status"),
            critical_flag=bool(row.get("critical_flag", False)),
            expected_delivery_date=row.get("expected_delivery_date"),
            anomaly_score=float(row["anomaly_score"]),
            severity=str(row["severity"]),
            explanation=str(row.get("explanation", "")),
        )
        for _, row in flagged.iterrows()
    ]


@router.get("/priorities", response_model=list[PurchasePriority])
async def get_achat_priorities(db: AsyncSession = Depends(get_db)):
    """DA/BC with risk_score, sorted by priority."""
    return await get_priorities(db)
