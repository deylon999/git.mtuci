"""Inline permission checks for routes that cannot use @require_permission alone."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_user_permissions
from app.models.user import User, UserRole


def _deny(permission_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission denied: {permission_id} required",
    )


async def ensure_permission(
    user: User,
    session: AsyncSession,
    permission_id: str,
) -> None:
    perms = await get_user_permissions(user, session)
    if permission_id not in perms:
        raise _deny(permission_id)


async def ensure_any_permission(
    user: User,
    session: AsyncSession,
    *permission_ids: str,
) -> None:
    perms = await get_user_permissions(user, session)
    if not any(pid in perms for pid in permission_ids):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: one of {', '.join(permission_ids)} required",
        )


async def ensure_repo_content_access(
    user: User,
    session: AsyncSession,
    *,
    target_student_id: UUID | None = None,
) -> None:
    """View repository list/content. Cross-user student repos need repo_view_students."""
    await ensure_permission(user, session, "repo_view")
    if target_student_id is not None and target_student_id != user.id:
        if user.role in {UserRole.teacher, UserRole.laborant}:
            await ensure_permission(user, session, "repo_view_students")


async def ensure_assignment_read(
    user: User,
    session: AsyncSession,
) -> None:
    await ensure_permission(user, session, "assignment_view")


async def ensure_grade_view(
    user: User,
    session: AsyncSession,
) -> None:
    await ensure_permission(user, session, "grade_view_groups")


async def ensure_lab_workflow(
    user: User,
    session: AsyncSession,
) -> None:
    await ensure_permission(user, session, "lab_accept")
