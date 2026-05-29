import os
import asyncio
import base64
import re
from datetime import datetime, timezone
from urllib.parse import quote
from urllib.parse import urlparse
from typing import List, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import require_permission
from app.core.permission_checks import ensure_repo_content_access
from app.models.repository import Repository, RepositoryType
from app.models.system_log import LogLevel, LogSource
from app.models.user import User
from app.data.repo_create_templates import (
    GITIGNORE_OPTIONS,
    LICENSE_OPTIONS,
    VALID_GITIGNORE_IDS,
    VALID_LICENSE_IDS,
    resolve_gitea_license_key,
)
from app.schemas.repository import (
    RepositoryCreateRequest,
    RepositoryCreateTemplatesRead,
    RepositoryCreateTemplateOption,
    RepositoryGithubImportRequest,
    RepositoryRead,
    RepositoryUpdateRequest,
)
from app.services.repo_init_service import create_personal_repository_in_gitea
from app.services.activity_service import log_repo_created, log_repo_deleted
from app.services.gitea_service import (
    build_clone_url,
    ensure_repo_webhook,
    get_repo_metadata,
    migrate_repository_for_owner,
    resolve_repo_owner,
)
from app.services.repository_access_service import (
    ensure_repository_accessible,
    repository_not_blocked_clause,
)
from app.services.repository_presenter import build_repository_read
from app.services.logging_service import log_info, log_warning, log_event_background
from app.utils.gitea_user import gitea_owner_path, resolve_gitea_username

router = APIRouter(tags=["repositories"])

GITEA_URL = os.getenv("GITEA_URL", "http://gitea:3000")
GITEA_TOKEN = os.getenv("GITEA_TOKEN", "")
GITEA_ADMIN = os.getenv("GITEA_ADMIN_USERNAME", "gitea_admin")
GITEA_ADMIN_PASSWORD = os.getenv("GITEA_ADMIN_PASSWORD", "admin12345")


def _parse_github_repo_url(raw_url: str) -> tuple[str, str]:
    parsed = urlparse(raw_url.strip())
    host = (parsed.hostname or "").lower()
    if host not in {"github.com", "www.github.com"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only github.com repository URLs are supported",
        )
    parts = [p for p in (parsed.path or "").split("/") if p]
    if len(parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repository URL",
        )
    owner = parts[0].strip()
    repo = parts[1].strip()
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not owner or not repo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repository URL",
        )
    return owner, repo


def get_gitea_auth_headers() -> dict[str, str]:
    """Возвращает заголовки авторизации для Gitea API."""
    if GITEA_TOKEN:
        return {"Authorization": f"token {GITEA_TOKEN}"}

    # Basic auth с admin credentials
    credentials = f"{GITEA_ADMIN}:{GITEA_ADMIN_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def create_gitea_repository(name: str, description: Optional[str], owner_username: str) -> dict:
    """Create a repository in Gitea via API."""
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"GITEA_TOKEN present: {bool(GITEA_TOKEN)}")
    logger.info(f"GITEA_URL: {GITEA_URL}")

    auth_headers = get_gitea_auth_headers()

    async with httpx.AsyncClient() as client:
        # First check if we can access Gitea at all
        try:
            health_check = await client.get(f"{GITEA_URL}/api/v1/version", timeout=5.0)
            logger.info(f"Gitea health check: {health_check.status_code}")
        except Exception as e:
            logger.error(f"Gitea health check failed: {e}")

        # Check if user exists in Gitea
        user_check = await client.get(
            f"{GITEA_URL}/api/v1/users/{gitea_owner_path(owner_username)}",
            headers=auth_headers,
            timeout=5.0,
        )
        logger.info(f"User check for {owner_username}: {user_check.status_code}")

        if user_check.status_code == 404:
            # Create user in Gitea via admin API
            logger.info(f"Creating user {owner_username} in Gitea")
            create_user_resp = await client.post(
                f"{GITEA_URL}/api/v1/admin/users",
                headers={
                    **auth_headers,
                    "Content-Type": "application/json",
                },
                json={
                    "username": owner_username,
                    "email": f"{owner_username}@gitmtuci.lab",
                    "password": "changeme123",
                    "must_change_password": False,
                },
                timeout=10.0,
            )
            logger.info(f"Create user response: {create_user_resp.status_code} - {create_user_resp.text[:200]}")
            if create_user_resp.status_code not in (201, 200):
                logger.error(f"Failed to create user: {create_user_resp.text}")
        
        # Create repository for the user using admin API
        logger.info(f"Creating repo {name} for user {owner_username}")
        response = await client.post(
            f"{GITEA_URL}/api/v1/admin/users/{gitea_owner_path(owner_username)}/repos",
            headers={
                **auth_headers,
                "Content-Type": "application/json",
            },
            json={
                "name": name,
                "description": description or "",
                "private": False,
                "auto_init": True,
                "default_branch": "main",
            },
            timeout=10.0,
        )
        
        logger.info(f"Create repo response: {response.status_code} - {response.text[:500]}")

        if response.status_code != 201:
            try:
                error_detail = response.json()
            except:
                error_detail = response.text
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create repository in Gitea: {error_detail}",
            )

        return response.json()


