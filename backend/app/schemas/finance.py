"""Finance schemas."""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class FinanceLineBase(BaseModel):
    code: str
    ordre: Optional[int] = None
    gr: Optional[str] = None
    label: Optional[str] = None
    ytd: Optional[Decimal] = None
    n1: Optional[Decimal] = None
    budget: Optional[Decimal] = None
    real: Optional[Decimal] = None
    var_b_r: Optional[Decimal] = None
    var_pct: Optional[Decimal] = None
    var_r_n1: Optional[Decimal] = None
    year: Optional[int] = None
    month: Optional[int] = None


class FinanceLineResponse(FinanceLineBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class VarianceInput(BaseModel):
    """Input for commentary generation."""

    ytd: Optional[Decimal] = None
    budget: Optional[Decimal] = None
    n1: Optional[Decimal] = None
    real: Optional[Decimal] = None
    var_b_r: Optional[Decimal] = None
    var_pct: Optional[Decimal] = None
    top_drivers: Optional[List[str]] = []
    period_label: Optional[str] = None


class Commentary(BaseModel):
    """Structured AI commentary for finance."""

    summary: str
    key_drivers: List[str]
    recommendations: List[str]
