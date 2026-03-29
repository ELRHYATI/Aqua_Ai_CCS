"""
Extract parameters from natural language for analytical queries.
Handles percentages (65% transfert / 35% classique) and exercice dates (01/07 - 30/06).
"""

import re
from dataclasses import dataclass
from typing import Optional

# French month name -> number
_MOIS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}


@dataclass
class VendableParams:
    transfert_pct: float  # 0-1
    classique_pct: float  # 0-1
    start_month: int  # 1-12, exercice start
    end_month: int   # 1-12, exercice end (wraps to next year)
    date_debut_str: str  # e.g. "01/07"
    date_fin_str: str    # e.g. "30/06"


def _extract_percentages(text: str) -> tuple[float, float]:
    """
    Extract transfert% and classique% from text.
    Patterns: "65% transfert et 35% classique", "70/30", "60%-40%", "70 % transfert 30 % classique"
    Returns (transfert_pct, classique_pct) as 0-1, default (0.65, 0.35).
    """
    lower = text.lower()
    transfert_pct, classique_pct = 0.65, 0.35

    # Pattern: X% transfert ... Y% classique (or inverse)
    # e.g. "65% transfert et 35% classique", "35% classique 65% transfert"
    pct_pattern = r"(\d{1,3})\s*%\s*(transfert|classique)"
    matches = list(re.finditer(pct_pattern, lower, re.IGNORECASE))
    if len(matches) >= 2:
        vals = [(min(100, max(0, int(m.group(1)))), m.group(2).lower()) for m in matches[:2]]
        for pct, typ in vals:
            if typ == "transfert":
                transfert_pct = pct / 100
            else:
                classique_pct = pct / 100
    elif len(matches) == 1:
        pct, typ = min(100, max(0, int(matches[0].group(1)))) / 100, matches[0].group(2).lower()
        if typ == "transfert":
            transfert_pct, classique_pct = pct, 1.0 - pct
        else:
            classique_pct, transfert_pct = pct, 1.0 - pct

    # Pattern: X/Y or X-Y (e.g. 70/30, 60-40) when no explicit % was found
    if len(matches) == 0:
        ratio_match = re.search(r"(\d{1,3})\s*[/\-]\s*(\d{1,3})", lower)
        if ratio_match and ("transfert" in lower or "classique" in lower):
            a, b = int(ratio_match.group(1)), int(ratio_match.group(2))
            if a + b > 0:
                transfert_pct = min(100, max(0, a)) / (a + b)
                classique_pct = min(100, max(0, b)) / (a + b)

    # Normalize to sum = 1
    total = transfert_pct + classique_pct
    if total > 0:
        transfert_pct, classique_pct = transfert_pct / total, classique_pct / total

    return round(transfert_pct, 4), round(classique_pct, 4)


def _extract_exercice_dates(text: str) -> tuple[int, int, str, str]:
    """
    Extract exercice start/end from text.
    Patterns: "01/07" "30/06", "1er juillet" "30 juin", "commence le 01/07", "prend fin 30/06"
    Returns (start_month, end_month, date_debut_str, date_fin_str).
    Default: July 1 - June 30 → (7, 6, "01/07", "30/06").
    """
    lower = text.lower()
    start_month, end_month = 7, 6
    date_debut_str, date_fin_str = "01/07", "30/06"

    # DD/MM or D/M patterns
    date_pattern = r"(?:^|\s)(\d{1,2})/(\d{1,2})(?:\s|$|.)"
    dates = list(re.finditer(date_pattern, text))
    if len(dates) >= 2:
        # Assume first = début, second = fin
        d1, m1 = int(dates[0].group(1)), int(dates[0].group(2))
        d2, m2 = int(dates[1].group(1)), int(dates[1].group(2))
        if 1 <= m1 <= 12 and 1 <= m2 <= 12:
            start_month, end_month = m1, m2
            date_debut_str = f"{d1:02d}/{m1:02d}"
            date_fin_str = f"{d2:02d}/{m2:02d}"
    elif len(dates) == 1:
        d, m = int(dates[0].group(1)), int(dates[0].group(2))
        if 1 <= m <= 12:
            if "commence" in lower or "début" in lower or "début" in lower:
                start_month = m
                date_debut_str = f"{d:02d}/{m:02d}"
            elif "fin" in lower or "termine" in lower:
                end_month = m
                date_fin_str = f"{d:02d}/{m:02d}"

    # Month names: "juillet" "juin", "1er juillet" "30 juin"
    for name, num in _MOIS_FR.items():
        if name in lower:
            # Check context: début/commence vs fin
            idx = lower.find(name)
            snippet = lower[max(0, idx - 50) : idx + len(name) + 10]
            if "commence" in snippet or "début" in snippet or "1er" in snippet or "01" in snippet:
                if "fin" not in snippet and "termine" not in snippet:
                    start_month = num
                    date_debut_str = f"01/{num:02d}"
            if "fin" in snippet or "termine" in snippet or "30" in snippet:
                end_month = num
                last_day = {4: 30, 6: 30, 9: 30, 11: 30, 2: 28}.get(num, 31)
                date_fin_str = f"{last_day:02d}/{num:02d}"

    return start_month, end_month, date_debut_str, date_fin_str


def extract_vendable_params(user_message: str) -> VendableParams:
    """Extract all parameters for vendable par exercice from user message."""
    transfert_pct, classique_pct = _extract_percentages(user_message)
    start_month, end_month, date_debut_str, date_fin_str = _extract_exercice_dates(user_message)
    return VendableParams(
        transfert_pct=transfert_pct,
        classique_pct=classique_pct,
        start_month=start_month,
        end_month=end_month,
        date_debut_str=date_debut_str,
        date_fin_str=date_fin_str,
    )