async def create_gitea_webhook(owner: str, repo_name: str) -> None:
    """Create webhook in Gitea repository to notify backend about events."""
    import logging
    logger = logging.getLogger(__name__)

    auth_headers = get_gitea_auth_headers()

    # URL для webhook - используем имя сервиса api из docker-compose
    webhook_url = os.getenv("WEBHOOK_BASE_URL", "http://api:8000/webhooks")
    secret = os.getenv("GITEA_WEBHOOK_SECRET", "")

    async with httpx.AsyncClient() as client:
        # Check if webhook already exists
        hooks_response = await client.get(
            f"{GITEA_URL}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}/hooks",
            headers=auth_headers,
            timeout=10.0,
        )
        
        if hooks_response.status_code == 200:
            hooks = hooks_response.json()
            for hook in hooks:
                if hook.get("config", {}).get("url") == f"{webhook_url}/gitea/push":
                    logger.info(f"Webhook already exists for {owner}/{repo_name}")
                    return
        
        # Create webhook for push events
        logger.info(f"Creating webhook for {owner}/{repo_name} -> {webhook_url}/gitea/push")
        response = await client.post(
            f"{GITEA_URL}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}/hooks",
            headers=auth_headers,
            json={
                "type": "gitea",
                "config": {
                    "url": f"{webhook_url}/gitea/push",
                    "content_type": "json",
                    "secret": secret,
                },
                "events": ["push"],
                "active": True,
            },
            timeout=10.0,
        )
        
        if response.status_code in (201, 200):
            logger.info(f"Webhook created successfully for {owner}/{repo_name}")
        else:
            logger.warning(f"Failed to create webhook: {response.status_code} - {response.text[:200]}")


async def delete_gitea_repository(owner: str, repo_name: str) -> None:
    """Delete a repository in Gitea via API."""
    auth_headers = get_gitea_auth_headers()

    async with httpx.AsyncClient() as client:
        response = await client.delete(
            f"{GITEA_URL}/api/v1/repos/{gitea_owner_path(owner)}/{quote(repo_name, safe='')}",
            headers=auth_headers,
        )
        # Ignore 404 errors (repo might not exist)
        if response.status_code not in (204, 404):
            print(f"Warning: Failed to delete Gitea repo: {response.status_code}")


@router.get("/create-templates", response_model=RepositoryCreateTemplatesRead)
async def get_repository_create_templates(
    current_user: User = Depends(get_current_user),
) -> RepositoryCreateTemplatesRead:
    """Options for README / .gitignore / license when creating a repository."""
    return RepositoryCreateTemplatesRead(
        gitignores=[RepositoryCreateTemplateOption(**o) for o in GITIGNORE_OPTIONS],
        licenses=[RepositoryCreateTemplateOption(**o) for o in LICENSE_OPTIONS],
    )


