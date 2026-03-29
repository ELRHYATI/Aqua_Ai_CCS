"""
Estran analytics: vendable par exercice agricole, politique 65% transfert / 35% classique.
Exercice agricole: 01/07 au 30/06 (ex: 2024-07 → 2025-06 = exercice 2024).
"""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord


@dataclass
class VendableParExercice:
    exercice: str  # "2024" = 01/07/2024 - 30/06/2025
    vendable_total_kg: float
    vendable_transfert_kg: float
    vendable_classique_kg: float
    nb_lignes: int
    nb_transfert: int
    nb_classique: int


def _exercice_agricole(year: int, month: int, start_month: int = 7) -> int:
    """
    Exercice: mois start_month à end_month (ex: 7→6 = juillet à juin).
    Mois >= start_month de year Y → exercice Y
    Mois < start_month de year Y → exercice Y-1
    """
    if month >= start_month:
        return year
    return year - 1


def _is_transfert(objectif: Optional[str], type_recolte: Optional[str]) -> bool:
    """True if record is Transfert type (vs Classique/Échantillonnage)."""
    s = (objectif or "") + " " + (type_recolte or "")
    return "transfert" in s.lower()


async def get_vendable_par_exercice(
    db: AsyncSession,
    politique_transfert_pct: float = 0.65,
    politique_classique_pct: float = 0.35,
    start_month: int = 7,
) -> list[VendableParExercice]:
    """
    Compute biomasse_vendable_kg by exercice (start_month to end_month).
    Default: 01/07 - 30/06 (start_month=7). Split by Transfert vs Classique when available.
    """
    r = await db.execute(
        select(
            EstranRecord.year,
            EstranRecord.month,
            EstranRecord.biomasse_vendable_kg,
            EstranRecord.objectif_recolte,
            EstranRecord.type_recolte,
        ).where(EstranRecord.biomasse_vendable_kg.isnot(None))
    )
    rows = r.all()

    # Group by exercice
    by_exercice: dict[int, list[tuple[float, Optional[bool]]]] = {}
    for row in rows:
        y, m = row.year or 0, row.month or 12
        if y < 2000:
            continue
        ex = _exercice_agricole(y, m, start_month)
        val = float(row.biomasse_vendable_kg or 0)
        is_transfert = _is_transfert(row.objectif_recolte, row.type_recolte) if (row.objectif_recolte or row.type_recolte) else None
        if ex not in by_exercice:
            by_exercice[ex] = []
        by_exercice[ex].append((val, is_transfert))

    result = []
    for ex in sorted(by_exercice.keys()):
        items = by_exercice[ex]
        total = sum(v for v, _ in items)
        transfert_kg = sum(v for v, t in items if t is True)
        classique_kg = sum(v for v, t in items if t is False)
        nb_transfert = sum(1 for _, t in items if t is True)
        nb_classique = sum(1 for _, t in items if t is False)
        nb_unknown = sum(1 for _, t in items if t is None)

        if nb_unknown > 0 and total > 0:
            # Prorata 65/35 for untyped records
            remaining = total - transfert_kg - classique_kg
            transfert_kg += remaining * politique_transfert_pct
            classique_kg += remaining * politique_classique_pct

        result.append(
            VendableParExercice(
                exercice=str(ex),
                vendable_total_kg=round(total, 2),
                vendable_transfert_kg=round(transfert_kg, 2),
                vendable_classique_kg=round(classique_kg, 2),
                nb_lignes=len(items),
                nb_transfert=nb_transfert,
                nb_classique=nb_classique,
            )
        )

    return result


def format_vendable_response(
    rows: list[VendableParExercice],
    date_debut: str = "01/07",
    date_fin: str = "30/06",
    transfert_pct: int = 65,
    classique_pct: int = 35,
) -> str:
    """Format vendable par exercice as readable text with actual params used."""
    if not rows:
        return (
            "Aucune donnée de biomasse vendable dans la base Estran. "
            "Importez un fichier BD ESTRA (Primaire / Hors calibre) avec les colonnes biomasse_vendable_kg, "
            "objectif_recolte et year/month pour obtenir le vendable par exercice agricole."
        )

    lines = [
        f"**Vendable par exercice** ({date_debut} - {date_fin}), politique {transfert_pct}% Transfert / {classique_pct}% Classique :",
        "",
    ]
    for r in rows:
        lines.append(
            f"• **Exercice {r.exercice}** : {r.vendable_total_kg:,.0f} kg total "
            f"(Transfert: {r.vendable_transfert_kg:,.0f} kg, Classique: {r.vendable_classique_kg:,.0f} kg) — {r.nb_lignes} lignes"
        )
    lines.append("")
    lines.append("_Source: Base Estran, colonnes biomasse_vendable_kg, objectif_recolte, year/month._")
    return "\n".join(lines)
