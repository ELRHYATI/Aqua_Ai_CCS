"""
Chat service that answers from real database and Excel data.
Used when Azure AI Search is not configured. Provides actual counts, sums, and KPIs.
"""

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC
from app.services.achat_suivi_service import get_achat_suivi_full
from app.services.estran_analytic_service import get_vendable_par_exercice, format_vendable_response
from app.services.param_extractor import extract_vendable_params


@dataclass
class DataChatResponse:
    reply: str
    citations: list[str]
    matched: bool  # True if we found data and answered


def _fmt_num(v: float) -> str:
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f} M"
    if v >= 1_000:
        return f"{v/1_000:.1f} k"
    return f"{v:,.0f}".replace(",", " ")


async def _get_estran_biomasse(db: AsyncSession) -> tuple[float, int]:
    """Returns (total biomasse_gr, record count)."""
    r = await db.execute(select(func.sum(EstranRecord.biomasse_gr)).select_from(EstranRecord))
    total = float(r.scalar() or 0)
    r = await db.execute(select(func.count()).select_from(EstranRecord))
    cnt = r.scalar() or 0
    return total, cnt


async def _get_finance_summary(db: AsyncSession) -> dict:
    """Returns budget, real, ytd, n1, top variances."""
    r = await db.execute(
        select(
            func.sum(FinanceLine.budget).label("budget"),
            func.sum(FinanceLine.real).label("real"),
            func.sum(FinanceLine.ytd).label("ytd"),
            func.sum(FinanceLine.n1).label("n1"),
        ).select_from(FinanceLine)
    )
    row = r.one_or_none()
    if not row:
        return {"budget": 0, "real": 0, "ytd": 0, "n1": 0, "top_variances": []}
    r2 = await db.execute(
        select(FinanceLine.code, FinanceLine.label, FinanceLine.var_b_r, FinanceLine.var_pct)
        .where(FinanceLine.var_b_r.isnot(None))
        .order_by(func.abs(FinanceLine.var_b_r).desc())
        .limit(5)
    )
    top = [
        {"code": r.code, "label": (r.label or "")[:30], "var_pct": float(r.var_pct or 0)}
        for r in r2.all()
    ]
    return {
        "budget": float(row.budget or 0),
        "real": float(row.real or 0),
        "ytd": float(row.ytd or 0),
        "n1": float(row.n1 or 0),
        "top_variances": top,
    }


async def _get_achat_counts_db(db: AsyncSession) -> dict:
    """DA/BC counts from PostgreSQL."""
    r = await db.execute(select(func.count()).select_from(PurchaseDA))
    da_count = r.scalar() or 0
    r = await db.execute(select(func.sum(PurchaseDA.amount)).select_from(PurchaseDA))
    da_amount = float(r.scalar() or 0)
    r = await db.execute(select(func.count()).select_from(PurchaseBC))
    bc_count = r.scalar() or 0
    r = await db.execute(select(func.sum(PurchaseBC.amount)).select_from(PurchaseBC))
    bc_amount = float(r.scalar() or 0)
    return {
        "da_count": da_count,
        "da_amount": da_amount,
        "bc_count": bc_count,
        "bc_amount": bc_amount,
    }


def _get_achat_suivi_excel() -> Optional[dict]:
    """Full Suivi Global CCS data (summary + kpis). More accurate business logic."""
    try:
        return get_achat_suivi_full()
    except Exception:
        return None


