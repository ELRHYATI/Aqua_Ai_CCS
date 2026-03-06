"""Sync from OneDrive Excel or manual file upload."""

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.excel_sync_service import seed_from_excel
from app.services.onedrive_excel_service import sync_onedrive_excel_to_db

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/onedrive")
async def sync_from_onedrive():
    """
    Download REFLEXION.xlsx from OneDrive and sync to PostgreSQL.
    Requires Azure AD + OneDrive config in .env.
    """
    result = await sync_onedrive_excel_to_db()
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.post("/upload")
async def upload_excel(file: UploadFile = File(..., description="Excel file (REFLEXION.xlsx format)")):
    """
    Accept a manual file upload (drag-and-drop or file picker).
    Expects an Excel file with sheets: BD ESTRA, RESULTAT MODELE.
    Replaces existing data in the database.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Utilisez .xlsx ou .xls (reçu: {ext or 'inconnu'})",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        path = Path(tmp.name)

    try:
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            counts = await seed_from_excel(session, path, replace=True)
        return dict(counts)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Erreur lors de l'import: {str(e)}")
    finally:
        try:
            path.unlink(missing_ok=True)
        except (PermissionError, OSError):
            pass
