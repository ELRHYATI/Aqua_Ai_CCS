"""Assistant configuration endpoint — single POST to save chatbot flow results."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.assistant_config import AssistantConfig

router = APIRouter(prefix="/assistant", tags=["assistant"])

VALID_MODULES = {"estran", "finance", "achats"}
VALID_FOCUS = {"anomalies", "kpi", "les deux"}


class AssistantConfigCreate(BaseModel):
    module: str
    data_files: str
    focus: str
    sensitive_fields: str = "aucun"
    access: str = "tous"
    deadlines: str = "aucun"

    @field_validator("module")
    @classmethod
    def validate_module(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in VALID_MODULES:
            raise ValueError(f"Module invalide. Choix : {', '.join(sorted(VALID_MODULES))}")
        return v

    @field_validator("focus")
    @classmethod
    def validate_focus(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in VALID_FOCUS:
            raise ValueError(f"Focus invalide. Choix : {', '.join(sorted(VALID_FOCUS))}")
        return v

    @field_validator("data_files")
    @classmethod
    def validate_data_files(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Veuillez indiquer au moins un fichier.")
        return v


class AssistantConfigResponse(BaseModel):
    id: int
    module: str
    data_files: str
    focus: str
    sensitive_fields: str
    access: str
    deadlines: str

    class Config:
        from_attributes = True


@router.post("/config", response_model=AssistantConfigResponse)
async def save_assistant_config(
    payload: AssistantConfigCreate,
    db: AsyncSession = Depends(get_db),
):
    """Save a module configuration created through the assistant flow."""
    record = AssistantConfig(
        module=payload.module,
        data_files=payload.data_files,
        focus=payload.focus,
        sensitive_fields=payload.sensitive_fields,
        access=payload.access,
        deadlines=payload.deadlines,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record
