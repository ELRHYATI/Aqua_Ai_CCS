"""Background task model for async processing."""

from sqlalchemy import Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import Base


class BackgroundTask(Base):
    __tablename__ = "background_tasks"

    id = Column(String(36), primary_key=True)
    task_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False)
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
