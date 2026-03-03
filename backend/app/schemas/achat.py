"""Achat (purchase) schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PurchaseDABase(BaseModel):
    reference: Optional[str] = None
    amount: Optional[Decimal] = None
    delay_days: Optional[int] = 0
    status: Optional[str] = None
    critical_flag: Optional[bool] = False


class PurchaseBCBase(BaseModel):
    reference: Optional[str] = None
    amount: Optional[Decimal] = None
    delay_days: Optional[int] = 0
    status: Optional[str] = None
    critical_flag: Optional[bool] = False
    expected_delivery_date: Optional[date] = None


class PurchaseDAResponse(PurchaseDABase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PurchaseBCResponse(PurchaseBCBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PurchasePriority(BaseModel):
    """DA or BC with risk score for prioritization."""

    id: int
    type: str  # "da" or "bc"
    reference: Optional[str] = None
    amount: Optional[Decimal] = None
    delay_days: int
    status: Optional[str] = None
    critical_flag: bool
    risk_score: float
    expected_delivery_date: Optional[date] = None