@router.get("/my", response_model=list[RepositoryRead])
async def list_my_repositories(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all repositories owned by the current user."""
    await ensure_repo_content_access(current_user, session, target_student_id=current_user.id)
    result = await session.execute(
        select(Repository)
        .where(
            Repository.owner_id == current_user.id,
            repository_not_blocked_clause(),
        )
        .order_by(Repository.created_at.desc())
    )
    repositories = result.scalars().all()
    return [RepositoryRead.model_validate(repo) for repo in repositories]


@router.post("/", response_model=RepositoryRead, status_code=status.HTTP_201_CREATED)
@require_permission("repo_create")
async def create_repository(
    payload: RepositoryCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new repository."""
    import logging
    logger = logging.getLogger(__name__)
    ip_address = get_client_ip(request)
    
    try:
        logger.info(f"Creating repository for user {current_user.id}, email: {current_user.email}")
        
        # Check if repository with same name exists for this user
        result = await session.execute(
            select(Repository).where(
                Repository.owner_id == current_user.id,
                Repository.name == payload.name,
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository with this name already exists",
            )

        gitignore = (payload.gitignore_template or "").strip() or None
        license_tpl = (payload.license_template or "").strip() or None
        if gitignore and gitignore not in VALID_GITIGNORE_IDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown gitignore template",
            )
        if license_tpl and resolve_gitea_license_key(license_tpl) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown license template",
            )
        license_tpl = resolve_gitea_license_key(license_tpl) or None

        is_private = payload.visibility == "private"
        repo_type = payload.repo_type or (
            RepositoryType.private if is_private else RepositoryType.public
        )

        owner_username = resolve_gitea_username(current_user)
        gitea_repo_name: str | None = None
        clone_url: str | None = None
        try:
            logger.info(f"Creating Gitea repo for {owner_username}: {payload.name}")
            gitea_repo = await create_personal_repository_in_gitea(
                owner_username=owner_username,
                name=payload.name,
                description=payload.description,
                private=is_private,
                add_readme=payload.add_readme,
                gitignore_template=gitignore,
                license_template=license_tpl,
            )
            gitea_repo_name = gitea_repo.get("name") or payload.name
            actual_owner = await resolve_repo_owner(
                primary_owner=owner_username,
                repo_name=gitea_repo_name,
            )
            meta = await get_repo_metadata(owner=actual_owner, repo=gitea_repo_name)
            if not meta:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Gitea не подтвердил создание репозитория. Проверьте логи API и Gitea.",
                )
            clone_url = build_clone_url(actual_owner, gitea_repo_name)
            logger.info(f"Gitea repo created successfully: {clone_url}")
            await ensure_repo_webhook(owner=actual_owner, repo_name=gitea_repo_name)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Gitea repo creation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Не удалось создать репозиторий в Gitea. "
                    "Проверьте GITEA_URL, GITEA_ADMIN_USERNAME и GITEA_ADMIN_PASSWORD в .env."
                ),
            ) from e

        repository = Repository(
            name=payload.name,
            description=payload.description,
            gitea_repo_name=gitea_repo_name,
            clone_url=clone_url,
            owner_id=current_user.id,
            repo_type=repo_type,
        )
        session.add(repository)
        await session.commit()
        await session.refresh(repository)

        asyncio.create_task(log_event_background(
            level=LogLevel.INFO,
            source=LogSource.repositories,
            message=f"Created repository: {payload.name}",
            ip_address=ip_address,
            user_id=current_user.id,
            user_email=current_user.email,
            user_full_name=current_user.full_name,
            http_status=201,
        ))

        # Log repository creation activity
        await log_repo_created(
            session=session,
            user_id=current_user.id,
            repo_name=repository.name,
            ip_address=None,
        )

        return await build_repository_read(repository, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating repository: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create repository: {str(e)}",
        )


