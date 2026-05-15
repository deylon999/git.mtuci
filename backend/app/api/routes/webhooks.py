"""
Webhook endpoints for receiving events from external services (Gitea, etc.)
"""
import os
import hmac
import hashlib
import asyncio
from typing import Optional
from uuid import UUID
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_session
from app.models.user import User
from app.models.system_log import LogLevel, LogSource
from app.services.activity_service import (
    log_commit,
    log_push,
    log_repo_created,
    log_repo_deleted,
    log_pull_request,
    log_pr_merge,
    log_pr_comment,
    log_fork,
    log_login,
)
from app.services.notification_service import create_pr_comment_notification
from app.services.logging_service import log_event_background
from app.core.security import get_current_user
from app.api.routes.websocket import broadcast_new_activity, broadcast_stats_update

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Secret for webhook verification (should be set in environment)
WEBHOOK_SECRET = os.getenv("GITEA_WEBHOOK_SECRET", "")


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class GiteaCommit(BaseModel):
    """Gitea commit data."""
    id: str
    message: str
    timestamp: str
    url: str
    author: dict


class GiteaPushPayload(BaseModel):
    """Gitea push event payload."""
    ref: str
    before: str
    after: str
    compare_url: str
    commits: list[GiteaCommit]
    repository: dict
    pusher: dict
    sender: dict


class GiteaRepositoryPayload(BaseModel):
    """Gitea repository event payload."""
    action: str  # created, deleted
    repository: dict
    sender: dict


class GiteaPullRequestPayload(BaseModel):
    """Gitea pull request event payload."""
    action: str  # opened, closed, merged, reopened
    number: int
    pull_request: dict
    repository: dict
    sender: dict


class GiteaForkPayload(BaseModel):
    """Gitea fork event payload."""
    forkee: dict  # forked repository
    repository: dict  # original repository
    sender: dict


class GiteaUserPayload(BaseModel):
    """Gitea user event payload (login/logout)."""
    action: str  # login, logout
    user: dict


class GiteaIssueCommentPayload(BaseModel):
    """Gitea issue_comment event (includes PR review comments)."""
    action: str
    issue: dict
    comment: dict
    repository: dict
    sender: dict


def verify_webhook_signature(payload: bytes, signature: Optional[str]) -> bool:
    """Verify Gitea webhook signature using HMAC-SHA256."""
    logger = logging.getLogger(__name__)
    logger.warning(f"WEBHOOK_SECRET loaded: '{WEBHOOK_SECRET}'")
    logger.warning(f"Signature received: '{signature}'")
    
    if not WEBHOOK_SECRET or not signature:
        logger.warning("Skipping verification - secret or signature missing")
        return True  # Skip verification if secret not configured
    
    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    expected_full = f"sha256={expected}"
    
    # Gitea may send signature with or without sha256= prefix
    if signature.startswith("sha256="):
        match = hmac.compare_digest(expected_full, signature)
    else:
        match = hmac.compare_digest(expected, signature)
    
    logger.warning(f"Expected signature: '{expected_full}' or '{expected}'")
    logger.warning(f"Match: {match}")
    
    return match


