"""ML analysis and anomaly schemas."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class FinanceAnomalyRecord(BaseModel):
    """Finance line with anomaly detection result."""

    id: int
    code: str
    gr: Optional[str] = None
    label: Optional[str] = None
    budget: Optional[float] = None
    real: Optional[float] = None
    n1: Optional[float] = None
    var_b_r: Optional[float] = None
    var_pct: Optional[float] = None
    year: Optional[int] = None
    month: Optional[int] = None
    anomaly_score: float
    severity: str
    is_anomaly: bool = True
    explanation: Optional[str] = None


class AchatAnomalyRecord(BaseModel):
    """DA or BC with anomaly detection result."""

    id: int
    type: str  # "da" or "bc"
    reference: Optional[str] = None
    amount: Optional[float] = None
    delay_days: int
    status: Optional[str] = None
    critical_flag: bool
    expected_delivery_date: Optional[str] = None
    anomaly_score: float
    severity: str
    is_anomaly: bool = True
    explanation: Optional[str] = None


class ClusterResult(BaseModel):
    """Finance clustering result."""

    cluster_id: int
    label: str
    count: int
    centroid_summary: Dict[str, float]
    top_members: List[Dict[str, Any]]


class TrendResult(BaseModel):
    """Trend detection result."""

    metric: str
    direction: str
    change_pct: float
    recent_avg: float
    prior_avg: float


class InsightItem(BaseModel):
    """Automated insight from ML analysis."""

    type: str
    title: str
    description: str
    severity: str
    data: Optional[Dict[str, Any]] = None


class MLAnalysisResponse(BaseModel):
    """Full ML analysis response."""

    clusters: List[ClusterResult]
    trends: List[TrendResult]
    insights: List[InsightItem]
    anomaly_counts: Dict[str, int]
