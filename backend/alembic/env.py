from __future__ import annotations

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

# Allow `from app...` when running alembic from backend/ (local dev, Windows).
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from alembic import context
from sqlalchemy import pool

from app.core.config import settings
from app.models.base import Base

# Импорт модели гарантирует, что она зарегистрируется в metadata
from app.models import user as _user_model  # noqa: F401
from app.models import course as _course_model  # noqa: F401
from app.models import course_enrollment as _course_enrollment_model  # noqa: F401
from app.models import assignment as _assignment_model  # noqa: F401
from app.models import submission as _submission_model  # noqa: F401
from app.models import student_repository as _student_repository_model  # noqa: F401
from app.models import password_reset_token as _password_reset_token_model  # noqa: F401
from app.models import git_auth as _git_auth_model  # noqa: F401
from app.models import repo_settings as _repo_settings_model  # noqa: F401


config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _sync_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def _has_psycopg2() -> bool:
    try:
        import psycopg2  # noqa: F401

        return True
    except ImportError:
        return False


def run_migrations_offline() -> None:
    url = _sync_database_url(settings.DATABASE_URL) if _has_psycopg2() else settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=False,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online_sync() -> None:
    from sqlalchemy import create_engine

    connectable = create_engine(
        _sync_database_url(settings.DATABASE_URL),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)


async def run_migrations_online_async() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine

    connectable = create_async_engine(settings.DATABASE_URL, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    if _has_psycopg2():
        run_migrations_online_sync()
    else:
        asyncio.run(run_migrations_online_async())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
