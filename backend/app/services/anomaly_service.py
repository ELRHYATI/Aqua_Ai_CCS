"""
Anomaly detection for Estran, Finance, and Achats data.
Algorithms: IsolationForest, Local Outlier Factor (LOF), One-Class SVM, Z-Score.
"""

from typing import List, Optional, Tuple

import math
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

# Domain-specific numeric columns for anomaly detection (includes taux_recapture for Exemple BDD estran)
ESTRAN_FEATURES = [
    "effectif_seme",
    "quantite_semee_kg",
    "quantite_brute_recoltee_kg",
    "quantite_casse_kg",
    "biomasse_gr",
    "biomasse_vendable_kg",
    "pct_recolte",
    "taux_recapture",
    "longueur_ligne",
    "nb_ligne_semee_200m",
]

FINANCE_FEATURES = [
    "ytd",
    "n1",
    "budget",
    "real",
    "var_b_r",
    "var_pct",
    "var_r_n1",
    "fy",
]

ACHAT_FEATURES = ["amount", "delay_days"]


def _prepare_features(
    df: pd.DataFrame,
    feature_columns: Optional[List[str]] = None,
) -> pd.DataFrame:
    """Select and impute numeric columns for anomaly detection."""
    if feature_columns:
        available = [c for c in feature_columns if c in df.columns]
    else:
        available = df.select_dtypes(include=[np.number]).columns.tolist()[:10]

    if not available:
        return pd.DataFrame()

    X = df[available].copy()
    X = X.fillna(X.median()).fillna(0)
    return X


def _run_detector(
    X_scaled: np.ndarray,
    method: str,
    contamination: float = 0.1,
) -> Tuple[np.ndarray, np.ndarray]:
    """Run the selected anomaly detector. Returns (scores, is_anomaly)."""
    if method == "isolation_forest":
        model = IsolationForest(contamination=contamination, random_state=42)
        preds = model.fit_predict(X_scaled)
        scores = -model.score_samples(X_scaled)
    elif method == "lof":
        model = LocalOutlierFactor(contamination=contamination, novelty=False)
        preds = model.fit_predict(X_scaled)
        scores = -model.negative_outlier_factor_
    elif method == "one_class_svm":
        nu = min(contamination * 1.2, 0.5)
        model = OneClassSVM(nu=nu, gamma="scale", kernel="rbf")
        preds = model.fit_predict(X_scaled)
        scores = -model.decision_function(X_scaled)
    else:
        raise ValueError(f"Unknown method: {method}")

    is_anomaly = preds == -1
    return scores, is_anomaly


def detect_anomalies(
    df: pd.DataFrame,
    method: str = "isolation_forest",
    contamination: float = 0.1,
    feature_columns: Optional[List[str]] = None,
    use_fallback: bool = True,
) -> Tuple[pd.DataFrame, str]:
    """
    Run anomaly detection. Returns (df_with_scores, method_used).
    """
    if df.empty or len(df) < 3:
        df_out = df.copy()
        df_out["anomaly_score"] = 0.0
        df_out["is_anomaly"] = False
        return df_out, "none"

    X = _prepare_features(df, feature_columns)
    if X.empty:
        df_out = df.copy()
        df_out["anomaly_score"] = 0.0
        df_out["is_anomaly"] = False
        return df_out, "none"

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    try:
        scores, is_anomaly = _run_detector(X_scaled, method, contamination)
    except Exception:
        if use_fallback:
            scores, is_anomaly = _run_detector(X_scaled, "isolation_forest", contamination)
            method = "isolation_forest"
        else:
            raise

    df_out = df.copy()
    df_out["anomaly_score"] = scores
    df_out["is_anomaly"] = is_anomaly

    return df_out, method


