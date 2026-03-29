"""
Excel sync: load REFLEXION.xlsx (or any path) into PostgreSQL.
Used by seed script and OneDrive sync.
Replace mode: truncates tables before load to avoid duplicates.
"""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC
from app.models.dimensions import DimPeriod, DimEntity


def _excel_date_to_python(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.date() if isinstance(val, datetime) else val
    try:
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=float(val))).date()
    except (TypeError, ValueError):
        return None


def _safe_decimal(val):
    if val is None or val == "" or (isinstance(val, str) and val.upper() in ("#VALUE!", "#REF!", "#DIV/0!", "NC")):
        return None
    try:
        return Decimal(str(val).replace(",", "."))
    except (ValueError, TypeError, InvalidOperation):
        return None


def _safe_int(val):
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _validate_excel_extension(path: Path) -> None:
    """Reject non-.xlsx/.xlsm files for macro safety."""
    ext = path.suffix.lower()
    if ext not in (".xlsx", ".xlsm"):
        raise ValueError(f"Format non autorisé. Utilisez .xlsx ou .xlsm uniquement (reçu: {ext})")


async def seed_from_excel(session: AsyncSession, excel_path: Path, replace: bool = True) -> dict[str, int]:
    """
    Load Excel at excel_path and sync to DB. Returns counts.
    replace=True: truncates tables before load (use for sync).
    replace=False: appends only (use for seed without clearing).
    Only .xlsx and .xlsm are accepted (macro safety).
    """
    _validate_excel_extension(excel_path)
    counts = {"estran": 0, "finance": 0, "purchases": 0}

    if replace:
        for table in ("estran_records", "finance_lines", "purchase_da", "purchase_bc"):
            await session.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"))
        await session.commit()

    # Dimensions
    r = await session.execute(select(DimPeriod).limit(1))
    if not r.scalar_one_or_none():
        session.add(DimPeriod(year=2025, month=12, label="2025-12"))
        await session.flush()
        session.add(DimEntity(code="SITE1", name="Site Principal", active=True))
        await session.commit()

    # Estran: support Primaire/Hors calibre (Exemple BDD estran) or BD ESTRA (REFLEXION)
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    try:

        def _load_primaire():
            ws = wb["Primaire"]
            for row in list(ws.iter_rows(min_row=2, values_only=True)):
                if not row or row[0] is None:
                    continue
                session.add(EstranRecord(
                    parc_semi=str(row[0]) if row[0] else None,
                    parc_an=str(row[1]) if row[1] else None,
                    generation_semi=str(row[2]) if row[2] else None,
                    ligne_num=_safe_int(row[3]),
                    ett=str(row[4]) if row[4] else None,
                    phase=str(row[5]) if row[5] else None,
                    origine=str(row[6]) if row[6] else None,
                    type_semi=str(row[7]) if row[7] else None,
                    longueur_ligne=_safe_decimal(row[8]) if len(row) > 8 else None,
                    nb_ligne_semee_200m=_safe_decimal(row[9]) if len(row) > 9 else None,
                    zone=str(row[12]) if len(row) > 12 else None,
                    date_semis=_excel_date_to_python(row[17]) if len(row) > 17 else None,
                    effectif_seme=_safe_decimal(row[20]) if len(row) > 20 else None,
                    quantite_semee_kg=_safe_decimal(row[23]) if len(row) > 23 else None,
                    quantite_brute_recoltee_kg=_safe_decimal(row[39]) if len(row) > 39 else None,
                    quantite_casse_kg=_safe_decimal(row[40]) if len(row) > 40 else None,
                    biomasse_gr=_safe_decimal(row[63]) if len(row) > 63 else None,
                    biomasse_vendable_kg=_safe_decimal(row[99]) if len(row) > 99 else None,
                    statut=None,
                    etat_recolte=str(row[28]) if len(row) > 28 and row[28] else None,
                    pct_recolte=_safe_decimal(row[31]) if len(row) > 31 else None,
                    date_recolte=_excel_date_to_python(row[30]) if len(row) > 30 else None,
                    year=_safe_int(row[97]) if len(row) > 97 else 2025,
                    month=_safe_int(row[98]) if len(row) > 98 else 12,
                    sheet_name="Primaire",
                    type_recolte=str(row[36]).strip() if len(row) > 36 and row[36] else None,
                    taux_recapture=_safe_decimal(row[78]) if len(row) > 78 else None,
                    objectif_recolte=str(row[29]).strip()[:100] if len(row) > 29 and row[29] else None,
                ))
                counts["estran"] += 1

        def _load_hors_calibre():
            ws = wb["Hors calibre"]
            for row in list(ws.iter_rows(min_row=2, values_only=True)):
                if not row or row[0] is None:
                    continue
                session.add(EstranRecord(
                    parc_semi=str(row[1]) if len(row) > 1 and row[1] else None,
                    parc_an=str(row[2]) if len(row) > 2 and row[2] else None,
                    generation_semi=None,
                    ligne_num=None,
                    ett=str(row[3]) if len(row) > 3 and row[3] else None,
                    phase=str(row[7]) if len(row) > 7 and row[7] else None,
                    origine=str(row[8]) if len(row) > 8 and row[8] else None,
                    type_semi=str(row[6]) if len(row) > 6 and row[6] else None,
                    longueur_ligne=_safe_decimal(row[12]) if len(row) > 12 else None,
                    nb_ligne_semee_200m=_safe_decimal(row[15]) if len(row) > 15 else None,
                    zone=str(row[10]) if len(row) > 10 and row[10] else None,
                    date_semis=_excel_date_to_python(row[0]) if len(row) > 0 else None,
                    effectif_seme=_safe_decimal(row[24]) if len(row) > 24 else None,
                    quantite_semee_kg=None,
                    quantite_brute_recoltee_kg=_safe_decimal(row[37]) if len(row) > 37 else None,
                    quantite_casse_kg=_safe_decimal(row[40]) if len(row) > 40 else None,
                    biomasse_gr=None,
                    biomasse_vendable_kg=_safe_decimal(row[78]) if len(row) > 78 else None,
                    statut=str(row[21]) if len(row) > 21 and row[21] else None,
                    etat_recolte=str(row[27]) if len(row) > 27 and row[27] else None,
                    pct_recolte=_safe_decimal(row[30]) if len(row) > 30 else None,
                    date_recolte=_excel_date_to_python(row[29]) if len(row) > 29 else None,
                    year=_safe_int(row[76]) if len(row) > 76 else 2025,
                    month=_safe_int(row[77]) if len(row) > 77 else 12,
                    sheet_name="Hors calibre",
                    type_recolte=str(row[35])[:80] if len(row) > 35 and row[35] else None,
                    taux_recapture=_safe_decimal(row[68]) if len(row) > 68 else None,
                    objectif_recolte=str(row[28])[:100] if len(row) > 28 and row[28] else None,
                ))
                counts["estran"] += 1

        if "Primaire" in wb.sheetnames:
            _load_primaire()
        if "Hors calibre" in wb.sheetnames:
            _load_hors_calibre()
        elif "BD ESTRA" in wb.sheetnames:
            ws = wb["BD ESTRA"]
            for row in list(ws.iter_rows(min_row=2, values_only=True)):
                if not row or row[0] is None:
                    continue
                session.add(EstranRecord(
                    parc_semi=str(row[0]) if row[0] else None,
                    parc_an=str(row[1]) if row[1] else None,
                    generation_semi=str(row[2]) if row[2] else None,
                    ligne_num=_safe_int(row[3]),
                    ett=str(row[4]) if row[4] else None,
                    phase=str(row[5]) if row[5] else None,
                    origine=str(row[6]) if row[6] else None,
                    type_semi=str(row[7]) if row[7] else None,
                    longueur_ligne=_safe_decimal(row[8]) if len(row) > 8 else None,
                    nb_ligne_semee_200m=_safe_decimal(row[9]) if len(row) > 9 else None,
                    zone=str(row[12]) if len(row) > 12 else None,
                    date_semis=_excel_date_to_python(row[17]) if len(row) > 17 else None,
                    effectif_seme=_safe_decimal(row[20]) if len(row) > 20 else None,
                    quantite_semee_kg=_safe_decimal(row[23]) if len(row) > 23 else None,
                    quantite_brute_recoltee_kg=_safe_decimal(row[36]) if len(row) > 36 else None,
                    quantite_casse_kg=_safe_decimal(row[37]) if len(row) > 37 else None,
                    biomasse_gr=_safe_decimal(row[79]) if len(row) > 79 else None,
                    biomasse_vendable_kg=_safe_decimal(row[83]) if len(row) > 83 else None,
                    statut=str(row[76]) if len(row) > 76 else None,
                    etat_recolte=str(row[28]) if len(row) > 28 else None,
                    pct_recolte=_safe_decimal(row[30]) if len(row) > 30 else None,
                    date_recolte=_excel_date_to_python(row[29]) if len(row) > 29 else None,
                    year=_safe_int(row[81]) if len(row) > 81 else 2025,
                    month=_safe_int(row[82]) if len(row) > 82 else 12,
                    sheet_name=None,
                    type_recolte=None,
                    taux_recapture=None,
                    objectif_recolte=None,
                ))
                counts["estran"] += 1
    finally:
        wb.close()

    await session.commit()

    # Finance
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
    if "RESULTAT MODELE" in wb.sheetnames:
            ws = wb["RESULTAT MODELE"]
            for row in list(ws.iter_rows(min_row=2, values_only=True))[:100]:
                if not row or row[0] is None:
                    continue
                session.add(FinanceLine(
                    code=str(row[0]).strip() if row[0] else "",
                    ordre=_safe_int(row[1]),
                    gr=str(row[2]).strip() if row[2] else None,
                    label=(str(row[3])[:255] if row[3] is not None else None),
                    n1=_safe_decimal(row[4]),
                    budget=_safe_decimal(row[5]),
                    real=_safe_decimal(row[7]),
                    fy=_safe_decimal(row[8]),
                    var_b_r=_safe_decimal(row[9]),
                    var_pct=_safe_decimal(row[10]),
                    var_r_n1=_safe_decimal(row[11]) if len(row) > 11 else None,
                    ytd=_safe_decimal(row[6]) if len(row) > 6 and isinstance(row[6], (int, float)) else None,
                    year=2025,
                    month=12,
                ))
                counts["finance"] += 1
    wb.close()

    # Purchases : lignes de démo uniquement si le classeur a bien alimenté Estran ou Finance
    # (évite d'afficher « que des achats » après import d'un mauvais fichier ex. Suivi CCS seul).
    if counts["estran"] > 0 or counts["finance"] > 0:
        da_bc = [
            *[PurchaseDA(reference="DA-2025-001", amount=Decimal("15000"), delay_days=5, status="En cours", critical_flag=False),
              PurchaseDA(reference="DA-2025-002", amount=Decimal("45000"), delay_days=12, status="En cours", critical_flag=True)],
            *[PurchaseBC(reference="BC-2025-101", amount=Decimal("22000"), delay_days=3, status="Non livré", critical_flag=False, expected_delivery_date=date(2025, 2, 15)),
              PurchaseBC(reference="BC-2025-102", amount=Decimal("78000"), delay_days=18, status="Non livré", critical_flag=True, expected_delivery_date=date(2025, 1, 28))],
        ]
        for r in da_bc:
            session.add(r)
            counts["purchases"] += 1
    await session.commit()

    return counts
