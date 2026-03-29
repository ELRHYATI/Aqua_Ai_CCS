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


class FinanceKpiRowResponse(BaseModel):
    """KPI par compte/ligne pour la page Finance AZURA."""

    account: str
    label: str
    ytd: float
    budget_ytd: float
    last_year_ytd: float
    var_budget: Optional[float] = None  # (R - B) / B, None si division par zéro
    var_last_year: Optional[float] = None  # (R - N-1) / N-1
    var_budget_div_zero: bool = False
    var_last_year_div_zero: bool = False


class FinanceKpiResponse(BaseModel):
    """Réponse complète de l'endpoint GET /finance/kpi."""

    total_ytd: float
    total_budget_ytd: float
    total_last_year_ytd: float
    var_budget_pct: Optional[float] = None
    var_last_year_pct: Optional[float] = None
    rows: List[FinanceKpiRowResponse]
    year: Optional[int] = None
