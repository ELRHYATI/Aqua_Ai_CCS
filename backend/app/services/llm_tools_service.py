"""
LLM with Function Calling: routes complex questions to analytical tools.
Uses Azure OpenAI (or OpenAI) to understand the user message and call the right tool.
Data comes from PostgreSQL/Excel in real time - no indexing required.
"""

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings


# Tools the LLM can call - extend this list as you add analytics
LLM_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_vendable_par_exercice",
            "description": (
                "Retourne le vendable (biomasse vendable en kg) par exercice agricole. "
                "Applique une politique transfert/classique (ex: 65% transfert, 35% classique). "
                "L'exercice agricole par défaut va du 01/07 au 30/06. "
                "Utilisez cette fonction quand l'utilisateur demande le vendable, la biomasse vendable par exercice, "
                "avec des pourcentages transfert/classique ou une politique de semi."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "transfert_pct": {
                        "type": "number",
                        "description": "Pourcentage transfert (0-100, ex: 65). Défaut 65.",
                    },
                    "classique_pct": {
                        "type": "number",
                        "description": "Pourcentage classique (0-100, ex: 35). Défaut 35.",
                    },
                    "start_month": {
                        "type": "integer",
                        "description": "Mois de début d'exercice (1-12). 7 = juillet. Défaut 7.",
                    },
                    "end_month": {
                        "type": "integer",
                        "description": "Mois de fin d'exercice (1-12). 6 = juin. Défaut 6.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_finance_summary",
            "description": (
                "Retourne le résumé finance: YTD, budget, variance, principaux écarts. "
                "Utilisez quand l'utilisateur demande YTD, budget, variance, réalisé, finance."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_da_en_cours",
            "description": (
                "Retourne le nombre de DA en cours, total DA, valeur des achats. "
                "Utilisez pour questions sur DA, BC, achats en cours."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

SYSTEM_PROMPT = (
    "Tu es l'assistant AZURA AQUA, spécialisé en aquaculture. "
    "Tu réponds en français, de façon concise et professionnelle. "
    "Quand l'utilisateur pose une question sur le vendable, la finance, les DA/BC ou la biomasse, "
    "appelle la fonction appropriée pour obtenir les données réelles. "
    "Présente les résultats clairement. Cite la source quand c'est pertinent."
)


@dataclass
class LLMToolsResponse:
    reply: str
    citations: list[str]


async def _execute_tool(name: str, args: dict, db: AsyncSession) -> tuple[str, list[str]]:
    """Execute tool by name and return (result_text, citations)."""
    citations = []
    if name == "get_vendable_par_exercice":
        from app.services.estran_analytic_service import (
            get_vendable_par_exercice,
            format_vendable_response,
        )

        tf = (args.get("transfert_pct") or 65) / 100
        cf = (args.get("classique_pct") or 35) / 100
        start = args.get("start_month") or 7
        rows = await get_vendable_par_exercice(
            db, politique_transfert_pct=tf, politique_classique_pct=cf, start_month=start
        )
        date_debut = "01/07" if start == 7 else f"01/{start:02d}"
        date_fin = "30/06" if (args.get("end_month") or 6) == 6 else f"30/{(args.get('end_month') or 6):02d}"
        result = format_vendable_response(rows, date_debut, date_fin, int(tf * 100), int(cf * 100))
        citations.append("[1] Base Estran - biomasse_vendable_kg")
        return result, citations

    if name == "get_finance_summary":
        from app.services.chat_data_service import _get_finance_summary, _fmt_num

        fin = await _get_finance_summary(db)
        if fin["budget"] > 0 or fin["real"] > 0:
            ytd = fin["ytd"] or fin["real"]
            var = ((ytd - fin["budget"]) / fin["budget"] * 100) if fin["budget"] else 0
            text = f"YTD: {_fmt_num(ytd)} DH. Budget: {_fmt_num(fin['budget'])} DH. Variance: {var:+.1f}%."
            if fin["top_variances"]:
                t = fin["top_variances"][0]
                text += f" Principal écart: {t['label']} ({t['var_pct']:+.1f}%)."
        else:
            text = "Aucune donnée finance. Importez MODELE RAPPORT ou BAL MODELE."
        citations.append("[1] Base Finance")
        return text, citations

    if name == "get_da_en_cours":
        from app.services.chat_data_service import _get_achat_suivi_excel, _get_achat_counts_db, _fmt_num

        suivi = _get_achat_suivi_excel()
        if suivi and suivi.get("summary"):
            s = suivi["summary"]
            text = f"DA en cours: {s.get('da_en_cours', 0)} (sur {s.get('total_da', 0)}). Valeur: {_fmt_num(s.get('valeur_totale', 0))} DH."
        else:
            counts = await _get_achat_counts_db(db)
            text = f"DA: {counts['da_count']}, montant {_fmt_num(counts['da_amount'])} DH. BC: {counts['bc_count']}, {_fmt_num(counts['bc_amount'])} DH."
        citations.append("[1] Suivi Global CCS / Base Achats")
        return text, citations

    return f"Outil '{name}' non reconnu.", []


async def chat_with_llm_tools(
    user_message: str, db: AsyncSession
) -> LLMToolsResponse:
    """
    Call Azure OpenAI with tools. LLM chooses which tool to call.
    Executes the tool and returns formatted response.
    """
    s = get_settings()
    if not s.azure_openai_endpoint or not s.azure_openai_api_key:
        return LLMToolsResponse(
            reply="Configurez AZURE_OPENAI_ENDPOINT et AZURE_OPENAI_API_KEY pour utiliser l'assistant LLM avec outils.",
            citations=[],
        )

    from openai import AsyncAzureOpenAI

    client = AsyncAzureOpenAI(
        azure_endpoint=s.azure_openai_endpoint.rstrip("/"),
        api_key=s.azure_openai_api_key,
        api_version=s.azure_openai_api_version,
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    max_rounds = 3
    all_citations: list[str] = []

    for _ in range(max_rounds):
        response = await client.chat.completions.create(
            model=s.azure_openai_deployment_name,
            messages=messages,
            tools=LLM_TOOLS,
            tool_choice="auto",
        )

        msg = response.choices[0].message
        if not hasattr(msg, "tool_calls") or not msg.tool_calls:
            return LLMToolsResponse(
                reply=(msg.content or "").strip(),
                citations=all_citations if all_citations else ["Azure OpenAI"],
            )

        messages.append(msg)

        for tc in msg.tool_calls:
            name = tc.function.name if hasattr(tc.function, "name") else tc.get("function", {}).get("name")
            try:
                import json

                args_str = tc.function.arguments if hasattr(tc.function, "arguments") else tc.get("function", {}).get("arguments", "{}")
                args = json.loads(args_str) if args_str else {}
            except Exception:
                args = {}

            result, cites = await _execute_tool(name, args, db)
            all_citations.extend(cites)

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id if hasattr(tc, "id") else tc.get("id", "x"),
                    "content": result,
                }
            )

    return LLMToolsResponse(
        reply="Limite de tours atteinte. Reformulez votre question.",
        citations=all_citations,
    )
