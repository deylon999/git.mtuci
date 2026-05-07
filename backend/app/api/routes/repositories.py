import os
import asyncio
import base64
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import require_permission
from app.models.repository import Repository, RepositoryType
from app.models.system_log import LogLevel, LogSource
from app.models.user import User
from app.schemas.repository import (
    RepositoryCreateRequest,
    RepositoryRead,
    RepositoryUpdateRequest,
)
from app.services.activity_service import log_repo_created, log_repo_deleted
from app.services.logging_service import log_info, log_warning, log_event_background

router = APIRouter(tags=["repositories"])

GITEA_URL = os.getenv("GITEA_URL", "http://gitea:3000")
GITEA_TOKEN = os.getenv("GITEA_TOKEN", "")
GITEA_ADMIN = os.getenv("GITEA_ADMIN_USERNAME", "gitea_admin")
GITEA_ADMIN_PASSWORD = os.getenv("GITEA_ADMIN_PASSWORD", "admin12345")


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
            f"{GITEA_URL}/api/v1/users/{owner_username}",
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
            f"{GITEA_URL}/api/v1/admin/users/{owner_username}/repos",
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
            f"{GITEA_URL}/api/v1/repos/{owner}/{repo_name}/hooks",
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
            f"{GITEA_URL}/api/v1/repos/{owner}/{repo_name}/hooks",
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
            f"{GITEA_URL}/api/v1/repos/{owner}/{repo_name}",
            headers=auth_headers,
        )
        # Ignore 404 errors (repo might not exist)
        if response.status_code not in (204, 404):
            print(f"Warning: Failed to delete Gitea repo: {response.status_code}")


@router.get("/my", response_model=list[RepositoryRead])
async def list_my_repositories(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all repositories owned by the current user."""
    result = await session.execute(
        select(Repository).where(Repository.owner_id == current_user.id).order_by(Repository.created_at.desc())
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

        # Create repository in Gitea (optional)
        clone_url = None
        gitea_repo_name = None
        gitea_success = False
        try:
            # Log all user attributes for debugging
            logger.info(f"User object: id={current_user.id}, email={current_user.email}, full_name={current_user.full_name}")
            
            # Use email prefix or user id as username
            if current_user.email and "@" in current_user.email:
                owner_username = current_user.email.split("@")[0]
            else:
                # Fallback: use user id first 8 chars
                owner_username = str(current_user.id)[:8]
            
            logger.info(f"Owner username extracted: {owner_username}")
            gitea_repo = await create_gitea_repository(
                name=payload.name,
                description=payload.description,
                owner_username=owner_username,
            )
            # Build clone URL
            clone_url = gitea_repo.get("clone_url") or f"{GITEA_URL}/{owner_username}/{payload.name}.git"
            gitea_repo_name = gitea_repo.get("name") or payload.name
            gitea_success = True
            logger.info(f"Gitea repo created successfully: {clone_url}")
            
            # Create webhook for automatic activity tracking
            await create_gitea_webhook(owner=owner_username, repo_name=payload.name)
        except Exception as e:
            # Log but don't fail - create repo in DB only
            logger.warning(f"Gitea repo creation failed (will create in DB only): {e}")

        repository = Repository(
            name=payload.name,
            description=payload.description,
            gitea_repo_name=gitea_repo_name,
            clone_url=clone_url,
            owner_id=current_user.id,
        )
        session.add(repository)
        await session.commit()
        await session.refresh(repository)

        # Log repository creation in system logs (background)
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

        if not gitea_success:
            asyncio.create_task(log_event_background(
                level=LogLevel.WARNING,
                source=LogSource.repositories,
                message=f"Repository created in DB but Gitea creation failed: {payload.name}",
                ip_address=ip_address,
                user_id=current_user.id,
                user_email=current_user.email,
                user_full_name=current_user.full_name,
            ))

        # Log repository creation activity
        await log_repo_created(
            session=session,
            user_id=current_user.id,
            repo_name=repository.name,
            ip_address=None,
        )

        return RepositoryRead.model_validate(repository)
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


@router.get("/{repository_id}", response_model=RepositoryRead)
async def get_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific repository by ID."""
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
    return RepositoryRead.model_validate(repository)


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

    repository.updated_at = datetime.now(timezone.utc)
    session.add(repository)
    await session.commit()
    await session.refresh(repository)
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

    # Delete from Gitea first
    owner_username = current_user.email.split("@")[0]
    await delete_gitea_repository(owner_username, repository.gitea_repo_name or repository.name)

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
