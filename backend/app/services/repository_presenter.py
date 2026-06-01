"""Сборка RepositoryRead с корректными ссылками Gitea."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.models.repository import Repository, RepositoryType
from app.models.user import User
from app.schemas.repository import RepositoryRead
from app.services.gitea_service import (
    build_clone_url,
    build_repo_web_url,
    get_repo_metadata,
    resolve_repo_owner,
)
from app.utils.gitea_user import resolve_gitea_username


async def build_repository_read(
    repo: Repository,
    owner_user: User | None,
    *,
    owner_full_name: str | None = None,
    commits_count: int = 0,
) -> RepositoryRead:
    gitea_repo_name = (repo.gitea_repo_name or repo.name or "").strip() or None
    gitea_owner: str | None = None
    gitea_web_url: str | None = None
    clone_url = repo.clone_url
    gitea_available = False
    effective_description = repo.description

    if gitea_repo_name and owner_user:
        primary_owner = resolve_gitea_username(owner_user)
        gitea_owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=gitea_repo_name)
        meta = await get_repo_metadata(owner=gitea_owner, repo=gitea_repo_name)
        if meta:
            gitea_available = True
            gitea_web_url = build_repo_web_url(gitea_owner, gitea_repo_name)
            clone_url = clone_url or build_clone_url(gitea_owner, gitea_repo_name)
            if not (effective_description or "").strip():
                meta_description = meta.get("description")
                if isinstance(meta_description, str) and meta_description.strip():
                    effective_description = meta_description.strip()

    owner_name = owner_full_name
    if owner_user and owner_user.full_name:
        owner_name = owner_user.full_name

    return RepositoryRead(
        id=repo.id,
        name=repo.name,
        description=effective_description,
        gitea_repo_name=gitea_repo_name,
        clone_url=clone_url,
        gitea_web_url=gitea_web_url,
        gitea_owner=gitea_owner,
        gitea_available=gitea_available,
        owner_id=repo.owner_id,
        owner_full_name=owner_name or gitea_owner or "Unknown",
        commits_count=commits_count,
        is_public=repo.repo_type == RepositoryType.public,
        repo_type=repo.repo_type,
        language=repo.language,
        is_blocked=repo.is_blocked,
        faculty_id=None,
        created_at=repo.created_at,
        updated_at=repo.updated_at,
        last_pushed_at=repo.last_pushed_at,
    )


def repository_read_from_dict(data: dict[str, Any]) -> RepositoryRead:
    return RepositoryRead.model_validate(data)