async def answer_from_data(db: AsyncSession, user_message: str) -> DataChatResponse:
    """
    Match user intent and return real data from DB/Excel.
    Returns matched=True only when we have actual numbers to show.
    """
    lower = user_message.lower().strip()

    # —— Vendable par exercice agricole (65% transfert / 35% classique, 01/07-30/06) ——
    _vendable_keywords = [
        "vendable",
        "exercice agricole",
        "01/07",
        "1/07",
        "30/06",
        "30/6",
        "1er juillet",
        "65%",
        "35%",
        "transfert",
        "classique",
        "politique de semi",
        "politique semi",
        "hypotheses de recolte",
        "hypothèses de récolte",
        "hypothèse récolte",
    ]
    if any(w in lower for w in _vendable_keywords):
        params = extract_vendable_params(user_message)
        rows = await get_vendable_par_exercice(
            db,
            politique_transfert_pct=params.transfert_pct,
            politique_classique_pct=params.classique_pct,
            start_month=params.start_month,
        )
        return DataChatResponse(
            reply=format_vendable_response(
                rows,
                date_debut=params.date_debut_str,
                date_fin=params.date_fin_str,
                transfert_pct=int(params.transfert_pct * 100),
                classique_pct=int(params.classique_pct * 100),
            ),
            citations=[f"[1] Base Estran - biomasse_vendable_kg par exercice ({params.date_debut_str}-{params.date_fin_str})"],
            matched=True,
        )

    # —— Estran / Biomasse ——
    if any(w in lower for w in ["biomasse", "biomass", "biomasse totale", "total biomass"]):
        total, cnt = await _get_estran_biomasse(db)
        if cnt > 0:
            return DataChatResponse(
                reply=f"**Biomasse totale** : {_fmt_num(total)} kg ({cnt} enregistrements). Consultez la page Estran pour le détail par parc.",
                citations=["[1] Base Estran - somme biomasse_gr"],
                matched=True,
            )
        return DataChatResponse(
            reply="Aucune donnée biomasse dans la base Estran. Importez un fichier Excel (BD ESTRA) pour alimenter les données.",
            citations=[],
            matched=True,
        )

    # —— DA / BC en cours (priorité Excel Suivi Global, sinon DB) ——
    if any(w in lower for w in ["da en cours", "da en attente", "combien de da", "nombre de da", "résumé des da", "da pending"]):
        suivi_data = _get_achat_suivi_excel()
        suivi = suivi_data.get("summary") if suivi_data else None
        if suivi:
            da_cours = suivi.get("da_en_cours", 0)
            total_da = suivi.get("total_da", 0)
            valeur = suivi.get("valeur_totale", 0)
            return DataChatResponse(
                reply=f"**DA en cours** : {da_cours} (sur {total_da} DA au total). Valeur totale des achats : {_fmt_num(valeur)} DH.",
                citations=["[1] Suivi Global CCS"],
                matched=True,
            )
        # Fallback: PostgreSQL
        counts = await _get_achat_counts_db(db)
        if counts["da_count"] > 0:
            return DataChatResponse(
                reply=f"**DA** : {counts['da_count']} demandes, montant total {_fmt_num(counts['da_amount'])} DH. **BC** : {counts['bc_count']} bons de commande, {_fmt_num(counts['bc_amount'])} DH.",
                citations=["[1] Base Achats (PostgreSQL)"],
                matched=True,
            )
        return DataChatResponse(
            reply="Aucune donnée DA/BC. Importez Suivi Global CCS ou synchronisez les achats.",
            citations=[],
            matched=True,
        )

    # —— Finance / YTD / Budget / Variance ——
    if any(w in lower for w in ["ytd", "budget", "variance", "réalisé", "finance", "résumé finance"]):
        fin = await _get_finance_summary(db)
        if fin["budget"] > 0 or fin["real"] > 0:
            ytd = fin["ytd"] or fin["real"]
            var_pct = ((ytd - fin["budget"]) / fin["budget"] * 100) if fin["budget"] else 0
            lines = []
            lines.append(f"**YTD** : {_fmt_num(ytd)} DH. **Budget** : {_fmt_num(fin['budget'])} DH. **Variance** : {var_pct:+.1f}%.")
            if fin["top_variances"]:
                top = fin["top_variances"][0]
                lines.append(f"Principal écart : {top['label']} ({top['var_pct']:+.1f}%).")
            return DataChatResponse(
                reply=" ".join(lines),
                citations=["[1] Base Finance - lignes YTD/Budget"],
                matched=True,
            )
        return DataChatResponse(
            reply="Aucune donnée finance. Importez MODELE RAPPORT ou BAL MODELE.",
            citations=[],
            matched=True,
        )

    # —— Anomalies Estran ——
    if any(w in lower for w in ["anomalies estran", "anomalie estran", "montre les anomalies"]):
        r = await db.execute(select(func.count()).select_from(EstranRecord))
        cnt = r.scalar() or 0
        if cnt > 0:
            return DataChatResponse(
                reply=f"Consultez la **page Estran** pour voir les anomalies détectées par ML (Isolation Forest, LOF, Z-Score). La base contient {cnt} enregistrements analysables.",
                citations=["[1] Page Estran - onglet Anomalies ML"],
                matched=True,
            )
        return DataChatResponse(
            reply="Aucune donnée Estran pour l'analyse des anomalies. Importez un fichier BD ESTRA.",
            citations=[],
            matched=True,
        )

    # —— Capex / Opex ——
    if any(w in lower for w in ["capex", "opex", "capex opex"]):
        suivi_data = _get_achat_suivi_excel()
        suivi = suivi_data.get("summary") if suivi_data else None
        kpis = (suivi_data or {}).get("kpis", {}) or {}
        if suivi and (suivi.get("total_lignes") or 0) > 0 and kpis:
            co = kpis.get("capex_opex", {})
            parts = []
            for name, d in co.items():
                if isinstance(d, dict) and "count" in d and "valeur" in d:
                    parts.append(f"{name} : {d['count']} lignes, {_fmt_num(d.get('valeur', 0))} DH.")
            if parts:
                return DataChatResponse(
                    reply="**Capex vs Opex** : " + " | ".join(parts),
                    citations=["[1] Suivi Global CCS - KPIs Capex/Opex"],
                    matched=True,
                )
        return DataChatResponse(
            reply="Données Capex/Opex disponibles dans Suivi Global CCS. Importez le fichier pour les consulter.",
            citations=[],
            matched=True,
        )

    # —— Fallback: no match, caller will use stub ——
    return DataChatResponse(reply="", citations=[], matched=False)
