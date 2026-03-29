"""Admin and user schemas."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class UserPrivileges(BaseModel):
    can_export_pdf: Optional[bool] = None
    can_upload_files: Optional[bool] = None
    can_use_chatbot: Optional[bool] = None
    can_view_finance: Optional[bool] = None
    can_view_estran: Optional[bool] = None
    can_view_achat: Optional[bool] = None
    can_run_ml: Optional[bool] = None
    can_manage_users: Optional[bool] = None


class UserCreate(BaseModel):
    full_name: str
    email: str
    password: Optional[str] = None
    role: str = "viewer"
    department: Optional[str] = None
    can_export_pdf: bool = True
    can_upload_files: bool = False
    can_use_chatbot: bool = True
    can_view_finance: bool = False
    can_view_estran: bool = False
    can_view_achat: bool = False
    can_run_ml: bool = False
    can_manage_users: bool = False
    notes: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    can_export_pdf: Optional[bool] = None
    can_upload_files: Optional[bool] = None
    can_use_chatbot: Optional[bool] = None
    can_view_finance: Optional[bool] = None
    can_view_estran: Optional[bool] = None
    can_view_achat: Optional[bool] = None
    can_run_ml: Optional[bool] = None
    can_manage_users: Optional[bool] = None
    notes: Optional[str] = None


class UserResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    department: Optional[str] = None
    is_active: bool
    can_export_pdf: bool
    can_upload_files: bool
    can_use_chatbot: bool
    can_view_finance: bool
    can_view_estran: bool
    can_view_achat: bool
    can_run_ml: bool
    can_manage_users: bool
    notes: Optional[str] = None

    class Config:
        from_attributes = True
