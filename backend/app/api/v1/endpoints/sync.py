"""Sync from OneDrive Excel or manual file upload."""

import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.finance_excel_mapping import DATA_DIR
from app.core.auth import get_current_user, require_can_upload_files
from app.models.user import User
from app.services.audit_service import log
from app.core.database import AsyncSessionLocal, get_db
from app.core.limiter import limiter
from app.services.excel_sync_service import seed_from_excel
from app.services.onedrive_excel_service import sync_onedrive_excel_to_db
from app.services.task_service import create_task, set_task_done, set_task_error, set_task_running

router = APIRouter(prefix="/sync", tags=["sync"])

# Fichiers finance : copiés vers data/ puis mapping GL synchronisé automatiquement
FINANCE_FILES = {"MODELE GL.xlsx", "BAL MODELE.xlsx", "MODELE RAPPORT.xlsx"}

# Suivi achats : toujours ce nom canonique sous data/ (lu par achat_suivi_service)
SUIVI_GLOBAL_CANONICAL = "Suivi Global CCS.xlsm"


def _basename(name: str) -> str:
    return Path(name.strip()).name


def _is_finance_upload(name: str) -> bool:
    return _basename(name).upper() in {f.upper() for f in FINANCE_FILES}


def _finance_destination(name: str) -> Path:
    base = _basename(name)
    return DATA_DIR / next(f for f in FINANCE_FILES if f.upper() == base.upper())


def _is_suivi_global_ccs(name: str) -> bool:
    """Fichier Suivi Global CCS (achats) — ne doit pas passer par seed_from_excel."""
    n = _basename(name).lower().replace("\xa0", " ").replace("\u00a0", " ")
    return "suivi" in n and "global" in n and "ccs" in n


def _seed_workbook_priority(name: str) -> tuple[int, str]:
    """
    Priorité pour choisir le classeur REFLEXION / Estran (seed DB).
    Plus petit = meilleur candidat. Suivi CCS est exclu avant d'arriver ici.
    """
    base = _basename(name).lower()
    if "reflexion" in base:
        return (0, base)
    if "exemple" in base and "estran" in base:
        return (5, base)
    if "bdd" in base and "estran" in base:
        return (5, base)
    if "estran" in base:
        return (20, base)
    return (50, base)


def _run_sync_gl_mapping() -> int:
    """Exécute la sync du mapping BAL -> GL. Retourne le nombre d'écritures mappées."""
    from app.services.finance_excel_service import sync_gl_mapping
    return sync_gl_mapping()


async def _run_sync_upload(task_id: str, reflexion_path: Path | None, finance_files_saved: bool) -> None:
    """Exécute seed_from_excel (si REFLEXION), puis sync_gl_mapping (si fichiers finance ou toujours)."""
    async with AsyncSessionLocal() as session:
        try:
            await set_task_running(session, task_id)
            await session.commit()
        except Exception:
            pass

    counts = {"estran": 0, "finance": 0, "purchases": 0}
    try:
        if reflexion_path and reflexion_path.exists():
            async with AsyncSessionLocal() as session:
                counts = await seed_from_excel(session, reflexion_path, replace=True)
        # Toujours exécuter sync_gl_mapping après upload (mapping BAL -> GL dans MODELE GL)
        gl_mapped = _run_sync_gl_mapping()
        result = {**counts, "gl_mapping": gl_mapped}
        async with AsyncSessionLocal() as session:
            await set_task_done(session, task_id, result)
    except Exception as e:
        async with AsyncSessionLocal() as err_session:
            await set_task_error(err_session, task_id, str(e))
    finally:
        if reflexion_path:
            try:
                reflexion_path.unlink(missing_ok=True)
            except (PermissionError, OSError):
                pass


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
@limiter.limit("5/minute")
async def upload_excel(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(..., alias="file", description="Excel files (REFLEXION, MODELE GL, BAL MODELE, etc.)"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Accept file uploads. Supports multiple files:
    - MODELE GL.xlsx, BAL MODELE.xlsx, MODELE RAPPORT.xlsx -> copied to data/ (mapping GL synced automatically)
    - REFLEXION.xlsx or similar -> seed to PostgreSQL
    """
    require_can_upload_files(current_user)
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    reflexion_path: Path | None = None
    seed_candidates: list[tuple[Path, str]] = []

    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        for uf in files:
            if not uf.filename:
                continue
            ext = Path(uf.filename).suffix.lower()
            if ext not in (".xlsx", ".xlsm"):
                continue
            content = await uf.read()
            if not content:
                continue
            fn = uf.filename.strip()
            if not fn:
                continue

            if _is_finance_upload(fn):
                dest = _finance_destination(fn)
                dest.write_bytes(content)
                continue

            if _is_suivi_global_ccs(fn):
                (DATA_DIR / SUIVI_GLOBAL_CANONICAL).write_bytes(content)
                continue

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(content)
                p = Path(tmp.name)
                seed_candidates.append((p, _basename(fn)))

        if seed_candidates:
            seed_candidates.sort(key=lambda pair: (_seed_workbook_priority(pair[1]), pair[1]))
            reflexion_path = seed_candidates[0][0]
            for p, _ in seed_candidates[1:]:
                try:
                    p.unlink(missing_ok=True)
                except (PermissionError, OSError):
                    pass

        task_id = await create_task(db, "sync_upload")
        file_names = [uf.filename for uf in files if uf.filename]
        background_tasks.add_task(
            log,
            str(current_user.id) if current_user else None,
            "file_upload",
            "upload",
            {"task_id": task_id, "files": file_names},
            request,
            "success",
            file_name=",".join(file_names)[:255] if file_names else None,
        )
        seed_for_task = reflexion_path if (reflexion_path and reflexion_path.exists()) else None
        background_tasks.add_task(_run_sync_upload, task_id, seed_for_task, True)
        return JSONResponse(status_code=202, content={"task_id": task_id})
    except Exception as e:
        for p, _ in seed_candidates:
            try:
                p.unlink(missing_ok=True)
            except (PermissionError, OSError):
                pass
        raise HTTPException(status_code=500, detail=str(e))
