import json
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL


engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
    json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False),
    connect_args={"server_settings": {"client_encoding": "utf8"}},
)

SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Request-scoped session. Do not pass the same instance to asyncio.gather /
    concurrent tasks — AsyncSession allows only one in-flight operation at a time.
    """
    async with SessionLocal() as session:
        yield session


async def get_async_session() -> AsyncSession:
    """Get a new async session (for background tasks)."""
    return SessionLocal()

