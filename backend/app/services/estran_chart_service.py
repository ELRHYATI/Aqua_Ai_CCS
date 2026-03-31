"""
Estran KPI chart service — shared filter / group / aggregate pipeline
for the 9 redesigned KPI chart endpoints.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Callable, Optional

from fastapi import HTTPException
from sqlalchemy import and_, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord
from app.services.estran_service import compute_vendable_kg_per_200m
from app.schemas.estran_kpi import (
    KpiChartGroup,
    KpiChartPeriod,
    KpiChartResponse,
    KpiNewFiltersResponse,
)

MONTH_LABELS = [
    "", "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
    "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
]


# ── Helpers ────────────────────────────────────────────

def _norm(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _to_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _record_effectif_total(r: EstranRecord) -> Optional[float]:
    eff = _to_float(r.effectif_seme)
    if eff is None:
        return None
    pct = _to_float(r.pct_recolte)
    if pct is not None:
        return eff * pct
    taux = _to_float(r.taux_recapture)
    if taux is not None:
        return eff * taux
    return None


def _record_hc_resseme_kg(r: EstranRecord) -> Optional[float]:
    return _to_float(r.quantite_semee_kg) or _to_float(r.effectif_seme)


def _record_residence(r: EstranRecord) -> Optional[str]:
    return _norm(r.zone) or _norm(r.parc_an)


def _group_key(r: EstranRecord, group_by: str) -> str:
    if group_by == "parc":
        return _norm(r.parc_semi) or "Inconnu"
    if group_by == "residence_estran":
        return _record_residence(r) or "Inconnu"
    if group_by == "origine_recolte":
        return _norm(r.origine) or "Inconnu"
    return "Global"


def _calendar_from_record(r: EstranRecord) -> tuple[int, int]:
    if r.year is not None and r.month is not None:
        return (int(r.year), int(r.month))
    primary = r.date_recolte or r.date_semis
    if primary is not None:
        return (primary.year, primary.month)
    return (0, 0)


def _period_key(r: EstranRecord, x_axis: str) -> str:
    y, m = _calendar_from_record(r)
    if x_axis == "annee":
        return str(y)
    if x_axis == "mois":
        return MONTH_LABELS[m] if 1 <= m <= 12 else str(m)
    y_short = str(y)[-2:] if y else "00"
    ml = MONTH_LABELS[m] if 1 <= m <= 12 else str(m)
    return f"{ml} {y_short}"


def _period_sort_key(r: EstranRecord, x_axis: str) -> tuple[int, int]:
    y, m = _calendar_from_record(r)
    if x_axis == "annee":
        return (y, 0)
    if x_axis == "mois":
        return (0, m)
    return (y, m)


# ── Shared query + filtering ──────────────────────────

def _sheet_clause(sheet_name: str):
    """Primaire = feuille « Primaire » ou lignes BD ESTRA (sheet_name NULL), comme le viewer BD."""
    target = sheet_name.strip().lower()
    if target == "primaire":
        sn = func.lower(func.trim(EstranRecord.sheet_name))
        return or_(sn == "primaire", EstranRecord.sheet_name.is_(None))
    sn = func.lower(func.trim(EstranRecord.sheet_name))
    return sn == "hors calibre"


async def _fetch_rows(
    db: AsyncSession,
    *,
    sheet_name: str,
    require_recolte: bool,
    require_stock: bool,
    periode: str,
    date_from: Optional[date],
    date_to: Optional[date],
    filtre2: Optional[str],
) -> list[EstranRecord]:
    q = select(EstranRecord).where(_sheet_clause(sheet_name))

    if require_recolte:
        q = q.where(EstranRecord.date_recolte.isnot(None))
    if require_stock:
        q = q.where(EstranRecord.date_recolte.is_(None))
        q = q.where(
            (EstranRecord.etat_recolte.is_(None))
            | (EstranRecord.etat_recolte == "")
        )

    now = date.today()
    cy = now.year
    min_y = cy - 1
    cutoff = now - timedelta(days=365)

    if periode == "cette_annee":
        q = q.where(
            or_(
                EstranRecord.year == cy,
                and_(
                    EstranRecord.year.is_(None),
                    or_(
                        extract("year", EstranRecord.date_recolte) == cy,
                        extract("year", EstranRecord.date_semis) == cy,
                    ),
                ),
            )
        )
    elif periode == "12_mois":
        q = q.where(
            or_(
                EstranRecord.date_recolte >= cutoff,
                EstranRecord.date_semis >= cutoff,
            )
        )
    elif periode == "2_ans":
        q = q.where(
            or_(
                EstranRecord.year >= min_y,
                and_(
                    EstranRecord.year.is_(None),
                    or_(
                        extract("year", EstranRecord.date_recolte) >= min_y,
                        extract("year", EstranRecord.date_semis) >= min_y,
                    ),
                ),
            )
        )
    elif periode == "tout":
        pass
    elif periode == "custom":
        if date_from:
            q = q.where(EstranRecord.date_semis >= date_from)
        if date_to:
            q = q.where(EstranRecord.date_semis <= date_to)

    if filtre2:
        q = q.where(EstranRecord.origine == filtre2)

    result = await db.execute(q)
    return list(result.scalars().all())


# ── Generic aggregation builder ───────────────────────

AggFn = Callable[[list[EstranRecord]], Optional[float]]


def _build_chart_response(
    rows: list[EstranRecord],
    *,
    kpi_name: str,
    unit: str,
    formula: str,
    x_axis: str,
    group_by: str,
    agg_fn: AggFn,
) -> KpiChartResponse:
    bucket: dict[str, dict[str, list[EstranRecord]]] = defaultdict(
        lambda: defaultdict(list)
    )
    sort_keys: dict[str, tuple[int, int]] = {}

    all_groups: set[str] = set()
    for r in rows:
        pk = _period_key(r, x_axis)
        gk = _group_key(r, group_by)
        bucket[pk][gk].append(r)
        all_groups.add(gk)
        sk = _period_sort_key(r, x_axis)
        if pk not in sort_keys or sk < sort_keys[pk]:
            sort_keys[pk] = sk

    sorted_periods = sorted(bucket.keys(), key=lambda p: sort_keys.get(p, (0, 0)))

    data: list[KpiChartPeriod] = []
    for pk in sorted_periods:
        groups: list[KpiChartGroup] = []
        for gk in sorted(all_groups):
            recs = bucket[pk].get(gk, [])
            val = agg_fn(recs) if recs else None
            groups.append(KpiChartGroup(name=gk, value=round(val, 2) if val is not None else None))
        data.append(KpiChartPeriod(period=pk, groups=groups))

    return KpiChartResponse(
        kpi_name=kpi_name,
        unit=unit,
        formula=formula,
        data=data,
        groups_available=sorted(all_groups),
    )


# ── Aggregation functions ─────────────────────────────

def _agg_recapture(recs: list[EstranRecord]) -> Optional[float]:
    num = sum(v for r in recs if (v := _record_effectif_total(r)) is not None)
    den = sum(v for r in recs if (v := _to_float(r.effectif_seme)) is not None)
    if den == 0:
        return None
    return (num / den) * 100


def _agg_biomasse_recuperee(recs: list[EstranRecord]) -> Optional[float]:
    num = sum(v for r in recs if (v := _to_float(r.quantite_brute_recoltee_kg)) is not None)
    den = sum(v for r in recs if (v := _record_hc_resseme_kg(r)) is not None)
    if den == 0:
        return None
    return (num / den) * 100


def _agg_vendable_ligne(recs: list[EstranRecord]) -> Optional[float]:
    """SUM(V kg/200m) / SUM(nb lignes), avec V/200m = V(kg)×200/longueur(m) quand possible."""
    if not recs:
        return None
    num = sum(v for r in recs if (v := compute_vendable_kg_per_200m(r)) is not None)
    den = sum(v for r in recs if (v := _to_float(r.nb_ligne_semee_200m)) is not None)
    if den > 0:
        return num / den
    if num == 0:
        return None
    cnt = sum(1 for r in recs if compute_vendable_kg_per_200m(r) is not None)
    if cnt == 0:
        return None
    return num / cnt


def _agg_poids_moyen(recs: list[EstranRecord]) -> Optional[float]:
    vals = [v for r in recs if (v := _to_float(r.biomasse_gr)) is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _agg_nb_lignes(recs: list[EstranRecord]) -> Optional[float]:
    total = sum(v for r in recs if (v := _to_float(r.nb_ligne_semee_200m)) is not None)
    return total or None


# ── 9 public KPI functions ────────────────────────────

async def kpi_recapture_primaire(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Primaire", require_recolte=True, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=None,
    )
    return _build_chart_response(
        rows, kpi_name="% Recapture Primaire", unit="%",
        formula="SUM(effectif_total) / SUM(effectif_semé) × 100",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_recapture,
    )


async def kpi_recapture_hc(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
    filtre2: Optional[str] = None,
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Hors calibre", require_recolte=True, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=filtre2,
    )
    return _build_chart_response(
        rows, kpi_name="% Recapture HC", unit="%",
        formula="SUM(effectif_total) / SUM(effectif_semé) × 100",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_recapture,
    )


async def kpi_biomasse_recuperee(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
) -> KpiChartResponse:
    # Même périmètre que /kpi/production (toutes les lignes HC avec filtres période), pas seulement date_recolte renseignée.
    rows = await _fetch_rows(
        db, sheet_name="Hors calibre", require_recolte=False, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=None,
    )
    return _build_chart_response(
        rows, kpi_name="% Biomasse Récupérée", unit="%",
        formula='SUM("Total récolté (Kg)") / SUM("HC Ressemé (kg)") × 100',
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_biomasse_recuperee,
    )


async def kpi_vendable_ligne_primaire(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Primaire", require_recolte=True, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=None,
    )
    return _build_chart_response(
        rows, kpi_name="Vendable / Ligne Primaire", unit="Kg/ligne",
        formula="SUM(V(kg)×200/L(m)) / SUM(nb lignes récoltées) — repli: colonne kg/200m importée",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_vendable_ligne,
    )


async def kpi_vendable_ligne_hc(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
    filtre2: Optional[str] = None,
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Hors calibre", require_recolte=False, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=filtre2,
    )
    return _build_chart_response(
        rows, kpi_name="Vendable / Ligne HC", unit="Kg/ligne",
        formula='SUM(V(kg)×200/L(m)) / SUM("Nombre de ligne récolté (200m)") — repli: kg/200m importé',
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_vendable_ligne,
    )


async def kpi_poids_moyen_primaire(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Primaire", require_recolte=True, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=None,
    )
    return _build_chart_response(
        rows, kpi_name="Poids Moyen Primaire", unit="g",
        formula="AVG(pm_tot_g)",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_poids_moyen,
    )


async def kpi_poids_moyen_hc(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
    filtre2: Optional[str] = None,
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Hors calibre", require_recolte=True, require_stock=False,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=filtre2,
    )
    return _build_chart_response(
        rows, kpi_name="Poids Moyen HC", unit="g",
        formula="AVG(pm_total)",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_poids_moyen,
    )


async def kpi_stock_lignes_primaire(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
) -> KpiChartResponse:
    if group_by == "residence_estran":
        raise HTTPException(
            status_code=400,
            detail="group_by='residence_estran' n'est pas supporté pour Stock Lignes Primaire",
        )
    rows = await _fetch_rows(
        db, sheet_name="Primaire", require_recolte=False, require_stock=True,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=None,
    )
    return _build_chart_response(
        rows, kpi_name="Nombre de Lignes Primaire", unit="lignes",
        formula="SUM(nombre_ligne_semé_200m)",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_nb_lignes,
    )


async def kpi_stock_lignes_hc(
    db: AsyncSession, x_axis: str, group_by: str,
    periode: str, date_from: Optional[date], date_to: Optional[date],
    filtre2: Optional[str] = None,
) -> KpiChartResponse:
    rows = await _fetch_rows(
        db, sheet_name="Hors calibre", require_recolte=False, require_stock=True,
        periode=periode, date_from=date_from, date_to=date_to, filtre2=filtre2,
    )
    return _build_chart_response(
        rows, kpi_name="Nombre de Lignes HC", unit="lignes",
        formula="SUM(nombre_ligne_semé_200m)",
        x_axis=x_axis, group_by=group_by, agg_fn=_agg_nb_lignes,
    )


# ── Filters ───────────────────────────────────────────

async def get_kpi_filters(db: AsyncSession) -> KpiNewFiltersResponse:
    q = select(
        EstranRecord.parc_semi,
        EstranRecord.zone,
        EstranRecord.parc_an,
        EstranRecord.origine,
        EstranRecord.year,
    )
    result = await db.execute(q)
    rows = result.all()

    parcs = sorted({_norm(r.parc_semi) for r in rows if _norm(r.parc_semi)})
    residences = sorted({
        (_norm(r.zone) or _norm(r.parc_an))
        for r in rows
        if (_norm(r.zone) or _norm(r.parc_an))
    })
    origines = sorted({_norm(r.origine) for r in rows if _norm(r.origine)})
    annees = sorted(
        {int(r.year) for r in rows if r.year is not None},
        reverse=True,
    )

    return KpiNewFiltersResponse(
        parcs=[x for x in parcs if x],
        residences_estran=[x for x in residences if x],
        origines_recolte=[x for x in origines if x],
        annees=annees,
    )
