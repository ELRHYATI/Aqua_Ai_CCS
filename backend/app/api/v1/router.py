"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    achat,
    admin,
    assistant_config,
    auth,
    chat,
    dashboard,
    estran,
    finance,
    ml,
    sync,
    tasks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(dashboard.router)
api_router.include_router(ml.router)
api_router.include_router(tasks.router)
api_router.include_router(estran.router)
api_router.include_router(sync.router)
api_router.include_router(finance.router)
api_router.include_router(achat.router)
api_router.include_router(chat.router)
api_router.include_router(assistant_config.router)
