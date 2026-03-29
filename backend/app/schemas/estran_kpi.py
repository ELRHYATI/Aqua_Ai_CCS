from typing import List, Optional, Literal
from pydantic import BaseModel


class KpiIndicator(BaseModel):
    value: float
    unit: str
    trend: float
    trend_direction: str


class EstranDashboardKpiResponse(BaseModel):
    rendement_primaire: KpiIndicator
    rendement_hc: KpiIndicator
    age_recolte_primaire: KpiIndicator
    age_recolte_hc: KpiIndicator
    stock_lignes_primaire: KpiIndicator
    stock_lignes_hc: KpiIndicator


class EstranKpiBreakdown(BaseModel):
    parc: Optional[str] = None
    residence: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    origine: Optional[str] = None


class EstranKpiItem(BaseModel):
    kpiKey: str
    label: str
    base: Literal["Primaire", "HC"]
    value: Optional[float] = None
    unit: str
    comment: str
    formula: str
    division_by_zero: bool = False
    breakdown: EstranKpiBreakdown = EstranKpiBreakdown()


class EstranKpiSeriesPoint(BaseModel):
    kpiKey: str
    label: str
    base: Literal["Primaire", "HC"]
    unit: str
    value: Optional[float] = None
    year: Optional[int] = None
    month: Optional[int] = None
    parc: Optional[str] = None
    residence: Optional[str] = None
    origine: Optional[str] = None


class EstranFieldMapping(BaseModel):
    effectif_total: str
    effectif_seme: str
    total_recolte_kg: str
    hc_resseme_kg: str
    vendable_kg_200m: str
    nb_ligne_recolte_200m: str
    poids_moyen_prim_g: str
    poids_moyen_hc_g: str
    nb_ligne_semee_200m: str
    residence_estran: str
    origine_recolte_primaire: str


class EstranKpiResponse(BaseModel):
    items: List[EstranKpiItem]
    chart_series: List[EstranKpiSeriesPoint]
    field_mapping: EstranFieldMapping
    notes: List[str]


class ChartDataPoint(BaseModel):
    annee: int
    parc: str
    valeur: float


class StockAgeDataPoint(BaseModel):
    tranche: str
    lignes: int
    parc: Optional[str] = None


class EstranFiltersResponse(BaseModel):
    parcs: List[str]
    annees: List[int]
    months: List[int] = []
    residences: List[str] = []
    origines: List[str] = []
