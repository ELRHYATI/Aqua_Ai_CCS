"""
Ollama service - local LLM (mistral:7b) for chat, analysis, and report generation.
Connects to http://localhost:11434. Injects real DB context before each call.
# TODO: replace with Azure OpenAI when ready
"""

import json
import logging
import re
from datetime import datetime
from typing import Any, Optional, Tuple

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.estran import EstranRecord
from app.models.finance import FinanceLine
from app.models.purchase import PurchaseDA, PurchaseBC

logger = logging.getLogger(__name__)

OLLAMA_CHAT_URL = "/api/chat"
OLLAMA_TAGS_URL = "/api/tags"
OLLAMA_TIMEOUT = 90.0

BASE_SYSTEM = (
    "Tu es l'assistant IA d'Azura Aqua, une plateforme d'analyse pour l'aquaculture. "
    "Réponds toujours en français. Base tes réponses uniquement sur les données fournies. "
    "Sois précis et professionnel. Date du jour: {date}."
)

CHAT_INSTRUCTION = "Donne une réponse conversationnelle concise."
ANALYZE_INSTRUCTION = (
    "Fais une analyse approfondie structurée, avec des sections claires. "
    "Identifie les tendances, écarts et points d'attention."
)
REPORT_INSTRUCTION = (
    "Génère un rapport structuré en markdown avec ces sections obligatoires: "
    "## Résumé Exécutif\n"
    "## Analyse Détaillée\n"
    "## Anomalies Détectées\n"
    "## Recommandations\n"
    "## Conclusion\n"
    "Utilise les données fournies pour remplir chaque section."
)

GL_COMMENTARY_INSTRUCTION = (
    "L'utilisateur demande une explication basée sur le Grand Livre (GL) pour un compte. "
    "Génère un commentaire structuré en commençant par ce format:\n\n"
    "POUR LE COMPTE [CODE], L'EXPLICATION VIENT DU GL COMME SUIT:\n\n"
    "- Si UNE écriture/facture: C'EST UNE FACTURE DU [DATE] DE [FOURNISSEUR/LIBELLÉ] DE MONTANT [XXX] DH\n"
    "- Si PLUSIEURS écritures: détaille chacune avec sa date, fournisseur/libellé et montant, "
    "puis un récap: CE SONT X FACTURES/ÉCRITURES POUR UN TOTAL DE [XXX] DH\n\n"
    "Extrais la date (format JJ/MM/AAAA), le fournisseur (du libellé) et le montant. "
    "Sois précis et détaillé. Tu peux développer en listant chaque écriture si pertinent."
)

RAPPORT_COMMENTARY_INSTRUCTION = (
    "L'utilisateur demande un commentaire pour un compte. Aucune écriture GL détaillée n'est disponible. "
    "Les données proviennent du MODELE RAPPORT (fichier déposé). Génère un commentaire structuré.\n\n"
    "Commence par: POUR LE COMPTE [CODE] ([LIBELLÉ]), LES DONNÉES DU RAPPORT INDIQUENT:\n\n"
    "- Réalisé YTD: [X] DH, Budget YTD: [Y] DH, N-1 YTD: [Z] DH\n"
    "Analyse les écarts (Var vs Budget %, Var vs N-1 %) si disponibles et propose une explication concise professionnelle. "
    "Sois factuel et utilise uniquement les données fournies."
)


def _extract_account_from_message(msg: str) -> Optional[str]:
    """Extract account code (e.g. P1131, E1110) from user message."""
    # Match P1131, E1110, P1110, A1234, etc. (letter + 3-5 digits)
    m = re.search(r"\b([A-Za-z]\d{3,5})\b", msg.upper())
    return m.group(1).upper() if m else None


def _format_gl_date(date_val: Any) -> str:
    """Format date for GL context as DD/MM/YYYY."""
    if date_val is None:
        return ""
    if isinstance(date_val, datetime):
        return date_val.strftime("%d/%m/%Y")
    s = str(date_val).strip()
    if not s:
        return ""
    # "31.12.2025" -> DD/MM/YYYY
    if "." in s and len(s) >= 8:
        parts = s.replace(",", ".").split(".")
        if len(parts) >= 3:
            try:
                d, m, y = int(float(parts[0])), int(float(parts[1])), int(float(parts[2]))
                if y < 100:
                    y += 2000
                return f"{d:02d}/{m:02d}/{y}"
            except (ValueError, IndexError):
                pass
    # "2025-12-31" or "2025-12-31 00:00:00"
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        try:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            return f"{d:02d}/{mo:02d}/{y}"
        except (ValueError, IndexError):
            pass
    return s