@router.post("/import/github", response_model=RepositoryRead, status_code=status.HTTP_201_CREATED)
@require_permission("repo_create")
async def import_github_repository(
    payload: RepositoryGithubImportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ip_address = get_client_ip(request)
    source_url = (payload.github_url or "").strip()
    _, source_repo = _parse_github_repo_url(source_url)

    target_name = (payload.name or "").strip() or source_repo
    if not target_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository name is required",
        )
    if not re.match(r"^[a-zA-Z0-9._-]+$", target_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid repository name. Use letters, numbers, dot, underscore, hyphen",
        )

    duplicate = await session.execute(
        select(Repository).where(
            Repository.owner_id == current_user.id,
            Repository.name == target_name,
        )
    )
    if duplicate.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository with this name already exists",
        )

    owner_username = resolve_gitea_username(current_user)
    private = payload.visibility == "private"
    try:
        imported = await migrate_repository_for_owner(
            owner_username=owner_username,
            source_url=source_url,
            repo_name=target_name,
            private=private,
            description=payload.description,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to import repository from GitHub: {str(exc)}",
        ) from exc

    gitea_repo_name = str(imported.get("name") or target_name)
    actual_owner = await resolve_repo_owner(
        primary_owner=owner_username,
        repo_name=gitea_repo_name,
    )
    clone_url = build_clone_url(actual_owner, gitea_repo_name)
    await ensure_repo_webhook(owner=actual_owner, repo_name=gitea_repo_name)

    repository = Repository(
        name=target_name,
        description=payload.description,
        gitea_repo_name=gitea_repo_name,
        clone_url=clone_url,
        owner_id=current_user.id,
        repo_type=RepositoryType.private if private else RepositoryType.public,
    )
    session.add(repository)
    await session.commit()
    await session.refresh(repository)

    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.repositories,
        message=f"Imported GitHub repository: {source_url} -> {target_name}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=201,
    ))
    await log_repo_created(
        session=session,
        user_id=current_user.id,
        repo_name=repository.name,
        ip_address=None,
    )
    return await build_repository_read(repository, current_user)


# NOTE: Keep static routes ABOVE "/{repository_id}" to avoid them being swallowed
# by the dynamic UUID route (Starlette matches by declaration order).


@router.get("/all", response_model=list[RepositoryRead])
@require_permission("repo_view")
async def list_all_repositories(
    repo_type: RepositoryType | None = Query(None, description="Filter by repository type"),
    language: str | None = Query(None, description="Filter by programming language"),
    faculty_id: UUID | None = Query(None, description="Filter by faculty"),
    is_blocked: bool | None = Query(None, description="Filter by blocked status"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RepositoryRead]:
    """Get all repositories with optional filters and pagination (admin/teacher only)."""
    # Build query with filters
    query = select(Repository, User.full_name.label("owner_name")).join(
        User, Repository.owner_id == User.id
    )
    
    if repo_type:
        query = query.where(Repository.repo_type == repo_type)
    if language:
        query = query.where(Repository.language == language)
    if faculty_id:
        query = query.where(Repository.faculty_id == faculty_id)
    if is_blocked is not None:
        query = query.where(Repository.is_blocked == is_blocked)
    
    # Order by created_at desc and apply pagination
    query = query.order_by(Repository.created_at.desc()).offset(skip).limit(limit)
    
    result = await session.execute(query)
    repos_with_owners = result.all()
    
    # Convert to RepositoryRead with owner_full_name
    repositories = []
    for repo, owner_name in repos_with_owners:
        repo_dict = {
            "id": repo.id,
            "name": repo.name,
            "description": repo.description,
            "gitea_repo_name": repo.gitea_repo_name,
            "clone_url": repo.clone_url,
            "owner_id": repo.owner_id,
            "owner_full_name": owner_name,
            "commits_count": 0,  # Can be populated from Gitea if needed
            "is_public": repo.repo_type == RepositoryType.public,
            "repo_type": repo.repo_type,
            "language": repo.language,
            "is_blocked": repo.is_blocked,
            "faculty_id": repo.faculty_id,
            "created_at": repo.created_at,
            "updated_at": repo.updated_at,
        }
        repositories.append(RepositoryRead.model_validate(repo_dict))
    
    return repositories


@router.get("/stats", response_model=dict)
@require_permission("repo_view")
async def get_repository_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get repository statistics (admin/teacher only)."""
    # Total count
    total_result = await session.execute(select(func.count(Repository.id)))
    total = total_result.scalar() or 0
    
    # Count by type
    type_counts = {}
    for repo_type in RepositoryType:
        count_result = await session.execute(
            select(func.count(Repository.id)).where(Repository.repo_type == repo_type)
        )
        type_counts[repo_type.value] = count_result.scalar() or 0
    
    # Blocked count
    blocked_result = await session.execute(
        select(func.count(Repository.id)).where(Repository.is_blocked == True)
    )
    blocked = blocked_result.scalar() or 0
    
    return {
        "total": total,
        "by_type": type_counts,
        "blocked": blocked,
    }


@router.get("/{repository_id}", response_model=RepositoryRead)
async def get_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific repository by ID."""
    await ensure_repo_content_access(current_user, session, target_student_id=current_user.id)
    result = await session.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == current_user.id,
        )
    )
    repository = result.scalar_one_or_none()
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )
    await ensure_repository_accessible(repository, current_user, session)
    return await build_repository_read(repository, current_user)