def detect_anomalies_zscore(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    threshold: float = 3.0,
    feature_columns: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    Z-score based anomaly flag (fallback).
    """
    if df.empty or len(df) < 3:
        return df.assign(anomaly_score=0.0, is_anomaly=False)

    X = _prepare_features(df, feature_columns or columns)
    if X.empty:
        return df.assign(anomaly_score=0.0, is_anomaly=False)

    z_scores = np.abs((X - X.mean()) / X.std().replace(0, 1))
    max_z = z_scores.max(axis=1)
    is_anomaly = max_z > threshold

    df_out = df.copy()
    df_out["anomaly_score"] = max_z.values
    df_out["is_anomaly"] = is_anomaly
    return df_out


def get_severity(score: float, method: str = "isolation_forest") -> str:
    """Map anomaly score to severity (low, medium, high)."""
    if method in ("isolation_forest", "lof", "one_class_svm"):
        if score > 0.6:
            return "high"
        if score > 0.4:
            return "medium"
        return "low"
    else:
        if score > 4.0:
            return "high"
        if score > 3.0:
            return "medium"
        return "low"


def _compute_reason(row: dict, df: pd.DataFrame, domain: str) -> str:
    """Add human-readable reason for anomaly (e.g. 'Value is 3.2x above median')."""
    if df.empty or len(df) < 2:
        return ""
    reasons = []
    cols = ["biomasse_gr", "taux_recapture", "quantite_brute_recoltee_kg"] if domain == "estran" else \
           ["var_b_r", "var_pct", "ytd"] if domain == "finance" else ["amount", "delay_days"]
    for col in cols:
        if col not in df.columns or col not in row:
            continue
        val = row.get(col)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            continue
        try:
            v = float(val)
        except (TypeError, ValueError):
            continue
        col_vals = df[col].dropna()
        if len(col_vals) < 2:
            continue
        median = float(col_vals.median())
        mean = float(col_vals.mean())
        std = float(col_vals.std())
        if std == 0:
            continue
        z = (v - mean) / std
        if abs(z) < 1.5:
            continue
        if domain == "estran":
            if col == "biomasse_gr" and median > 0:
                ratio = v / median
                if ratio > 1.5:
                    reasons.append(f"Biomasse {ratio:.1f}x au-dessus de la médiane")
                elif ratio < 0.5:
                    reasons.append(f"Biomasse {1/ratio:.1f}x en-dessous de la médiane")
            elif col == "taux_recapture":
                reasons.append(f"Taux recapture {abs(z):.1f}σ de la moyenne")
        elif domain == "finance":
            if abs(z) >= 2:
                reasons.append(f"{col} à {abs(z):.1f}σ de la moyenne")
        else:
            if col == "delay_days" and v > 0:
                med_d = float(col_vals.median())
                if med_d > 0 and v / med_d > 1.5:
                    reasons.append(f"Retard {v/med_d:.1f}x la médiane")
    return " ; ".join(reasons[:2]) if reasons else "Écart statistique significatif détecté"


def _build_estran_explanation(row: dict, severity: str, reason: str = "") -> str:
    parts = [f"Sévérité: {severity}"]
    if reason:
        parts.append(reason)
    if row.get("quantite_brute_recoltee_kg") is not None:
        parts.append(f"quantité récoltée: {row['quantite_brute_recoltee_kg']} kg")
    if row.get("biomasse_gr") is not None:
        parts.append(f"biomasse GR: {row['biomasse_gr']}")
    tr = row.get("taux_recapture")
    if tr is not None and not (isinstance(tr, float) and math.isnan(tr)):
        try:
            parts.append(f"taux recapture: {float(tr):.1%}")
        except (TypeError, ValueError):
            pass
    if row.get("parc_semi"):
        parts.append(f"parc {row['parc_semi']}")
    if row.get("ligne_num") is not None:
        parts.append(f"ligne {row['ligne_num']}")
    return " | ".join(parts)


def _build_finance_explanation(row: dict, severity: str, reason: str = "") -> str:
    parts = [f"Sévérité: {severity}"]
    if reason:
        parts.append(reason)
    if row.get("code"):
        parts.append(f"code: {row['code']}")
    if row.get("label"):
        parts.append(f"label: {str(row['label'])[:30]}")
    if row.get("var_b_r") is not None:
        parts.append(f"VAR B/R: {row['var_b_r']}")
    if row.get("var_pct") is not None:
        parts.append(f"%: {row['var_pct']}%")
    return " | ".join(parts)


def _build_achat_explanation(row: dict, severity: str, reason: str = "") -> str:
    parts = [f"Sévérité: {severity}"]
    if reason:
        parts.append(reason)
    if row.get("reference"):
        parts.append(f"ref: {row['reference']}")
    if row.get("amount") is not None:
        parts.append(f"montant: {row['amount']}")
    if row.get("delay_days") is not None:
        parts.append(f"retard: {row['delay_days']}j")
    return " | ".join(parts)


def run_anomaly_detection(
    df: pd.DataFrame,
    method: str = "isolation_forest",
    use_fallback: bool = True,
    domain: str = "estran",
    contamination: float = 0.1,
) -> pd.DataFrame:
    """
    Run anomaly detection with explanation. Returns df with anomaly_score, is_anomaly, severity, explanation.
    domain: estran | finance | achats
    """
    feature_cols = {
        "estran": ESTRAN_FEATURES,
        "finance": FINANCE_FEATURES,
        "achats": ACHAT_FEATURES,
    }.get(domain)

    build_explanation = {
        "estran": _build_estran_explanation,
        "finance": _build_finance_explanation,
        "achats": _build_achat_explanation,
    }.get(domain, _build_estran_explanation)

    try:
        df_out, used_method = detect_anomalies(
            df,
            method=method,
            contamination=contamination,
            feature_columns=feature_cols,
            use_fallback=use_fallback,
        )
    except Exception:
        df_out = detect_anomalies_zscore(df, feature_columns=feature_cols)
        used_method = "zscore"

    df_out["severity"] = df_out["anomaly_score"].apply(
        lambda s: get_severity(float(s), used_method)
    )

    def _make_explanation(r):
        d = r.to_dict()
        sev = r["severity"]
        reason = _compute_reason(d, df_out, domain) if r["is_anomaly"] else ""
        return build_explanation(d, sev, reason)

    df_out["explanation"] = df_out.apply(_make_explanation, axis=1)
    df_out["reason"] = df_out.apply(
        lambda r: _compute_reason(r.to_dict(), df_out, domain) if r["is_anomaly"] else "",
        axis=1,
    )
    return df_out
