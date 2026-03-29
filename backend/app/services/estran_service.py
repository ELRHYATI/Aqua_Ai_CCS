from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord
from app.schemas.estran_kpi import (
    EstranFieldMapping,
    EstranFiltersResponse,
    EstranKpiItem,
    EstranKpiBreakdown,
    EstranKpiResponse,
    EstranKpiSeriesPoint,
)


BASE_TO_SHEET = {
    "primaire": "Primaire",
    "hc": "Hors calibre",
}


def _norm_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    txt = str(value).strip()
    return txt or None


def _to_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_blank(value: Optional[str]) -> bool:
    return _norm_str(value) is None


def _safe_div(numerator: float, denominator: float) -> tuple[Optional[float], bool]:
    if denominator == 0:
        return None, True
    return numerator / denominator, False


def _sheet_from_base(base: Optional[str]) -> Optional[str]:
    if not base:
        return None
    return BASE_TO_SHEET.get(base.lower())


def _record_base(record: EstranRecord) -> Optional[str]:
    if record.sheet_name == "Primaire":
        return "Primaire"
    if record.sheet_name == "Hors calibre":
        return "HC"
    return None


def _record_residence(record: EstranRecord) -> Optional[str]:
    # Mapping "résidence estran": currently approximated with zone, fallback parc_an.
    return _norm_str(record.zone) or _norm_str(record.parc_an)


def _record_effectif_total(record: EstranRecord) -> Optional[float]:
    # Excel formula input "Effectif total" is not a native DB column in current model.
    # Approximation: effectif_total ~= effectif_seme * pct_recolte (fallback taux_recapture).
    effectif_seme = _to_float(record.effectif_seme)
    if effectif_seme is None:
        return None
    pct = _to_float(record.pct_recolte)
    if pct is not None:
        return effectif_seme * pct
    taux = _to_float(record.taux_recapture)
    if taux is not None:
        return effectif_seme * taux
    return None


def _record_hc_resseme_kg(record: EstranRecord) -> Optional[float]:
    # Excel input "HC Ressemé (kg)" mapping candidate.
    # 1) quantite_semee_kg when available
    # 2) fallback effectif_seme as temporary proxy
    return _to_float(record.quantite_semee_kg) or _to_float(record.effectif_seme)


@dataclass
class KpiCalc:
    value: Optional[float]
    div_zero: bool


def _sum(records: Iterable[EstranRecord], fn: Callable[[EstranRecord], Optional[float]]) -> float:
    total = 0.0
    for r in records:
        val = fn(r)
        if val is not None:
            total += val
    return total


def _avg(records: Iterable[EstranRecord], fn: Callable[[EstranRecord], Optional[float]]) -> Optional[float]:
    vals: list[float] = []
    for r in records:
        val = fn(r)
        if val is not None:
            vals.append(val)
    if not vals:
        return None
    return sum(vals) / len(vals)


def _calc_recapture(records: list[EstranRecord]) -> KpiCalc:
    # Excel: % recapture = somme(Effectif total) / somme(Effectif semé)
    numerator = _sum(records, _record_effectif_total)
    denominator = _sum(records, lambda r: _to_float(r.effectif_seme))
    value, div_zero = _safe_div(numerator, denominator)
    return KpiCalc(value=value, div_zero=div_zero)


def _calc_biomasse_recuperee(records: list[EstranRecord]) -> KpiCalc:
    # Excel: % biomasse récupérée = somme(Total récolté (Kg)) / somme(HC Ressemé (kg))
    numerator = _sum(records, lambda r: _to_float(r.quantite_brute_recoltee_kg))
    denominator = _sum(records, _record_hc_resseme_kg)
    value, div_zero = _safe_div(numerator, denominator)
    return KpiCalc(value=value, div_zero=div_zero)


def _calc_vendable_ligne(records: list[EstranRecord]) -> KpiCalc:
    # Excel: Vendable / ligne = somme(V (Kg)/200m) / somme(Nombre de ligne récolté (200m))
    numerator = _sum(records, lambda r: _to_float(r.biomasse_vendable_kg))
    denominator = _sum(records, lambda r: _to_float(r.nb_ligne_semee_200m))
    value, div_zero = _safe_div(numerator, denominator)
    return KpiCalc(value=value, div_zero=div_zero)


