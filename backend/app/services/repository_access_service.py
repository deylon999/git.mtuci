from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_permissions
from app.models.repository import Repository
from app.models.user import User, UserRole

REPOSITORY_BLOCKED_MESSAGE = (
    "Репозиторий заблокирован администратором. Доступ к нему закрыт."
)


class RepositoryBlockedError(Exception):
    """Raised when a non-privileged user tries to use a blocked repository."""


async def user_can_bypass_repository_block(user: User, session: AsyncSession) -> bool:
    if user.role == UserRole.admin:
        return True
    perms = await get_user_permissions(user, session)
    return "repo_edit" in perms or "repo_delete" in perms


def repository_not_blocked_clause() -> ColumnElement[bool]:
    return Repository.is_blocked.is_(False)


async def ensure_repository_accessible(
    repo: Repository,
    user: User,
    session: AsyncSession,
) -> None:
    if not repo.is_blocked:
        return
    if await user_can_bypass_repository_block(user, session):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=REPOSITORY_BLOCKED_MESSAGE,
    )


def ensure_repository_accessible_sync(repo: Repository, user: User) -> None:
    """Use when session is unavailable; only role-based bypass (admin)."""
    if not repo.is_blocked:
        return
    if user.role == UserRole.admin:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=REPOSITORY_BLOCKED_MESSAGE,
    )


def raise_if_repository_blocked(repo: Repository) -> None:
    if repo.is_blocked:
        raise RepositoryBlockedError(REPOSITORY_BLOCKED_MESSAGE)

