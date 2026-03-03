"""Chat schemas."""

from pydantic import BaseModel


class ChatMessage(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    citations: list[str] = []