def _calc_poids_moyen(records: list[EstranRecord]) -> KpiCalc:
    # Excel: Poids moyen = moyenne(PM TOT (g) / PM Total)
    # Temporary mapping to biomasse_gr (closest current field).
    value = _avg(records, lambda r: _to_float(r.biomasse_gr))
    return KpiCalc(value=value, div_zero=False)


def _calc_nb_lignes(records: list[EstranRecord]) -> KpiCalc:
    # Excel: Nombre de ligne = somme(Nombre de ligne semé (200m))
    value = _sum(records, lambda r: _to_float(r.nb_ligne_semee_200m))
    return KpiCalc(value=value, div_zero=False)


def _with_date_recolte(records: list[EstranRecord]) -> list[EstranRecord]:
    return [r for r in records if r.date_recolte is not None]


def _with_empty_date_or_etat(records: list[EstranRecord]) -> list[EstranRecord]:
    # Excel filter: Date de récolte = vide OU état de la récolte = vide
    return [r for r in records if r.date_recolte is None or _is_blank(r.etat_recolte)]


def _apply_base_filters(
    rows: list[EstranRecord],
    *,
    year: Optional[int],
    month: Optional[int],
    parc: Optional[str],
    residence: Optional[str],
    origine: Optional[str],
) -> list[EstranRecord]:
    out: list[EstranRecord] = []
    wanted_parc = _norm_str(parc)
    wanted_residence = _norm_str(residence)
    wanted_orig = _norm_str(origine)
    for r in rows:
        if year is not None and r.year != year:
            continue
        if month is not None and r.month != month:
            continue
        if wanted_parc and _norm_str(r.parc_semi) != wanted_parc:
            continue
        if wanted_residence and _record_residence(r) != wanted_residence:
            continue
        if wanted_orig and _norm_str(r.origine) != wanted_orig:
            continue
        out.append(r)
    return out


def _round(value: Optional[float], unit: str) -> Optional[float]:
    if value is None:
        return None
    if unit == "%":
        return round(value * 100.0, 2)
    if unit == "ligne":
        return round(value, 0)
    return round(value, 2)


def _build_series_for_recapture(
    rows: list[EstranRecord],
    *,
    base_label: str,
    kpi_key: str,
    label: str,
    with_origine: bool,
) -> list[EstranKpiSeriesPoint]:
    # Graph: by year/month with color grouping by parc.
    grouped: dict[tuple[int, int, str, Optional[str]], list[EstranRecord]] = defaultdict(list)
    for r in rows:
        if r.year is None or r.month is None:
            continue
        parc = _norm_str(r.parc_semi) or "Inconnu"
        origin_key = _norm_str(r.origine) if with_origine else None
        grouped[(r.year, r.month, parc, origin_key)].append(r)

    points: list[EstranKpiSeriesPoint] = []
    for (year, month, parc, origin_key), recs in sorted(grouped.items()):
        calc = _calc_recapture(_with_date_recolte(recs))
        points.append(
            EstranKpiSeriesPoint(
                kpiKey=kpi_key,
                label=label,
                base=base_label,  # type: ignore[arg-type]
                unit="%",
                value=_round(calc.value, "%"),
                year=year,
                month=month,
                parc=parc,
                residence=None,
                origine=origin_key,
            )
        )
    return points


def _build_series_for_biomasse_hc(rows: list[EstranRecord]) -> list[EstranKpiSeriesPoint]:
    grouped: dict[tuple[int, int, str, Optional[str]], list[EstranRecord]] = defaultdict(list)
    for r in rows:
        if r.year is None or r.month is None:
            continue
        parc = _norm_str(r.parc_semi) or "Inconnu"
        grouped[(r.year, r.month, parc, _norm_str(r.origine))].append(r)

    points: list[EstranKpiSeriesPoint] = []
    for (year, month, parc, origine), recs in sorted(grouped.items()):
        calc = _calc_biomasse_recuperee(recs)
        points.append(
            EstranKpiSeriesPoint(
                kpiKey="biomasse_recuperee_hc",
                label="% de biomasse récupérée",
                base="HC",
                unit="%",
                value=_round(calc.value, "%"),
                year=year,
                month=month,
                parc=parc,
                residence=None,
                origine=origine,
            )
        )
    return points


