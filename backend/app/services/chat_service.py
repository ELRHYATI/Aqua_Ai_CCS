"""
Chatbot service using Azure OpenAI GPT-4.
For now: stub returning dummy answer. Structure ready for RAG + Azure OpenAI.
"""

from app.core.config import get_settings


SYSTEM_PROMPT = """You are the AZURA AQUA assistant. You answer questions about:
- Estran production (parc, ligne, biomasse, récolte, anomalies)
- Financial results (YTD vs Budget vs N-1, variances, GL)
- DA/BC KPIs (Demandes d'Achat en cours, Bons de Commande non livrés)

Use the company's terminology. Be concise and professional. Answer in French unless asked otherwise."""


def build_prompt(user_message: str, context: str | None = None) -> tuple[str, str]:
    """
    Build system and user messages.
    When RAG is implemented: context will contain retrieved chunks from DB or Power BI.
    """
    system = SYSTEM_PROMPT
    if context:
        system += f"\n\nContexte pertinent:\n{context}"

    user = user_message
    return system, user


async def call_azure_openai(system: str, user: str) -> str:
    """
    Call Azure OpenAI (GPT-4 / GPT-4.1) for chat.
    RAG: inject context from PostgreSQL or OneDrive/Excel when implemented.
    """
    from app.services.azure_openai_service import chat_completion

    result = await chat_completion(system=system, user=user)
    if not result:
        return (
            "Bonjour, je suis l'assistant AZURA AQUA. "
            "Configurez Azure OpenAI dans .env pour des réponses IA. "
            "RAG (données OneDrive / PostgreSQL) à activer."
        )
    return result


async def chat(message: str) -> str:
    """Process user message and return assistant response."""
    system, user = build_prompt(message)
    return await call_azure_openai(system, user)
