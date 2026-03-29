"""Chat schemas."""

from pydantic import BaseModel


class ChatMessage(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    citations: list[str] = []
    data_used: list[str] = []  # sources used for context (estran_records, etc.)


class ChatAnalyzeRequest(BaseModel):
    message: str
    include_data: bool = False


class ChatAnalyzeResponse(BaseModel):
    response: str
    data_used: list[str]
    model: str
    timestamp: str


class ChatReportRequest(BaseModel):
    message: str
    title: str = "Rapport Azura Aqua"
