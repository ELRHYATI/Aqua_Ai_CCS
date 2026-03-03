"""
ML analysis service: clustering, trend detection, automated insights.
Analyzes Estran, Finance, and Achats data for patterns and recommendations.
"""

from dataclasses import dataclass
from typing import Any, List, Optional

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans


@dataclass
class ClusterResult:
    """Result of clustering analysis."""
    cluster_id: int
    label: str
    count: int
    centroid_summary: dict
    top_members: List[dict]


@dataclass
class TrendResult:
    """Simple trend direction and magnitude."""
    metric: str
    direction: str  # up | down | stable
    change_pct: float
    recent_avg: float
    prior_avg: float


@dataclass
class InsightItem:
    """Single automated insight."""
    type: str  # anomaly | trend | cluster | risk | recommendation
    title: str
    description: str
    severity: str  # info | warning | critical
    data: Optional[dict] = None


def _safe_float(v: Any) -> float:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return 0.0
    return float(v)


def cluster_finance_lines(df: pd.DataFrame, n_clusters: int = 4) -> List[ClusterResult]:
    """
    Cluster finance lines by variance behavior (budget, real, var_b_r, var_pct).
    Returns cluster summaries with representative members.
    """
    if df.empty or len(df) < n_clusters:
        return []

    features = ["budget", "real", "var_b_r", "var_pct"]
    available = [c for c in features if c in df.columns]
    if not available:
        available = df.select_dtypes(include=[np.number]).columns.tolist()[:4]

    X = df[available].copy()
    X = X.fillna(0)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_clusters = min(n_clusters, len(df) - 1, 8)
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)

    df = df.copy()
    df["_cluster"] = labels

    results: List[ClusterResult] = []
    cluster_labels = ["Faible variance", "Variance modérée", "Fort écart", "Outlier"][:n_clusters]

    for i in range(n_clusters):
        subset = df[df["_cluster"] == i]
        if subset.empty:
            continue

        centroid = kmeans.cluster_centers_[i]
        centroid_summary = {}
        for j, col in enumerate(available):
            if j < len(centroid):
                centroid_summary[col] = float(centroid[j])

        top = subset.head(3)
        top_members = [
            {
                "code": row.get("code"),
                "label": str(row.get("label", ""))[:40],
                "var_b_r": _safe_float(row.get("var_b_r")),
            }
            for _, row in top.iterrows()
        ]

        label = cluster_labels[i] if i < len(cluster_labels) else f"Cluster {i + 1}"
        results.append(
            ClusterResult(
                cluster_id=i,
                label=label,
                count=len(subset),
                centroid_summary=centroid_summary,
                top_members=top_members,
            )
        )

    return results


def detect_finance_trends(df: pd.DataFrame) -> List[TrendResult]:
    """
    Simple trend detection: compare recent vs prior periods for key metrics.
    """
    if df.empty or len(df) < 10:
        return []

    metrics = ["budget", "real", "var_b_r", "ytd"]
    available = [c for c in metrics if c in df.columns]
    results: List[TrendResult] = []

    for col in available:
        vals = df[col].dropna().replace([np.inf, -np.inf], 0)
        if len(vals) < 4:
            continue

        mid = len(vals) // 2
        prior = vals.iloc[:mid].mean()
        recent = vals.iloc[mid:].mean()
        if prior == 0:
            change_pct = 0.0
        else:
            change_pct = ((recent - prior) / abs(prior)) * 100

        if abs(change_pct) < 5:
            direction = "stable"
        elif change_pct > 0:
            direction = "up"
        else:
            direction = "down"

        results.append(
            TrendResult(
                metric=col,
                direction=direction,
                change_pct=round(change_pct, 2),
                recent_avg=round(float(recent), 2),
                prior_avg=round(float(prior), 2),
            )
        )
    return results


def generate_insights(
    estran_df: Optional[pd.DataFrame] = None,
    finance_df: Optional[pd.DataFrame] = None,
    achats_df: Optional[pd.DataFrame] = None,
    anomaly_results: Optional[dict] = None,
) -> List[InsightItem]:
    """
    Generate automated insights from database analysis.
    anomaly_results: {"estran": count, "finance": count, "achats": count}
    """
    insights: List[InsightItem] = []

    if anomaly_results:
        total = sum(anomaly_results.values())
        if total > 0:
            insights.append(
                InsightItem(
                    type="anomaly",
                    title="Anomalies détectées",
                    description=f"{total} anomalie(s) identifiée(s) par ML (Estran: {anomaly_results.get('estran', 0)}, Finance: {anomaly_results.get('finance', 0)}, Achats: {anomaly_results.get('achats', 0)})",
                    severity="warning" if total > 5 else "info",
                    data=anomaly_results,
                )
            )

    if finance_df is not None and not finance_df.empty:
        # Top variance insight
        if "var_b_r" in finance_df.columns:
            top_var = finance_df.loc[finance_df["var_b_r"].abs().idxmax()]
            var_val = _safe_float(top_var.get("var_b_r"))
            if abs(var_val) > 10000:
                insights.append(
                    InsightItem(
                        type="recommendation",
                        title="Plus forte variance Budget/Réalisé",
                        description=f"Code {top_var.get('code')}: VAR B/R = {var_val:,.0f}. À investiguer en priorité.",
                        severity="warning",
                        data={"code": str(top_var.get("code")), "var_b_r": var_val},
                    )
                )

        trends = detect_finance_trends(finance_df)
        for t in trends:
            if t.direction != "stable" and abs(t.change_pct) > 10:
                insights.append(
                    InsightItem(
                        type="trend",
                        title=f"Tendance {t.metric}",
                        description=f"{t.direction}: {t.change_pct:+.1f}% (récent: {t.recent_avg:,.0f} vs antérieur: {t.prior_avg:,.0f})",
                        severity="info",
                        data={"metric": t.metric, "change_pct": t.change_pct},
                    )
                )

    if achats_df is not None and not achats_df.empty:
        if "delay_days" in achats_df.columns:
            max_delay = achats_df["delay_days"].max()
            if max_delay and max_delay > 30:
                insights.append(
                    InsightItem(
                        type="risk",
                        title="Retard Achats élevé",
                        description=f"Retard maximal: {max_delay} jours. DA/BC à risque de livraison.",
                        severity="warning",
                        data={"max_delay_days": int(max_delay)},
                    )
                )

    if estran_df is not None and not estran_df.empty:
        if "biomasse_gr" in estran_df.columns:
            total_biom = estran_df["biomasse_gr"].sum()
            if total_biom > 0:
                insights.append(
                    InsightItem(
                        type="cluster",
                        title="Biomasse totale Estran",
                        description=f"Somme biomasse GR: {total_biom:,.0f}. Base de production actuelle.",
                        severity="info",
                        data={"total_biomasse_gr": float(total_biom)},
                    )
                )

    return insights