@router.patch("/{repository_id}", response_model=RepositoryRead)
@require_permission("repo_create")
async def update_repository(
    repository_id: UUID,
    payload: RepositoryUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a repository."""
    result = await session.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == current_user.id,
        )
    )
    repository = result.scalar_one_or_none()
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )
    await ensure_repository_accessible(repository, current_user, session)

    # Block any edits for blocked repositories (view-only).
    if repository.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Репозиторий заблокирован администратором. Доступно только чтение.",
        )

    old_repo_name = repository.gitea_repo_name or repository.name
    old_description = repository.description or ""
    old_private = repository.repo_type == RepositoryType.private

    # Check name uniqueness if name is being updated
    if payload.name and payload.name != repository.name:
        existing = await session.execute(
            select(Repository).where(
                Repository.owner_id == current_user.id,
                Repository.name == payload.name,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository with this name already exists",
            )
        repository.name = payload.name

    if payload.description is not None:
        repository.description = payload.description

    if payload.repo_type is not None:
        repository.repo_type = payload.repo_type

    repository.updated_at = datetime.now(timezone.utc)
    session.add(repository)
    await session.commit()
    await session.refresh(repository)

    # Best-effort sync settings to Gitea (description / private / name)
    try:
        owner_username = resolve_gitea_username(current_user)
        actual_owner = await resolve_repo_owner(primary_owner=owner_username, repo_name=old_repo_name)
        from app.services.gitea_service import update_repository_settings, get_repo_metadata

        new_private = repository.repo_type == RepositoryType.private
        new_description = repository.description or ""
        new_name = (payload.name or "").strip() or None

        await update_repository_settings(
            owner=actual_owner,
            repo=old_repo_name,
            name=new_name if new_name and new_name != old_repo_name else None,
            description=new_description if new_description != old_description else None,
            private=new_private if new_private != old_private else None,
        )
        # If rename succeeded, refresh gitea_repo_name and clone_url
        if new_name and new_name != old_repo_name:
            meta = await get_repo_metadata(owner=actual_owner, repo=new_name)
            if meta:
                repository.gitea_repo_name = str(meta.get("name") or new_name)
                repository.clone_url = build_clone_url(actual_owner, repository.gitea_repo_name)
                session.add(repository)
                await session.commit()
                await session.refresh(repository)
    except Exception:
        # Do not fail the update if Gitea is temporarily unavailable.
        pass
    return RepositoryRead.model_validate(repository)


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("repo_delete")
async def delete_repository(
    repository_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a repository."""
    ip_address = get_client_ip(request)
    
    result = await session.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == current_user.id,
        )
    )
    repository = result.scalar_one_or_none()
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )
    await ensure_repository_accessible(repository, current_user, session)

    owner_username = resolve_gitea_username(current_user)
    repo_name = repository.gitea_repo_name or repository.name
    actual_owner = await resolve_repo_owner(
        primary_owner=owner_username,
        repo_name=repo_name,
    )
    await delete_gitea_repository(actual_owner, repo_name)

    repo_name = repository.name
    await session.delete(repository)
    await session.commit()

    # Log repository deletion in system logs (background)
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.repositories,
        message=f"Deleted repository: {repo_name}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=204,
    ))

    # Log repository deletion activity
    await log_repo_deleted(
        session=session,
        user_id=current_user.id,
        repo_name=repo_name,
        ip_address=None,
    )

    return None