def _fmt_num(v: float) -> str:
    if v >= 1_000_000:
        return f"{v/1_000_000:.1f} M"
    if v >= 1_000:
        return f"{v/1_000:.1f} k"
    return f"{v:,.0f}".replace(",", " ")


def _fmt_var(v: Optional[float]) -> str:
    """Format variance (Optional[float]) for display."""
    if v is None:
        return "N/A"
    pct = v * 100
    return f"{pct:+.1f}%"


async def fetch_context_for_message(db: AsyncSession, user_message: str, include_all: bool = False) -> tuple[str, list[str], Optional[str]]:
    """
    Fetch real data from DB based on keywords. Returns (context_text, data_sources, instruction_override).
    instruction_override is set when GL entries for a specific account are found (for GL commentary format).
    """
    lower = user_message.lower()
    sources: list[str] = []
    parts: list[str] = []

    estran_keywords = [
        "estran", "biomasse", "parc", "ligne", "recapture", "récolte",
        "vendable", "primaire", "hors calibre", "anomalie estran",
    ]
    finance_keywords = [
        "finance", "budget", "ytd", "variance", "compte", "réalisé",
        "grand livre", "gl", "rapport financier", "kpi",
        "explique", "explication", "commentaire", "détail",
    ]
    achat_keywords = [
        "achat", "da", "bc", "commande", "fournisseur", "demande achat",
        "bon de commande", "suivi", "priorité",
    ]

    fetch_estran = include_all or any(k in lower for k in estran_keywords)
    fetch_finance = include_all or any(k in lower for k in finance_keywords)
    fetch_achat = include_all or any(k in lower for k in achat_keywords)

    if not (fetch_estran or fetch_finance or fetch_achat):
        fetch_estran = fetch_finance = fetch_achat = True

    # Estran
    if fetch_estran:
        r = await db.execute(select(func.sum(EstranRecord.biomasse_gr)).select_from(EstranRecord))
        bio_sum = float(r.scalar() or 0)
        r = await db.execute(select(func.count()).select_from(EstranRecord))
        bio_cnt = r.scalar() or 0
        r = await db.execute(
            select(EstranRecord.parc_semi, func.sum(EstranRecord.biomasse_gr).label("tot"))
            .where(EstranRecord.parc_semi.isnot(None))
            .group_by(EstranRecord.parc_semi)
            .limit(10)
        )
        by_parc = [(row.parc_semi, float(row.tot or 0)) for row in r.all()]
        parts.append(
            f"**Estran** — Biomasse totale: {_fmt_num(bio_sum)} kg ({bio_cnt} enregistrements). "
            f"Par parc (top 10): {json.dumps(dict(by_parc[:5]), ensure_ascii=False)}"
        )
        sources.append("estran_records")

    # Finance
    if fetch_finance:
        r = await db.execute(
            select(
                func.sum(FinanceLine.budget).label("budget"),
                func.sum(FinanceLine.real).label("real"),
                func.sum(FinanceLine.ytd).label("ytd"),
                func.sum(FinanceLine.n1).label("n1"),
            ).select_from(FinanceLine)
        )
        row = r.one_or_none()
        if row and (row.budget or row.real or row.ytd):
            parts.append(
                f"**Finance** — Budget: {_fmt_num(float(row.budget or 0))} DH, "
                f"Réalisé: {_fmt_num(float(row.real or 0))} DH, "
                f"YTD: {_fmt_num(float(row.ytd or 0))} DH, N-1: {_fmt_num(float(row.n1 or 0))} DH."
            )
            sources.append("finance_lines")
        r = await db.execute(
            select(FinanceLine.code, FinanceLine.label, FinanceLine.var_b_r, FinanceLine.var_pct)
            .where(FinanceLine.var_b_r.isnot(None))
            .order_by(func.abs(FinanceLine.var_b_r).desc())
            .limit(5)
        )
        top_var = r.all()
        if top_var:
            var_str = "; ".join(f"{x.code}: {float(x.var_pct or 0):.1f}%" for x in top_var[:3])
            parts.append(f"Top variances: {var_str}")
            if "finance_kpi" not in sources:
                sources.append("finance_lines")

    # Achats
    if fetch_achat:
        r = await db.execute(select(func.count()).select_from(PurchaseDA))
        da_count = r.scalar() or 0
        r = await db.execute(select(func.sum(PurchaseDA.amount)).select_from(PurchaseDA))
        da_amount = float(r.scalar() or 0)
        r = await db.execute(select(func.count()).select_from(PurchaseBC))
        bc_count = r.scalar() or 0
        r = await db.execute(select(func.sum(PurchaseBC.amount)).select_from(PurchaseBC))
        bc_amount = float(r.scalar() or 0)
        parts.append(
            f"**Achats** — DA: {da_count} ({_fmt_num(da_amount)} DH), "
            f"BC: {bc_count} ({_fmt_num(bc_amount)} DH)."
        )
        sources.append("purchase_da")
        sources.append("purchase_bc")

    # GL commentary: detect account in message and fetch GL entries (from Excel)
    instruction_override: Optional[str] = None
    account = _extract_account_from_message(user_message)
    if account and fetch_finance:
        try:
            from app.services.finance_excel_service import get_gl_entries_for_account
            year = datetime.now().year
            gl_entries = get_gl_entries_for_account(account=account, year=year)
            if gl_entries:
                gl_lines = []
                for e in gl_entries:
                    dt = _format_gl_date(e.get("date_str"))
                    lb = (e.get("label") or "").strip() or "—"
                    amt = e.get("amount") or 0
                    gl_lines.append(f"  - Date: {dt} | Libellé/Fournisseur: {lb} | Montant: {amt:,.2f} DH")
                gl_block = (
                    f"**Grand Livre — Compte {account}** ({len(gl_entries)} écriture(s)):\n"
                    + "\n".join(gl_lines)
                )
                parts.insert(0, gl_block)
                sources.insert(0, "gl_entries")
                instruction_override = GL_COMMENTARY_INSTRUCTION
        except Exception as ex:
            logger.warning("GL fetch for account %s failed: %s", account, ex)

    context = "\n\n".join(parts) if parts else "Aucune donnée spécifique disponible."
    return context, list(dict.fromkeys(sources)), instruction_override


