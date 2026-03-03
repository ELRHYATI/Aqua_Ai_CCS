"""
OneDrive for Business - Excel data source.
Reads REFLEXION.xlsx from OneDrive via Microsoft Graph API.
Configure: AZURE_AD_*, ONEDRIVE_EXCEL_PATH, ONEDRIVE_USER_ID (for app-only).
Fallback: excel_local_path or REFLEXION.xlsx in project root.
"""

import tempfile
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def _get_local_excel_path() -> Path | None:
    """Resolve local Excel path from config or common locations."""
    s = get_settings()
    if s.excel_local_path:
        p = Path(s.excel_local_path)
        if p.is_absolute():
            return p if p.exists() else None
        # Relative to backend/cwd
        return p.resolve() if p.resolve().exists() else None
    # Default: REFLEXION.xlsx in project root (parent of backend)
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "REFLEXION.xlsx",
        Path.cwd() / "REFLEXION.xlsx",
        Path(__file__).resolve().parent.parent.parent.parent / "REFLEXION.xlsx",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


async def get_onedrive_excel_bytes() -> tuple[bytes | None, str | None]:
    """
    Download Excel from OneDrive or local fallback.
    Returns (bytes, error_message). error_message is None on success.
    """
    s = get_settings()

    # 1. Try OneDrive if Azure AD is configured
    if all([s.azure_ad_tenant_id, s.azure_ad_client_id, s.azure_ad_client_secret]):
        result, err = await _fetch_from_onedrive()
        if result is not None:
            return result, None
        if err:
            # OneDrive failed - try local fallback
            local = _get_local_excel_path()
            if local:
                try:
                    return local.read_bytes(), None
                except Exception as e:
                    return None, f"OneDrive: {err}. Local fallback: {e}"
            return None, err
        return None, "OneDrive: Erreur inconnue"

    # 2. Local fallback when OneDrive not configured
    local = _get_local_excel_path()
    if local:
        try:
            return local.read_bytes(), None
        except Exception as e:
            return None, f"Fichier local inaccessible: {e}"

    return None, (
        "Configurez AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET pour OneDrive, "
        "ou déposez REFLEXION.xlsx à la racine du projet."
    )


async def _fetch_from_onedrive() -> tuple[bytes | None, str | None]:
    """Fetch Excel from Microsoft Graph. Returns (bytes, error)."""
    s = get_settings()
    try:
        import msal
        import httpx
    except ImportError:
        return None, "Installez msal et httpx: pip install msal httpx"

    authority = f"https://login.microsoftonline.com/{s.azure_ad_tenant_id}"
    app = msal.ConfidentialClientApplication(
        s.azure_ad_client_id,
        client_credential=s.azure_ad_client_secret,
        authority=authority,
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])

    if not result or "access_token" not in result:
        err = result.get("error_description", result.get("error", "Échec d'authentification"))
        return None, f"Azure AD: {err}"

    token = result["access_token"]
    base = "https://graph.microsoft.com/v1.0"

    # App-only requires user ID; "me" only works with delegated auth
    user_id = s.onedrive_user_id.strip() if s.onedrive_user_id else None
    if not user_id:
        return None, (
            "ONEDRIVE_USER_ID requis pour auth app-only. "
            "Renseignez l'Object ID de l'utilisateur propriétaire du fichier."
        )

    # Resolve item ID from path if needed
    item_id = s.onedrive_excel_item_id.strip() if s.onedrive_excel_item_id else None
    if not item_id and s.onedrive_excel_path:
        path = s.onedrive_excel_path.strip().lstrip("/")
        url = f"{base}/users/{user_id}/drive/root:/{path}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if resp.status_code == 404:
            return None, f"Fichier introuvable: {path}. Vérifiez ONEDRIVE_EXCEL_PATH."
        if resp.status_code == 403:
            return None, "Permission refusée. Vérifiez Files.Read.All sur l'app Azure AD."
        if resp.status_code != 200:
            return None, f"Graph API: {resp.status_code} - {resp.text[:200]}"
        item_id = resp.json().get("id")
        if not item_id:
            return None, "Réponse Graph invalide (id manquant)"

    if not item_id:
        return None, "Configurez ONEDRIVE_EXCEL_PATH ou ONEDRIVE_EXCEL_ITEM_ID"

    url = f"{base}/users/{user_id}/drive/items/{item_id}/content"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)

    if resp.status_code != 200:
        return None, f"Téléchargement: {resp.status_code} - {resp.text[:200]}"

    return resp.content, None


async def sync_onedrive_excel_to_db() -> dict[str, Any]:
    """Download Excel from OneDrive (or local) and sync to PostgreSQL."""
    data, error = await get_onedrive_excel_bytes()
    if error or not data:
        return {"estran": 0, "finance": 0, "purchases": 0, "error": error or "Aucune donnée"}

    from app.core.database import AsyncSessionLocal
    from app.services.excel_sync_service import seed_from_excel

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(data)
        path = Path(tmp.name)

    try:
        async with AsyncSessionLocal() as session:
            counts = await seed_from_excel(session, path)
        path.unlink(missing_ok=True)
        return dict(counts)
    except Exception as e:
        path.unlink(missing_ok=True)
        return {"estran": 0, "finance": 0, "purchases": 0, "error": str(e)}
