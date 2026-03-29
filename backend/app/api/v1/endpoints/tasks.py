"""Background task status API."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.services.task_service import get_task_status
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}/status")
async def task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return task status: pending, running, done, or error.
    When done: includes result. When error: includes error_message.
    """
    status = await get_task_status(db, task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
