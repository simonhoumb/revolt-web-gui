"""Async SQLAlchemy engine/session setup and the FastAPI DB-session dependency."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from revolt_api.config import settings

engine = create_async_engine(settings.database_url, echo=settings.is_dev)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
	"""FastAPI dependency yielding a request-scoped AsyncSession."""
	async with AsyncSessionLocal() as session:
		yield session
