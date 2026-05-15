"""
Service for logging user activity across the platform.
Provides functions to track commits, pushes, PRs, logins, and other events.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType


async def log_activity(
    session: AsyncSession,
    user_id: Optional[UUID],
    activity_type: ActivityType,
    repo_name: Optional[str] = None,
    message: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """
    Log a user activity event.

    Args:
        session: Database session
        user_id: ID of the user performing the action
        activity_type: Type of activity (commit, push, login, etc.)
        repo_name: Optional repository name for repo-related activities
        message: Optional description or commit message
        ip_address: Optional IP address of the user
        user_agent: Optional user agent string
        user_login: Optional username from external source (e.g., Gitea) if user not in DB

    Returns:
        The created ActivityLog entry
    """
    log_entry = ActivityLog(
        user_id=user_id,
        user_login=user_login,
        activity_type=activity_type,
        repo_name=repo_name,
        message=message,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=datetime.now(timezone.utc),
    )

    session.add(log_entry)
    await session.commit()
    await session.refresh(log_entry)

    return log_entry


async def log_commit(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    commit_message: str,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a commit activity."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.commit,
        repo_name=repo_name,
        message=commit_message,
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_push(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    commit_count: int = 1,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a push activity."""
    message = f"{commit_count} commit" + ("s" if commit_count > 1 else "")
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.push,
        repo_name=repo_name,
        message=message,
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_pull_request(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    pr_title: str,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a pull request creation."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.pull_request,
        repo_name=repo_name,
        message=pr_title,
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_pr_merge(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    pr_number: int,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a PR merge."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.pr_merge,
        repo_name=repo_name,
        message=f"PR #{pr_number} merged",
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_pr_comment(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    pr_number: int,
    comment_body: str,
    *,
    commenter_login: str | None = None,
    ip_address: Optional[str] = None,
) -> ActivityLog:
    """Log a comment on a pull request (from Gitea issue_comment webhook)."""
    preview = (comment_body or "").strip().replace("\n", " ")[:200]
    by = f" от {commenter_login}" if commenter_login else ""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.pr_comment,
        repo_name=repo_name,
        message=f"PR #{pr_number}{by}: {preview}",
        ip_address=ip_address,
        user_login=commenter_login,
    )


async def log_fork(
    session: AsyncSession,
    user_id: UUID,
    source_repo: str,
    forked_repo: str,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a repository fork."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.fork,
        repo_name=source_repo,
        message=f"→ {forked_repo}",
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_repo_created(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a repository creation."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.repo_created,
        repo_name=repo_name,
        message="Repository created",
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_repo_deleted(
    session: AsyncSession,
    user_id: UUID,
    repo_name: str,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a repository deletion."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.repo_deleted,
        repo_name=repo_name,
        message="Repository deleted",
        ip_address=ip_address,
        user_login=user_login,
    )


async def log_login(
    session: AsyncSession,
    user_id: UUID,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a user login."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.login,
        ip_address=ip_address,
        user_agent=user_agent,
        user_login=user_login,
    )


async def log_logout(
    session: AsyncSession,
    user_id: UUID,
    ip_address: Optional[str] = None,
    user_login: Optional[str] = None,
) -> ActivityLog:
    """Log a user logout."""
    return await log_activity(
        session=session,
        user_id=user_id,
        activity_type=ActivityType.logout,
        ip_address=ip_address,
        user_login=user_login,
    )
