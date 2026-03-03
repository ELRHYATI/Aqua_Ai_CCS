"""
Finance commentary generator using Azure OpenAI GPT-4.
For now: stub returning dummy text. Structure ready for openai.ChatCompletion.create.
"""

from decimal import Decimal
from typing import List, Optional

from app.schemas.finance import Commentary, VarianceInput


def _format_numbers(v: VarianceInput) -> str:
    """Format variance input for prompt."""
    parts = []
    if v.ytd is not None:
        parts.append(f"YTD: {v.ytd}")
    if v.budget is not None:
        parts.append(f"Budget: {v.budget}")
    if v.n1 is not None:
        parts.append(f"N-1: {v.n1}")
    if v.real is not None:
        parts.append(f"Réalisé: {v.real}")
    if v.var_b_r is not None:
        parts.append(f"VAR B/R: {v.var_b_r}")
    if v.var_pct is not None:
        parts.append(f"Var %: {v.var_pct}%")
    if v.period_label:
        parts.append(f"Période: {v.period_label}")
    if v.top_drivers:
        parts.append(f"Top drivers: {', '.join(v.top_drivers)}")
    return "\n".join(parts) if parts else "Aucune donnée"


def _build_prompt(v: VarianceInput) -> str:
    """Build the system + user prompt for commentary generation."""
    numbers = _format_numbers(v)
    return f"""You are an expert financial analyst for AZURA AQUA (aquaculture/finance).
Based on the following financial data, produce a structured commentary.

Data:
{numbers}

Respond with:
1. Summary: 3-4 sentences explaining the situation.
2. Key drivers: bulleted list of main factors.
3. Recommendations: 2-3 concrete actions.

Use French and company terminology (Estran, DA, BC, YTD, Budget, N-1)."""


async def call_azure_openai(prompt: str, system_prompt: str) -> str:
    """Call Azure OpenAI (GPT-4 / GPT-4.1). Returns stub message if not configured."""
    from app.services.azure_openai_service import chat_completion

    result = await chat_completion(system=system_prompt, user=prompt)
    if not result:
        return "[STUB] Configurez AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY et AZURE_OPENAI_DEPLOYMENT_NAME dans .env"
    return result


def _parse_commentary_response(raw: str, v: VarianceInput) -> Commentary:
    """
    Parse LLM response into structured Commentary.
    For stub: return dummy structured output.
    """
    if "[STUB]" in raw or "non configuré" in raw.lower():
        return Commentary(
            summary="Commentaire IA en attente de configuration Azure OpenAI. "
            "Veuillez configurer AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY et AZURE_OPENAI_DEPLOYMENT_NAME.",
            key_drivers=[
                "Analyse des écarts Budget vs Réalisé",
                "Comparaison N-1",
                "Identification des postes à surveiller",
            ],
            recommendations=[
                "Valider les seuils d'alerte avec la direction",
                "Connecter les sources de données réelles (Power BI / DB)",
                "Activer Azure OpenAI pour les commentaires automatiques",
            ],
        )

    lines = raw.strip().split("\n")
    summary_parts = []
    key_drivers = []
    recommendations = []

    current = "summary"
    for line in lines:
        line = line.strip()
        if not line:
            continue
        lower = line.lower()
        if "key drivers" in lower or "principaux facteurs" in lower or "facteurs clés" in lower:
            current = "drivers"
            continue
        if "recommendations" in lower or "recommandations" in lower:
            current = "recommendations"
            continue
        if line.startswith(("-", "*", "•", "1.", "2.", "3.")):
            if current == "drivers":
                key_drivers.append(line.lstrip("-*•123. "))
            elif current == "recommendations":
                recommendations.append(line.lstrip("-*•123. "))
        elif current == "summary":
            summary_parts.append(line)

    return Commentary(
        summary=" ".join(summary_parts) if summary_parts else raw[:500],
        key_drivers=key_drivers if key_drivers else ["Voir rapport détaillé"],
        recommendations=recommendations if recommendations else ["Analyser les écarts"],
    )


async def generate_finance_commentary(variance_input: VarianceInput) -> Commentary:
    """
    Generate structured commentary from variance data.
    """
    system_prompt = "You are an expert financial analyst for AZURA AQUA."
    user_prompt = _build_prompt(variance_input)

    raw = await call_azure_openai(user_prompt, system_prompt)
    return _parse_commentary_response(raw, variance_input)
