"""
Azure OpenAI "On Your Data" - Copilot-like experience.
Connects to Azure AI Search indexed with Excel / Power BI data.
Full citations and RAG. Stubbed when Azure Search not configured.
"""

from dataclasses import dataclass
from typing import Optional

from app.core.config import get_settings


SYSTEM_PROMPT = (
    "Tu es l'assistant AZURA AQUA. Tu réponds en français sur les données Estran, "
    "finance YTD/Budget/N-1, DA/BC (Demandes d'Achat, Bons de Commande). "
    "Cite tes sources. Sois concis et professionnel."
)


@dataclass
class CopilotResponse:
    reply: str
    citations: list[str]


def _build_data_sources() -> list[dict] | None:
    """
    Build Azure AI Search data source config for "On Your Data".
    Returns None if not configured (stub mode).
    """
    s = get_settings()
    endpoint = getattr(s, "azure_search_endpoint", "") or ""
    key = getattr(s, "azure_search_key", "") or ""
    index_name = getattr(s, "azure_search_index_name", "") or "azura-finance-estrans"

    if not endpoint or not key:
        return None

    return [
        {
            "type": "azure_search",
            "parameters": {
                "endpoint": endpoint.rstrip("/"),
                "index_name": index_name,
                "authentication": {
                    "type": "api_key",
                    "key": key,
                },
                "top_n_documents": 5,
            },
        }
    ]


async def _call_azure_openai_on_your_data(
    user_message: str,
    data_sources: list[dict],
) -> CopilotResponse:
    """
    Call Azure OpenAI Chat Completions with "On Your Data" (data_sources).
    Extracts reply and citations from response.
    """
    from openai import AsyncAzureOpenAI

    s = get_settings()
    if not s.azure_openai_endpoint or not s.azure_openai_api_key:
        return CopilotResponse(
            reply=(
                "Configurez AZURE_OPENAI_ENDPOINT et AZURE_OPENAI_API_KEY. "
                "Assistant en attente."
            ),
            citations=[],
        )

    client = AsyncAzureOpenAI(
        azure_endpoint=s.azure_openai_endpoint.rstrip("/"),
        api_key=s.azure_openai_api_key,
        api_version=s.azure_openai_api_version,
    )

    response = await client.chat.completions.create(
        model=s.azure_openai_deployment_name,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        extra_body={"data_sources": data_sources},
    )

    msg = response.choices[0].message
    reply = msg.content or ""
    citations: list[str] = []

    if hasattr(msg, "context") and msg.context:
        ctx = msg.context
        if hasattr(ctx, "citations") and ctx.citations:
            for c in ctx.citations:
                if isinstance(c, str):
                    citations.append(c)
                elif hasattr(c, "content"):
                    citations.append(str(c.content))
                elif isinstance(c, dict) and "content" in c:
                    citations.append(str(c["content"]))

    return CopilotResponse(reply=reply, citations=citations)


async def _stub_response(user_message: str) -> CopilotResponse:
    """
    Stub when Azure Search is not configured.
    Returns structured answer with placeholder citations.
    """
    lower = user_message.lower()
    if "ytd" in lower or "budget" in lower or "décembre" in lower:
        return CopilotResponse(
            reply=(
                "**YTD vs Budget décembre 2025** (données simulées)\n\n"
                "Le YTD (Year-to-Date) représente les réalisations cumulées sur l'année. "
                "Le Budget est l'objectif annuel défini. La variance Budget/Réalisé permet "
                "d'identifier les écarts. Pour décembre 2025, consultez les lignes du "
                "Résultat Modèle (RESULTAT MODELE). Les colonnes PERIODE YTD, B (Budget) "
                "et R (Réalisé) fournissent les détails.\n\n"
                "Configurez Azure AI Search indexé sur Power BI / Excel pour des réponses "
                "basées sur vos données réelles."
            ),
            citations=[
                "[1] RESULTAT MODELE - colonnes YTD, B, R",
                "[2] REFLEXION.xlsx - feuille RESULTAT MODELE",
            ],
        )

    if "estran" in lower or "parc" in lower or "biomasse" in lower:
        return CopilotResponse(
            reply=(
                "**BD Estran** contient les données de production (parc, ligne, biomasse, "
                "récolte). Consultez la feuille BD ESTRA dans REFLEXION.xlsx. "
                "Configurez Azure AI Search pour des analyses en temps réel."
            ),
            citations=["[1] REFLEXION.xlsx - feuille BD ESTRA"],
        )

    if "da" in lower or "bc" in lower:
        return CopilotResponse(
            reply=(
                "**DA** (Demande d'Achat) et **BC** (Bon de Commande) : voir TB ACHAT. "
                "DA en cours et BC non livrés sont suivis via les KPIs. "
                "Configurez Azure AI Search pour des réponses basées sur vos données."
            ),
            citations=["[1] REFLEXION.xlsx - feuille TB ACHAT"],
        )

    return CopilotResponse(
        reply=(
            "Je suis l'assistant AZURA AQUA. Posez des questions sur Estran, "
            "finance (YTD, Budget, N-1) ou DA/BC. Configurez Azure AI Search "
            "(AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_KEY, AZURE_SEARCH_INDEX_NAME) "
            "et indexez vos données Excel/Power BI pour des réponses avec citations."
        ),
        citations=[],
    )


async def chat_with_data(user_message: str) -> CopilotResponse:
    """
    Chat using Azure OpenAI "On Your Data" when configured,
    otherwise return stub response with placeholder citations.
    """
    data_sources = _build_data_sources()

    if data_sources:
        try:
            return await _call_azure_openai_on_your_data(user_message, data_sources)
        except Exception as e:
            return CopilotResponse(
                reply=f"Erreur Azure OpenAI On Your Data: {e}. Mode stub activé.",
                citations=[],
            )

    return await _stub_response(user_message)