class OllamaService:
    """Service for Ollama (mistral:7b) - chat, analyze, generate_report."""

    def __init__(self) -> None:
        s = get_settings()
        self.url = (getattr(s, "ollama_url", None) or getattr(s, "ollama_base_url", None) or "http://localhost:11434").rstrip("/")
        self.model = getattr(s, "ollama_model", None) or "mistral:7b"
        self._available: Optional[bool] = None

    async def check_available(self) -> bool:
        """Check if Ollama is running and model is pulled."""
        if self._available is not None:
            return self._available
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f"{self.url}/api/tags", timeout=5.0)
                if r.status_code != 200:
                    self._available = False
                    return False
                data = r.json()
                models = data.get("models", []) or []
                names = [m.get("name", "") for m in models if isinstance(m, dict)]
                if not any(self.model in n or n == self.model for n in names):
                    logger.warning("Ollama: modèle %s non trouvé. Lancez: ollama pull %s", self.model, self.model)
                    self._available = False
                    return False
                self._available = True
                return True
        except Exception as e:
            logger.warning("Ollama non accessible: %s. Vérifiez qu'Ollama est lancé (ollama serve).", e)
            self._available = False
            return False

    def _build_system(self, context: str, instruction: str) -> str:
        date_str = datetime.now().strftime("%Y-%m-%d")
        base = BASE_SYSTEM.format(date=date_str)
        return f"{base}\n\n**Données actuelles:**\n{context}\n\n**Instruction:** {instruction}"

    async def _call_ollama(self, system: str, user_message: str) -> str:
        """# TODO: replace with Azure OpenAI when ready"""
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{self.url}{OLLAMA_CHAT_URL}",
                    json={"model": self.model, "messages": messages, "stream": False},
                    timeout=OLLAMA_TIMEOUT,
                )
            r.raise_for_status()
            text = r.text
            # Ollama may return NDJSON (streaming) even with stream=False in some versions
            try:
                data = json.loads(text)
                msg = data.get("message") or {}
                return (msg.get("content") or "").strip()
            except json.JSONDecodeError as je:
                if "Extra data" in str(je) or "line 2" in str(je):
                    # NDJSON: parse each line and accumulate message.content
                    parts = []
                    for line in text.strip().split("\n"):
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            m = chunk.get("message") or {}
                            c = m.get("content") or ""
                            if c:
                                parts.append(c)
                        except json.JSONDecodeError:
                            continue
                    return "".join(parts).strip()
                raise
        except httpx.ConnectError:
            return ""
        except Exception as e:
            logger.exception("Ollama call failed: %s", e)
            return ""

    async def chat(self, user_message: str, context_data: str, instruction_override: Optional[str] = None) -> str:
        """Short conversational answer for popup chatbot."""
        instruction = instruction_override or CHAT_INSTRUCTION
        system = self._build_system(context_data, instruction)
        reply = await self._call_ollama(system, user_message)
        if not reply:
            return "Le modèle IA est hors ligne. Vérifiez qu'Ollama est lancé."
        return reply

    async def analyze(self, user_message: str, context_data: str) -> str:
        """Deep analysis, longer structured response."""
        system = self._build_system(context_data, ANALYZE_INSTRUCTION)
        reply = await self._call_ollama(system, user_message)
        if not reply:
            return "Le modèle IA est hors ligne. Vérifiez qu'Ollama est lancé."
        return reply

    async def generate_report(self, user_message: str, context_data: str) -> str:
        """Full markdown report with Résumé Exécutif, Analyse, Anomalies, Recommandations, Conclusion."""
        system = self._build_system(context_data, REPORT_INSTRUCTION)
        reply = await self._call_ollama(system, user_message)
        if not reply:
            return "# Erreur\n\nLe modèle IA est hors ligne. Vérifiez qu'Ollama est lancé."
        return reply


