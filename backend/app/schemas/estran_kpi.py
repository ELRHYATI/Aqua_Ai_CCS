from datetime import date, datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict


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
    # Feuille Primaire (Excel col. B = N PARC AN, col. C = génération de semi)
    n_parc_an: List[str] = []
    generations_semi: List[str] = []


# ── New chart KPI models ──────────────────────────────

class KpiChartGroup(BaseModel):
    name: str
    value: Optional[float] = None


class KpiChartPeriod(BaseModel):
    period: str
    groups: List[KpiChartGroup]


class KpiChartResponse(BaseModel):
    kpi_name: str
    unit: str
    formula: str
    data: List[KpiChartPeriod]
    groups_available: List[str]


class KpiNewFiltersResponse(BaseModel):
    parcs: List[str]
    residences_estran: List[str]
    origines_recolte: List[str]
    annees: List[int]


# ── DB viewer models ──────────────────────────────────

class EstranDbRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parc_semi: Optional[str] = None
    parc_an: Optional[str] = None
    generation_semi: Optional[str] = None
    ligne_num: Optional[int] = None
    ett: Optional[str] = None
    phase: Optional[str] = None
    origine: Optional[str] = None
    type_semi: Optional[str] = None
    longueur_ligne: Optional[float] = None
    nb_ligne_semee_200m: Optional[float] = None
    zone: Optional[str] = None
    date_semis: Optional[date] = None
    date_recolte: Optional[date] = None
    effectif_seme: Optional[float] = None
    quantite_semee_kg: Optional[float] = None
    quantite_brute_recoltee_kg: Optional[float] = None
    quantite_casse_kg: Optional[float] = None
    biomasse_gr: Optional[float] = None
    biomasse_vendable_kg: Optional[float] = None
    statut: Optional[str] = None
    etat_recolte: Optional[str] = None
    pct_recolte: Optional[float] = None
    year: Optional[int] = None
    month: Optional[int] = None
    sheet_name: Optional[str] = None
    type_recolte: Optional[str] = None
    taux_recapture: Optional[float] = None
    objectif_recolte: Optional[str] = None
    # Primaire-specific
    orientation: Optional[str] = None
    taille_seme: Optional[str] = None
    age_td_mois: Optional[float] = None
    residence_estran: Optional[float] = None
    v_kg: Optional[float] = None
    kg_recolte_m2: Optional[float] = None
    poids_mortalite_kg: Optional[float] = None
    # HC-specific
    orientation_lignes: Optional[str] = None
    taille_semi_hc: Optional[str] = None
    hc_resseme_kg_m2: Optional[float] = None
    pct_biomasse_recuperee: Optional[float] = None
    mortalite_kg: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EstranDbPage(BaseModel):
    items: List[EstranDbRow]
    total: int
    page: int
    page_size: int
    pages: int


class EstranDbCounts(BaseModel):
    primaire_total: int
    hc_total: int
    primaire_last_import: Optional[datetime] = None
    hc_last_import: Optional[datetime] = None
