"""Background task service: create, update, poll status."""

import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.background_task import BackgroundTask


async def create_task(db: AsyncSession, task_type: str) -> str:
    """Create a task with status 'pending'. Returns task_id."""
    task_id = str(uuid.uuid4())
    task = BackgroundTask(id=task_id, task_type=task_type, status="pending")
    db.add(task)
    await db.commit()
    return task_id


async def get_task_status(db: AsyncSession, task_id: str) -> Optional[dict[str, Any]]:
    """Return { status, result?, error_message? } or None if not found."""
    r = await db.execute(select(BackgroundTask).where(BackgroundTask.id == task_id))
    task = r.scalar_one_or_none()
    if not task:
        return None
    out = {"status": task.status}
    if task.result is not None:
        out["result"] = task.result
    if task.error_message:
        out["error_message"] = task.error_message
    return out


async def set_task_running(db: AsyncSession, task_id: str) -> None:
    task = await db.get(BackgroundTask, task_id)
    if task:
        task.status = "running"
        await db.commit()


async def set_task_done(db: AsyncSession, task_id: str, result: dict) -> None:
    task = await db.get(BackgroundTask, task_id)
    if task:
        task.status = "done"
        task.result = result
        await db.commit()


async def set_task_error(db: AsyncSession, task_id: str, error_message: str) -> None:
    task = await db.get(BackgroundTask, task_id)
    if task:
        task.status = "error"
        task.error_message = error_message
        await db.commit()
