"""Assistant configuration model — stores module configs created by the chatbot flow."""

from sqlalchemy import Column, BigInteger, String, Text

from app.models.base import Base, TimestampMixin


class AssistantConfig(Base, TimestampMixin):
    __tablename__ = "assistant_configs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    module = Column(String(50), nullable=False, index=True)
    data_files = Column(Text, nullable=True)
    focus = Column(String(50), nullable=True)
    sensitive_fields = Column(Text, nullable=True)
    access = Column(Text, nullable=True)
    deadlines = Column(Text, nullable=True)
