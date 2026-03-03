"""Chat API endpoints."""

from fastapi import APIRouter

from app.schemas.chat import ChatMessage, ChatResponse
from app.services.copilot_service import chat_with_data

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def post_chat(message: ChatMessage):
    """
    Copilot-like chatbot using Azure OpenAI On Your Data + Azure AI Search.
    Returns reply with citations when configured. Stub mode when not.
    """
    result = await chat_with_data(message.message)
    return ChatResponse(response=result.reply, citations=result.citations)
