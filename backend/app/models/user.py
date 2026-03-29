"""User model with privileges."""

import uuid
from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="viewer")
    department = Column(String(50), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Privileges
    can_export_pdf = Column(Boolean, nullable=False, default=True)
    can_upload_files = Column(Boolean, nullable=False, default=False)
    can_use_chatbot = Column(Boolean, nullable=False, default=True)
    can_view_finance = Column(Boolean, nullable=False, default=False)
    can_view_estran = Column(Boolean, nullable=False, default=False)
    can_view_achat = Column(Boolean, nullable=False, default=False)
    can_run_ml = Column(Boolean, nullable=False, default=False)
    can_manage_users = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