async def get_estran_filters(db: AsyncSession) -> EstranFiltersResponse:
    q = select(
        EstranRecord.parc_semi,
        EstranRecord.year,
        EstranRecord.month,
        EstranRecord.zone,
        EstranRecord.parc_an,
        EstranRecord.origine,
    )
    result = await db.execute(q)
    rows = result.all()

    parcs = sorted({_norm_str(r.parc_semi) for r in rows if _norm_str(r.parc_semi)})
    years = sorted({int(r.year) for r in rows if r.year is not None}, reverse=True)
    months = sorted({int(r.month) for r in rows if r.month is not None})
    residences = sorted(
        {
            _norm_str(r.zone) or _norm_str(r.parc_an)
            for r in rows
            if (_norm_str(r.zone) or _norm_str(r.parc_an))
        }
    )
    origines = sorted({_norm_str(r.origine) for r in rows if _norm_str(r.origine)})
    return EstranFiltersResponse(
        parcs=[x for x in parcs if x],
        annees=years,
        months=months,
        residences=[x for x in residences if x],
        origines=[x for x in origines if x],
    )


async def get_estran_kpis(
    db: AsyncSession,
    *,
    base: Optional[str],
    year: Optional[int],
    month: Optional[int],
    parc: Optional[str],
    residence: Optional[str],
    origine: Optional[str],
) -> EstranKpiResponse:
    q = select(EstranRecord)
    sheet = _sheet_from_base(base)
    if sheet:
        q = q.where(EstranRecord.sheet_name == sheet)
    result = await db.execute(q)
    rows = result.scalars().all()
    rows = _apply_base_filters(
        rows,
        year=year,
        month=month,
        parc=parc,
        residence=residence,
        origine=origine,
    )

    prim_rows = [r for r in rows if _record_base(r) == "Primaire"]
    hc_rows = [r for r in rows if _record_base(r) == "HC"]

    prim_recolte = _with_date_recolte(prim_rows)
    hc_recolte = _with_date_recolte(hc_rows)
    prim_empty = _with_empty_date_or_etat(prim_rows)
    hc_empty = _with_empty_date_or_etat(hc_rows)

    rec_prim = _calc_recapture(prim_recolte)
    rec_hc = _calc_recapture(hc_recolte)
    bio_hc = _calc_biomasse_recuperee(hc_rows)
    vend_prim = _calc_vendable_ligne(prim_rows)
    vend_hc = _calc_vendable_ligne(hc_rows)
    pm_prim = _calc_poids_moyen(prim_rows)
    pm_hc = _calc_poids_moyen(hc_rows)
    nb_prim = _calc_nb_lignes(prim_empty)
    nb_hc = _calc_nb_lignes(hc_empty)

    items = [
        EstranKpiItem(
            kpiKey="recapture_prim",
            label="% de recapture prim",
            base="Primaire",
            value=_round(rec_prim.value, "%"),
            unit="%",
            comment="Taux de recapture des semis primaires.",
            formula='somme("Effectif total") / somme("Effectif semé")',
            division_by_zero=rec_prim.div_zero,
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence),
        ),
        EstranKpiItem(
            kpiKey="recapture_hc",
            label="% de recapture HC",
            base="HC",
            value=_round(rec_hc.value, "%"),
            unit="%",
            comment="Taux de recapture hors calibre.",
            formula='somme("Effectif total") / somme("Effectif semé")',
            division_by_zero=rec_hc.div_zero,
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence, origine=origine),
        ),
        EstranKpiItem(
            kpiKey="biomasse_recuperee_hc",
            label="% de biomasse récupérée",
            base="HC",
            value=_round(bio_hc.value, "%"),
            unit="%",
            comment="Part de biomasse récupérée après ressemis HC.",
            formula='somme("Total récolté (Kg)") / somme("HC Ressemé (kg)")',
            division_by_zero=bio_hc.div_zero,
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence, origine=origine),
        ),
        EstranKpiItem(
            kpiKey="vendable_ligne_prim",
            label="Vendable / ligne primaire",
            base="Primaire",
            value=_round(vend_prim.value, "kg/ligne"),
            unit="kg/ligne",
            comment="Biomasse vendable moyenne par ligne primaire.",
            formula='somme("V (Kg)/200m") / somme("Nombre de ligne récolté (200m)")',
            division_by_zero=vend_prim.div_zero,
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence),
        ),
        EstranKpiItem(
            kpiKey="vendable_ligne_hc",
            label="Vendable par ligne HC",
            base="HC",
            value=_round(vend_hc.value, "kg/ligne"),
            unit="kg/ligne",
            comment="Biomasse vendable moyenne par ligne HC.",
            formula='somme("V (Kg)/200m") / somme("Nombre de ligne récolté (200m)")',
            division_by_zero=vend_hc.div_zero,
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence, origine=origine),
        ),
        EstranKpiItem(
            kpiKey="poids_moyen_prim",
            label="Poids moyen prim",
            base="Primaire",
            value=_round(pm_prim.value, "g"),
            unit="g",
            comment="Poids moyen primaire.",
            formula='moyenne("PM TOT (g)")',
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence),
        ),
        EstranKpiItem(
            kpiKey="poids_moyen_hc",
            label="Poids moyen HC",
            base="HC",
            value=_round(pm_hc.value, "g"),
            unit="g",
            comment="Poids moyen hors calibre.",
            formula='moyenne("PM Total")',
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence, origine=origine),
        ),
        EstranKpiItem(
            kpiKey="nb_ligne_prim",
            label="Nombre de ligne primaire",
            base="Primaire",
            value=_round(nb_prim.value, "ligne"),
            unit="ligne",
            comment="Lignes primaires non récoltées / en état incomplet.",
            formula='somme("Nombre de ligne semé (200m)")',
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence),
        ),
        EstranKpiItem(
            kpiKey="nb_ligne_hc",
            label="Nombre de ligne HC",
            base="HC",
            value=_round(nb_hc.value, "ligne"),
            unit="ligne",
            comment="Lignes HC non récoltées / en état incomplet.",
            formula='somme("Nombre de ligne semé (200m)")',
            breakdown=EstranKpiBreakdown(year=year, month=month, parc=parc, residence=residence, origine=origine),
        ),
    ]

    chart_series = [
        *_build_series_for_recapture(
            prim_rows,
            base_label="Primaire",
            kpi_key="recapture_prim",
            label="% de recapture prim",
            with_origine=False,
        ),
        *_build_series_for_recapture(
            hc_rows,
            base_label="HC",
            kpi_key="recapture_hc",
            label="% de recapture HC",
            with_origine=True,
        ),
        *_build_series_for_biomasse_hc(hc_rows),
    ]

    mapping = EstranFieldMapping(
        effectif_total="derive(effectif_seme * pct_recolte) fallback derive(effectif_seme * taux_recapture)",
        effectif_seme="EstranRecord.effectif_seme",
        total_recolte_kg="EstranRecord.quantite_brute_recoltee_kg",
        hc_resseme_kg="EstranRecord.quantite_semee_kg fallback EstranRecord.effectif_seme",
        vendable_kg_200m="EstranRecord.biomasse_vendable_kg",
        nb_ligne_recolte_200m="EstranRecord.nb_ligne_semee_200m (temporary proxy)",
        poids_moyen_prim_g="EstranRecord.biomasse_gr (temporary proxy for PM TOT)",
        poids_moyen_hc_g="EstranRecord.biomasse_gr (temporary proxy for PM Total)",
        nb_ligne_semee_200m="EstranRecord.nb_ligne_semee_200m",
        residence_estran="EstranRecord.zone fallback EstranRecord.parc_an",
        origine_recolte_primaire="EstranRecord.origine",
    )

    notes = [
        "Division par zero: value=null et division_by_zero=true.",
        "Adapter les mappings temporaires (effectif_total, PM, nb_ligne_recolte, HC Resseme) selon vos colonnes metier exactes.",
    ]

    return EstranKpiResponse(
        items=items,
        chart_series=chart_series,
        field_mapping=mapping,
        notes=notes,
    )
