"""
Configuration du mapping des colonnes Excel vers la structure finance.

Adapter les clés ci-dessous aux noms exacts des colonnes de vos fichiers :
- MODELE-GL.xlsx
- BAL-MODELE.xlsx
- MODELE-RAPPORT.xlsx

Structure cible par ligne :
  account, label, year, month, actual (R), budget (B), lastYear (N-1)
"""

from pathlib import Path
from typing import Optional

# ─── Chemins des fichiers (relatifs au projet ou absolus) ────────────────────
# parents[3] = projet root (backend/app/config -> config, app, backend, projet)
DATA_DIR = Path(__file__).resolve().parents[3] / "data"

# Chemins par fichier. À adapter selon votre arborescence.
MODELE_GL_PATH = DATA_DIR / "MODELE GL.xlsx"
BAL_MODELE_PATH = DATA_DIR / "BAL MODELE.xlsx"
MODELE_RAPPORT_PATH = DATA_DIR / "MODELE RAPPORT.xlsx"

# ─── MODELE RAPPORT.xlsx (Feuil1) ───────────────────────────────────────────
# Structure observée : CODE, "PERIODE YTD MM AAAA", N-1, B, R
# Les valeurs R, B, N-1 sont déjà YTD pour la période indiquée dans l'en-tête.
# Colonnes par index (0-based) :
MODELE_RAPPORT_SHEET = "Feuil1"
MODELE_RAPPORT_COLUMNS = {
    "account": 0,      # CODE (ex: P1110)
    "label": 1,        # Libellé (2e colonne, ex: "Production vendue")
    "last_year": 2,    # N-1
    "budget": 3,       # B
    "actual": 4,       # R (Réalisé)
}
# Extraction year/month depuis l'en-tête "PERIODE YTD 01 2026" (col 1)
# Format attendu : "PERIODE YTD MM AAAA" ou "MM AAAA"
MODELE_RAPPORT_PERIOD_HEADER_INDEX = 1  # index de la colonne contenant le libellé / période

# ─── BAL MODELE.xlsx (Feuil1) ───────────────────────────────────────────────
# Structure : N, COMPTE, BILAN/CPC, MAPPING, R YTD, B YTD, LY YTD
# R YTD = Réalisé YTD, B YTD = Budget YTD, LY YTD = Last Year YTD
BAL_MODELE_SHEET = "Feuil1"
BAL_MODELE_COLUMNS = {
    "account": 0,       # N (numéro de compte SAP 8 chiffres)
    "label": 1,         # COMPTE
    "bilan_cpc": 2,     # BILAN/CPC (ex: P1110) - code CPC pour mapping dynamique
    "mapping": 3,       # MAPPING (ex: E1110, A1110) - code court pour rapprochement GL
    "actual": 4,        # R YTD
    "budget": 5,        # B YTD
    "last_year": 6,     # LY YTD
}

# ─── MODELE GL.xlsx ─────────────────────────────────────────────────────────
# Données transactionnelles (Grand Livre SAP) : chaque ligne = une écriture.
# On agrège par compte pour obtenir YTD Réalisé. Budget et N-1 viennent du BAL (merge).
# Colonnes : Compte général, MAPPING, Compte, Date comptable, ..., Montant
MODELE_GL_SHEET = None  # None = première feuille (ex: SAPAnalyticsReport(FINGLAU02_Q0...)
MODELE_GL_COLUMNS = {
    "account": 0,       # Compte général (ex: 11400000)
    "mapping": 1,       # MAPPING (ex: E1110) - optionnel pour regroupement
    "label": 2,         # Compte (libellé)
    "date": 3,          # Date comptable (format DD.MM.YYYY ou date Excel)
    "amount": 11,       # Montant
}

# Correspondance codes RAPPORT/CPC (P1131, E1110) -> comptes SAP 8 chiffres.
# Sert à résoudre les codes courts vers le Grand Livre (GL).
# - Rempli automatiquement depuis BAL MODELE (MAPPING -> N).
# - Compléter ci-dessous pour les codes CPC (Pxxx) non présents dans le BAL.
# Utilisez les comptes présents dans MODELE GL.xlsx (colonne "Compte général").
RAPPORT_TO_SAP: dict[str, list[str]] = {
    # Codes CPC (MODELE RAPPORT) -> comptes SAP du GL. À adapter à votre plan comptable.
    "P1110": ["71110000"],   # Production vendue
    "P1131": ["23320000", "23321500", "23321600", "23321700", "23321900"],   # Stocks / Comptes 2332
}


def get_finance_data_paths() -> dict[str, Path]:
    """Retourne les chemins des fichiers de données finance."""
    return {
        "modele_gl": MODELE_GL_PATH,
        "bal_modele": BAL_MODELE_PATH,
        "modele_rapport": MODELE_RAPPORT_PATH,
    }
