"""Estran schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class EstranSheetInfo(BaseModel):
    name: str
    count: int


class EstranStatsResponse(BaseModel):
    moyenne_taux_recapture_echantillonnage: Optional[float] = None
    moyenne_taux_recapture_transfert: Optional[float] = None
    objectifs_recolte: List[str] = []


class EstranRecordBase(BaseModel):
    parc_semi: Optional[str] = None
    parc_an: Optional[str] = None
    ligne_num: Optional[int] = None
    phase: Optional[str] = None
    date_semis: Optional[date] = None
    date_recolte: Optional[date] = None
    quantite_brute_recoltee_kg: Optional[Decimal] = None
    biomasse_gr: Optional[Decimal] = None
    biomasse_vendable_kg: Optional[Decimal] = None
    statut: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    sheet_name: Optional[str] = None
    type_recolte: Optional[str] = None
    taux_recapture: Optional[Decimal] = None
    objectif_recolte: Optional[str] = None


class EstranRecordCreate(EstranRecordBase):
    pass


class EstranRecordResponse(EstranRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EstranAnomalyRecord(EstranRecordResponse):
    """Estran record with anomaly metadata."""

    anomaly_score: float
    severity: str  # low, medium, high
    is_anomaly: bool
    explanation: Optional[str] = None
