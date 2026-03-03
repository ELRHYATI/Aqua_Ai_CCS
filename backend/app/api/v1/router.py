"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import estran, finance, achat, chat, sync, dashboard, ml

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(dashboard.router)
api_router.include_router(ml.router)
api_router.include_router(estran.router)
api_router.include_router(sync.router)
api_router.include_router(finance.router)
api_router.include_router(achat.router)
api_router.include_router(chat.router)