@router.post("/gitea")
async def gitea_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Universal webhook endpoint for all Gitea events.
    Handles push, repository, fork, pull_request, and user events.
    """
    ip_address = get_client_ip(request)
    
    # Get event type from header
    event_type = request.headers.get("X-Gitea-Event", "push")
    logger = logging.getLogger(__name__)
    logger.info(f"Received Gitea webhook event: {event_type}")

    # Log webhook receipt
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.webhooks,
        message=f"Received Gitea webhook event: {event_type}",
        ip_address=ip_address,
    ))

    # Get signature from headers
    signature = request.headers.get("X-Gitea-Signature")

    # Read raw body for signature verification
    body = await request.body()

    if not verify_webhook_signature(body, signature):
        # Log failed signature verification
        asyncio.create_task(log_event_background(
            level=LogLevel.ERROR,
            source=LogSource.webhooks,
            message=f"Invalid webhook signature for event: {event_type}",
            ip_address=ip_address,
        ))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )

    # Route to appropriate handler based on event type
    if event_type == "push":
        return await handle_push_event(body, session, logger, ip_address)
    elif event_type == "repository":
        return await handle_repository_event(body, session, logger, ip_address)
    elif event_type == "fork":
        return await handle_fork_event(body, session, logger, ip_address)
    elif event_type == "pull_request":
        return await handle_pull_request_event(body, session, logger, ip_address)
    elif event_type == "issue_comment":
        return await handle_issue_comment_event(body, session, logger, ip_address)
    elif event_type in ("create", "delete"):
        return await handle_repository_event(body, session, logger, ip_address)
    else:
        logger.warning(f"Unhandled event type: {event_type}")
        asyncio.create_task(log_event_background(
            level=LogLevel.WARNING,
            source=LogSource.webhooks,
            message=f"Unhandled event type: {event_type}",
            ip_address=ip_address,
        ))
        return {"status": "ok", "message": f"Event type {event_type} not handled"}


async def handle_push_event(body: bytes, session: AsyncSession, logger: logging.Logger, ip_address: str = "unknown") -> dict:
    """Handle push events."""
    try:
        payload = GiteaPushPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Invalid push payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid push payload: {str(e)}"
        )
    
    # Extract info
    repo_name = payload.repository.get("full_name", "unknown")
    pusher_email = payload.pusher.get("email", "")
    commit_count = len(payload.commits)

    # Find user by email from Gitea
    user_id = None
    logger.info(f"Webhook received from pusher_email: {pusher_email}")
    if pusher_email:
        result = await session.execute(
            select(User.id).where(User.email == pusher_email)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row
            logger.info(f"Found user_id: {user_id} for email: {pusher_email}")
        else:
            logger.warning(f"No user found for email: {pusher_email}")
            # Try to find by mtuci_login - pusher username
            pusher_name = payload.pusher.get("username", "")
            logger.warning(f"Fallback search by pusher.username: '{pusher_name}', type={type(pusher_name)}")
            if pusher_name and pusher_name.strip():
                logger.warning(f"Executing query for mtuci_login='{pusher_name}'")
                result2 = await session.execute(
                    select(User.id).where(User.mtuci_login == pusher_name)
                )
                user_row2 = result2.scalar_one_or_none()
                logger.warning(f"Query result: user_row2={user_row2}")
                if user_row2:
                    user_id = user_row2
                    logger.info(f"Found user_id by mtuci_login: {user_id} for login: {pusher_name}")
                else:
                    logger.warning(f"No user with mtuci_login='{pusher_name}'")
            # Try sender login
            if not user_id:
                sender_name = payload.sender.get("login", "")
                logger.info(f"Fallback search by sender.login: '{sender_name}'")
                if sender_name:
                    result3 = await session.execute(
                        select(User.id).where(User.mtuci_login == sender_name)
                    )
                    user_row3 = result3.scalar_one_or_none()
                    if user_row3:
                        user_id = user_row3
                        logger.info(f"Found user_id by sender login: {user_id} for login: {sender_name}")
                    else:
                        logger.warning(f"No user with sender login='{sender_name}'")
    else:
        logger.warning("No pusher_email in webhook payload")

    if commit_count > 0:
        # Get username from Gitea for logging
        gitea_username = payload.pusher.get("username") or payload.sender.get("login")

        # Log push with commit count
        await log_push(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            commit_count=commit_count,
            ip_address=None,
            user_login=gitea_username if not user_id else None,
        )

        # Log individual commits
        for commit in payload.commits:
            await log_commit(
                session=session,
                user_id=user_id,
                repo_name=repo_name,
                commit_message=commit.message[:500],  # Truncate long messages
                ip_address=None,
                user_login=gitea_username if not user_id else None,
            )

    # Broadcast real-time update to connected clients
    if user_id:
        result = await session.execute(
            select(User.full_name).where(User.id == user_id)
        )
        user_name = result.scalar_one_or_none() or "Unknown"
    else:
        # Use name from Gitea if user not found in DB
        user_name = payload.pusher.get("username") or payload.sender.get("login") or "Unknown"

    await broadcast_new_activity(
        activity_type="push",
        user_name=user_name,
        repo_name=repo_name,
        message=f"{commit_count} commits",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
    await broadcast_stats_update()

    return {"status": "ok", "commits_logged": commit_count}


async def handle_repository_event(body: bytes, session: AsyncSession, logger: logging.Logger, ip_address: str = "unknown") -> dict:
    """Handle repository events (created, deleted)."""
    try:
        payload = GiteaRepositoryPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Invalid repository payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid repository payload: {str(e)}"
        )

    repo_name = payload.repository.get("full_name", "unknown")
    action = payload.action
    sender_name = payload.sender.get("login", "")
    gitea_repo_id = payload.repository.get("id")
    repo_description = payload.repository.get("description")
    clone_url = payload.repository.get("clone_url")
    is_private = payload.repository.get("private", False)
    repo_language = payload.repository.get("language")  # Gitea determines primary language

    # Try to find user by sender login
    user_id = None
    if sender_name:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == sender_name)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row

    from app.models.repository import Repository, RepositoryType

    if action == "created":
        # Sync repository to local database
        existing_repo = await session.execute(
            select(Repository).where(Repository.gitea_repo_id == gitea_repo_id)
        )
        if not existing_repo.scalar_one_or_none():
            new_repo = Repository(
                name=repo_name.split("/")[-1] if "/" in repo_name else repo_name,
                description=repo_description,
                gitea_repo_name=repo_name,
                gitea_repo_id=gitea_repo_id,
                clone_url=clone_url,
                owner_id=user_id,
                repo_type=RepositoryType.private if is_private else RepositoryType.public,
                language=repo_language,
            )
            session.add(new_repo)
            await session.commit()
            logger.info(f"Synced new repository from Gitea: {repo_name}")

        await log_repo_created(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            ip_address=None,
            user_login=sender_name if not user_id else None,
        )
        await broadcast_new_activity(
            activity_type="repository_created",
            user_name=sender_name or "Unknown",
            repo_name=repo_name,
            message="Repository created",
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    elif action == "deleted":
        # Remove from local database
        existing_repo = await session.execute(
            select(Repository).where(Repository.gitea_repo_id == gitea_repo_id)
        )
        repo = existing_repo.scalar_one_or_none()
        if repo:
            await session.delete(repo)
            await session.commit()
            logger.info(f"Deleted repository from local DB: {repo_name}")

        await log_repo_deleted(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            ip_address=None,
            user_login=sender_name if not user_id else None,
        )
        await broadcast_new_activity(
            activity_type="repository_deleted",
            user_name=sender_name or "Unknown",
            repo_name=repo_name,
            message="Repository deleted",
            timestamp=datetime.now(timezone.utc).isoformat()
        )

    await broadcast_stats_update()
    return {"status": "ok", "action": action}


async def handle_pull_request_event(body: bytes, session: AsyncSession, logger: logging.Logger, ip_address: str = "unknown") -> dict:
    """Handle pull request events (opened, closed, merged)."""
    try:
        payload = GiteaPullRequestPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Invalid pull request payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid pull request payload: {str(e)}"
        )

    repo_name = payload.repository.get("full_name", "unknown")
    action = payload.action
    pr_number = payload.number
    pr_title = payload.pull_request.get("title", "Untitled")

    # Find user by sender login
    user_id = None
    sender_name = payload.sender.get("login", "")
    if sender_name:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == sender_name)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row

    # Get user name for broadcast (use Gitea name if not found in DB)
    if user_id:
        result = await session.execute(
            select(User.full_name).where(User.id == user_id)
        )
        user_name = result.scalar_one_or_none() or sender_name or "Unknown"
    else:
        user_name = sender_name or "Unknown"

    if action == "opened":
        await log_pull_request(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            pr_title=pr_title,
            ip_address=None,
            user_login=sender_name if not user_id else None,
        )
        await broadcast_new_activity(
            activity_type="pull_request",
            user_name=user_name,
            repo_name=repo_name,
            message=f"PR #{pr_number}: {pr_title}",
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    elif action == "merged":
        await log_pr_merge(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            pr_number=pr_number,
            ip_address=None,
            user_login=sender_name if not user_id else None,
        )
        await broadcast_new_activity(
            activity_type="pr_merge",
            user_name=user_name,
            repo_name=repo_name,
            message=f"Merged PR #{pr_number}",
            timestamp=datetime.now(timezone.utc).isoformat()
        )

    await broadcast_stats_update()
    return {"status": "ok", "action": action, "pr_number": pr_number}


async def _user_id_by_mtuci_login(session: AsyncSession, login: str) -> Optional[UUID]:
    if not login:
        return None
    result = await session.execute(select(User.id).where(User.mtuci_login == login))
    return result.scalar_one_or_none()


async def _repo_owner_id_from_full_name(session: AsyncSession, full_name: str) -> Optional[UUID]:
    parts = full_name.split("/")
    if len(parts) != 2:
        return None
    owner_login, _repo = parts[0], parts[1]
    return await _user_id_by_mtuci_login(session, owner_login)


async def handle_issue_comment_event(
    body: bytes,
    session: AsyncSession,
    logger: logging.Logger,
    ip_address: str = "unknown",
) -> dict:
    """Handle comments on issues/PRs from Gitea."""
    try:
        payload = GiteaIssueCommentPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Invalid issue_comment payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid issue_comment payload: {str(e)}",
        )

    if payload.action not in ("created", "edited"):
        return {"status": "ok", "message": f"Action {payload.action} ignored"}

    issue = payload.issue or {}
    if not issue.get("pull_request"):
        return {"status": "ok", "message": "Not a pull request comment"}

    repo_name = payload.repository.get("full_name", "unknown")
    pr_number = int(issue.get("number", 0))
    comment_body = (payload.comment or {}).get("body", "") or ""
    sender_login = payload.sender.get("login", "") or (payload.comment or {}).get("user", {}).get("login", "")

    owner_id = await _repo_owner_id_from_full_name(session, repo_name)
    if not owner_id:
        logger.warning(f"Could not resolve repo owner for {repo_name}")
        return {"status": "ok", "message": "Owner not found"}

    sender_id = await _user_id_by_mtuci_login(session, sender_login)
    if sender_id == owner_id:
        return {"status": "ok", "message": "Self-comment ignored"}

    log_entry = await log_pr_comment(
        session=session,
        user_id=owner_id,
        repo_name=repo_name,
        pr_number=pr_number,
        comment_body=comment_body,
        commenter_login=sender_login or None,
        ip_address=ip_address,
    )
    await session.flush()

    await create_pr_comment_notification(
        session,
        user_id=owner_id,
        repo_name=repo_name,
        pr_number=pr_number,
        comment_preview=comment_body,
        activity_log_id=log_entry.id,
    )

    result = await session.execute(select(User.full_name).where(User.id == owner_id))
    owner_name = result.scalar_one_or_none() or "Unknown"

    await broadcast_new_activity(
        activity_type="pr_comment",
        user_name=owner_name,
        repo_name=repo_name,
        message=f"PR #{pr_number}: комментарий от {sender_login}",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    await broadcast_stats_update()

    return {"status": "ok", "pr_number": pr_number, "owner_id": str(owner_id)}


async def handle_fork_event(body: bytes, session: AsyncSession, logger: logging.Logger, ip_address: str = "unknown") -> dict:
    """Handle fork events."""
    try:
        payload = GiteaForkPayload.model_validate_json(body)
    except Exception as e:
        logger.error(f"Invalid fork payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid fork payload: {str(e)}"
        )

    source_repo = payload.repository.get("full_name", "unknown")
    forked_repo = payload.forkee.get("full_name", "unknown")

    # Find user by sender login
    user_id = None
    sender_name = payload.sender.get("login", "")
    if sender_name:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == sender_name)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row

    # Get user name for broadcast (use Gitea name if not found in DB)
    if user_id:
        result = await session.execute(
            select(User.full_name).where(User.id == user_id)
        )
        user_name = result.scalar_one_or_none() or sender_name or "Unknown"
    else:
        user_name = sender_name or "Unknown"

    await log_fork(
        session=session,
        user_id=user_id,
        source_repo=source_repo,
        forked_repo=forked_repo,
        ip_address=None,
        user_login=sender_name if not user_id else None,
    )

    await broadcast_new_activity(
        activity_type="fork",
        user_name=user_name,
        repo_name=source_repo,
        message=f"→ {forked_repo}",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
    await broadcast_stats_update()

    return {"status": "ok", "source": source_repo, "fork": forked_repo}


@router.post("/gitea/repository")
async def gitea_repository_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Receive repository events from Gitea (created, deleted).
    """
    signature = request.headers.get("X-Gitea-Signature")
    body = await request.body()
    
    if not verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
    
    try:
        payload = GiteaRepositoryPayload.model_validate_json(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload: {str(e)}"
        )
    
    repo_name = payload.repository.get("full_name", "unknown")
    action = payload.action
    
    if action == "created":
        await log_repo_created(
            session=session,
            user_id=None,
            repo_name=repo_name,
            ip_address=None,
        )
    elif action == "deleted":
        await log_repo_deleted(
            session=session,
            user_id=None,
            repo_name=repo_name,
            ip_address=None,
        )
    
    return {"status": "ok", "action": action}


