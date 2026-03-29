"""Async SQLAlchemy engine and session."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models.base import Base

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    poolclass=NullPool if settings.debug else None,
)

# Optional chatbot read-only engine (when CHATBOT_DATABASE_URL is set)
chatbot_engine = None
ChatbotSessionLocal = None
if settings.chatbot_database_url:
    chatbot_engine = create_async_engine(
        settings.chatbot_database_url,
        echo=settings.debug,
        poolclass=NullPool if settings.debug else None,
    )
    ChatbotSessionLocal = async_sessionmaker(
        chatbot_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """Dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_chatbot_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields chatbot DB session when CHATBOT_DATABASE_URL is set, else main DB.
    Chatbot uses read-only role (chatbot_ro) with SELECT on estran_summary, finance_kpi_public, achat_status.
    """
    session_factory = ChatbotSessionLocal if ChatbotSessionLocal is not None else AsyncSessionLocal
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create tables (for development; Alembic used in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
