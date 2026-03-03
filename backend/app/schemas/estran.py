"""Estran schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


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
