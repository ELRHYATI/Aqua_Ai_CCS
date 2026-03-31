"""
Estran database viewer service — paginated queries, search, sort, counts, CSV export.
"""

from __future__ import annotations

import csv
import io
import math
from datetime import datetime
from typing import AsyncIterator, Optional

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord
from app.schemas.estran_kpi import EstranDbCounts, EstranDbPage, EstranDbRow

SORTABLE_COLUMNS = {
    "id", "parc_semi", "parc_an", "generation_semi", "ligne_num",
    "ett", "phase", "origine", "type_semi", "longueur_ligne",
    "nb_ligne_semee_200m", "zone", "date_semis", "date_recolte",
    "effectif_seme", "quantite_semee_kg", "quantite_brute_recoltee_kg",
    "quantite_casse_kg", "biomasse_gr", "biomasse_vendable_kg",
    "statut", "etat_recolte", "pct_recolte", "year", "month",
    "sheet_name", "type_recolte", "taux_recapture", "objectif_recolte",
    "created_at", "updated_at",
}

SEARCH_COLUMNS = [
    EstranRecord.parc_semi,
    EstranRecord.parc_an,
    EstranRecord.generation_semi,
    EstranRecord.phase,
    EstranRecord.origine,
    EstranRecord.zone,
    EstranRecord.statut,
    EstranRecord.type_recolte,
    EstranRecord.objectif_recolte,
    EstranRecord.etat_recolte,
    EstranRecord.ett,
]

CSV_HEADERS = [
    "id", "parc_semi", "parc_an", "generation_semi", "ligne_num",
    "ett", "phase", "origine", "type_semi", "longueur_ligne",
    "nb_ligne_semee_200m", "zone", "date_semis", "date_recolte",
    "effectif_seme", "quantite_semee_kg", "quantite_brute_recoltee_kg",
    "quantite_casse_kg", "biomasse_gr", "biomasse_vendable_kg",
    "statut", "etat_recolte", "pct_recolte", "year", "month",
    "sheet_name", "type_recolte", "taux_recapture", "objectif_recolte",
]


def _apply_sheet_filter(q, base: str):
    if base == "primaire":
        return q.where(
            or_(EstranRecord.sheet_name == "Primaire", EstranRecord.sheet_name.is_(None))
        )
    return q.where(EstranRecord.sheet_name == "Hors calibre")


def _apply_search(q, search: str):
    term = f"%{search}%"
    clauses = [col.ilike(term) for col in SEARCH_COLUMNS]
    return q.where(or_(*clauses))


def _apply_sort(q, sort_by: str, sort_order: str):
    col_name = sort_by if sort_by in SORTABLE_COLUMNS else "date_recolte"
    col = getattr(EstranRecord, col_name, EstranRecord.date_recolte)
    if sort_order == "asc":
        return q.order_by(col.asc().nullslast())
    return q.order_by(col.desc().nullsfirst())


async def get_estran_db_page(
    db: AsyncSession,
    *,
    base: str,
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    sort_by: str = "date_recolte",
    sort_order: str = "desc",
) -> EstranDbPage:
    q = select(EstranRecord)
    q = _apply_sheet_filter(q, base)
    if search:
        q = _apply_search(q, search)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = _apply_sort(q, sort_by, sort_order)
    offset = (page - 1) * page_size
    q = q.offset(offset).limit(page_size)

    result = await db.execute(q)
    rows = result.scalars().all()

    return EstranDbPage(
        items=[EstranDbRow.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


async def get_estran_db_counts(db: AsyncSession) -> EstranDbCounts:
    prim_q = select(func.count()).where(
        or_(EstranRecord.sheet_name == "Primaire", EstranRecord.sheet_name.is_(None))
    )
    hc_q = select(func.count()).where(EstranRecord.sheet_name == "Hors calibre")

    prim_last_q = select(func.max(EstranRecord.updated_at)).where(
        or_(EstranRecord.sheet_name == "Primaire", EstranRecord.sheet_name.is_(None))
    )
    hc_last_q = select(func.max(EstranRecord.updated_at)).where(
        EstranRecord.sheet_name == "Hors calibre"
    )

    prim_total = (await db.execute(prim_q)).scalar() or 0
    hc_total = (await db.execute(hc_q)).scalar() or 0
    prim_last = (await db.execute(prim_last_q)).scalar()
    hc_last = (await db.execute(hc_last_q)).scalar()

    return EstranDbCounts(
        primaire_total=prim_total,
        hc_total=hc_total,
        primaire_last_import=prim_last,
        hc_last_import=hc_last,
    )


async def export_estran_csv(
    db: AsyncSession,
    *,
    base: str,
    search: Optional[str] = None,
    full: bool = True,
    page: int = 1,
    page_size: int = 25,
) -> AsyncIterator[str]:
    """Yield CSV content as string chunks for StreamingResponse."""
    q = select(EstranRecord)
    q = _apply_sheet_filter(q, base)
    if search:
        q = _apply_search(q, search)
    q = q.order_by(EstranRecord.id.desc())

    if not full:
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

    result = await db.execute(q)
    rows = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADERS)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    for r in rows:
        writer.writerow([_csv_val(getattr(r, h, None)) for h in CSV_HEADERS])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)


def _csv_val(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    return str(v)