_ollama_service: Optional[OllamaService] = None


async def generate_gl_commentary(account: str, year: Optional[int] = None) -> str:
    """
    Generate GL-based commentary for a specific account using Ollama.
    Uses data from dropped files (MODELE GL, MODELE RAPPORT).
    If no GL entries: fallback to commentary from MODELE RAPPORT (YTD, Budget, N-1).
    """
    from app.services.finance_excel_service import get_gl_entries_for_account, get_rapport_row_for_account

    y = year or datetime.now().year
    gl_entries = get_gl_entries_for_account(account=account, year=y)

    if gl_entries:
        gl_lines = []
        for e in gl_entries:
            dt = _format_gl_date(e.get("date_str"))
            lb = (e.get("label") or "").strip() or "—"
            amt = e.get("amount") or 0
            gl_lines.append(f"  - Date: {dt} | Libellé/Fournisseur: {lb} | Montant: {amt:,.2f} DH")
        context = (
            f"**Grand Livre — Compte {account}** ({len(gl_entries)} écriture(s)):\n"
            + "\n".join(gl_lines)
        )
        user_msg = f"Génère le commentaire GL pour le compte {account} à partir des écritures ci-dessus."
        ollama = get_ollama_service()
        return await ollama.chat(user_msg, context, instruction_override=GL_COMMENTARY_INSTRUCTION)

    # Fallback : données agrégées du MODELE RAPPORT (issu des fichiers déposés)
    rapport_row = get_rapport_row_for_account(account=account, year=y)
    if rapport_row:
        var_b_str = _fmt_var(rapport_row.var_budget)
        var_ly_str = _fmt_var(rapport_row.var_last_year)
        context = (
            f"**MODELE RAPPORT — Compte {account} ({rapport_row.label})**\n"
            f"- Réalisé YTD: {rapport_row.ytd:,.2f} DH\n"
            f"- Budget YTD: {rapport_row.budget_ytd:,.2f} DH\n"
            f"- N-1 YTD: {rapport_row.last_year_ytd:,.2f} DH\n"
            f"- Var vs Budget: {var_b_str}\n"
            f"- Var vs N-1: {var_ly_str}"
        )
        user_msg = f"Génère le commentaire pour le compte {account} à partir des données agrégées ci-dessus."
        ollama = get_ollama_service()
        return await ollama.chat(user_msg, context, instruction_override=RAPPORT_COMMENTARY_INSTRUCTION)

    return f"Aucune donnée trouvée pour le compte {account} (année {y}). Déposez MODELE RAPPORT.xlsx ou MODELE GL.xlsx dans la zone d'import."


def get_ollama_service() -> OllamaService:
    global _ollama_service
    if _ollama_service is None:
        _ollama_service = OllamaService()
    return _ollama_service
