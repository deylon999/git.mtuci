from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository
from app.models.user import User
from app.services.activity_service import log_repo_deleted
from app.services.gitea_repo_cache import invalidate_gitea_repo_cache
from app.services.gitea_service import (
    delete_repository as delete_gitea_repository,
    resolve_repo_owner,
)
from app.utils.gitea_user import resolve_gitea_username


async def admin_delete_repository(
    session: AsyncSession,
    *,
    repository_id: UUID,
    actor: User,
) -> None:
    """Delete any platform repository and its Gitea project (admin)."""
    result = await session.execute(
        select(Repository).where(Repository.id == repository_id)
    )
    repository = result.scalar_one_or_none()
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    owner_user = await session.get(User, repository.owner_id) if repository.owner_id else None
    repo_name = (repository.gitea_repo_name or repository.name or "").strip()
    display_name = repository.name

    if repo_name and owner_user:
        primary_owner = resolve_gitea_username(owner_user)
        owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=repo_name)
        await delete_gitea_repository(owner=owner, repo_name=repo_name)
        invalidate_gitea_repo_cache(primary_owner=primary_owner, repo_name=repo_name)

    await log_repo_deleted(
        session=session,
        user_id=actor.id,
        repo_name=display_name,
        ip_address=None,
    )
    await session.delete(repository)
    await session.commit()
