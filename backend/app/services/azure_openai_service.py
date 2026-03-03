"""
Azure OpenAI client - GPT-4, GPT-4.1, GPT-4o.
Shared by commentary_service and chat_service.
"""

from openai import AsyncAzureOpenAI

from app.core.config import get_settings


def _get_client() -> AsyncAzureOpenAI | None:
    """Return configured Azure OpenAI client or None if not configured."""
    s = get_settings()
    if not s.azure_openai_endpoint or not s.azure_openai_api_key:
        return None
    return AsyncAzureOpenAI(
        azure_endpoint=s.azure_openai_endpoint.rstrip("/"),
        api_key=s.azure_openai_api_key,
        api_version=s.azure_openai_api_version,
    )


async def chat_completion(
    system: str,
    user: str,
) -> str:
    """
    Call Azure OpenAI Chat Completions (GPT-4 / GPT-4.1 / GPT-4o).
    Returns assistant message content or empty string if not configured.
    """
    client = _get_client()
    if not client:
        return ""

    s = get_settings()
    response = await client.chat.completions.create(
        model=s.azure_openai_deployment_name,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return response.choices[0].message.content or ""