@router.post("/gitea/pull_request")
async def gitea_pull_request_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Receive pull request events from Gitea (opened, closed, merged).
    """
    signature = request.headers.get("X-Gitea-Signature")
    body = await request.body()
    
    if not verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
    
    try:
        payload = GiteaPullRequestPayload.model_validate_json(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload: {str(e)}"
        )
    
    repo_name = payload.repository.get("full_name", "unknown")
    action = payload.action
    pr_number = payload.number
    pr_title = payload.pull_request.get("title", "Untitled")
    
    # Find user by sender login
    user_id = None
    sender_name = payload.sender.get("login", "")
    if sender_name:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == sender_name)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row
    
    if action == "opened":
        await log_pull_request(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            pr_title=pr_title,
            ip_address=None,
        )
        await broadcast_new_activity(
            activity_type="pull_request",
            user_name=sender_name or "Unknown",
            repo_name=repo_name,
            message=f"PR #{pr_number}: {pr_title}",
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    elif action == "merged":
        await log_pr_merge(
            session=session,
            user_id=user_id,
            repo_name=repo_name,
            pr_number=pr_number,
            ip_address=None,
        )
        await broadcast_new_activity(
            activity_type="pr_merge",
            user_name=sender_name or "Unknown",
            repo_name=repo_name,
            message=f"Merged PR #{pr_number}",
            timestamp=datetime.now(timezone.utc).isoformat()
        )
    
    await broadcast_stats_update()
    return {"status": "ok", "action": action, "pr_number": pr_number}


@router.post("/gitea/fork")
async def gitea_fork_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Receive fork events from Gitea.
    """
    signature = request.headers.get("X-Gitea-Signature")
    body = await request.body()
    
    if not verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
    
    try:
        payload = GiteaForkPayload.model_validate_json(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload: {str(e)}"
        )
    
    source_repo = payload.repository.get("full_name", "unknown")
    forked_repo = payload.forkee.get("full_name", "unknown")
    
    # Find user by sender login
    user_id = None
    sender_name = payload.sender.get("login", "")
    if sender_name:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == sender_name)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row
    
    await log_fork(
        session=session,
        user_id=user_id,
        source_repo=source_repo,
        forked_repo=forked_repo,
        ip_address=None,
    )
    
    await broadcast_new_activity(
        activity_type="fork",
        user_name=sender_name or "Unknown",
        repo_name=source_repo,
        message=f"→ {forked_repo}",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
    await broadcast_stats_update()
    
    return {"status": "ok", "source": source_repo, "fork": forked_repo}


@router.post("/gitea/user")
async def gitea_user_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Receive user events from Gitea (login, logout).
    Note: Gitea doesn't send these by default, but we can handle them if configured.
    """
    signature = request.headers.get("X-Gitea-Signature")
    body = await request.body()
    
    if not verify_webhook_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
    
    try:
        payload = GiteaUserPayload.model_validate_json(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payload: {str(e)}"
        )
    
    action = payload.action
    user_login = payload.user.get("login", "")
    
    # Find user by login
    user_id = None
    if user_login:
        result = await session.execute(
            select(User.id).where(User.mtuci_login == user_login)
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            user_id = user_row
    
    # Note: log_login/log_logout are available in activity_service but not imported yet
    # For now, just broadcast the event
    await broadcast_new_activity(
        activity_type=action,
        user_name=user_login or "Unknown",
        repo_name="",
        message=f"User {action}",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
    
    return {"status": "ok", "action": action, "user": user_login}


@router.get("/health")
async def webhook_health():
    """Health check for webhook endpoints."""
    return {
        "status": "ok",
        "webhook_secret_configured": bool(WEBHOOK_SECRET)
    }
