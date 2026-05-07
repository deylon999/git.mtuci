"""
Permission system for role-based access control
"""
from __future__ import annotations

import time
from functools import wraps
from typing import Callable, Any
from uuid import UUID

from fastapi import HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.models.role_permissions import RolePermission


# Default permissions for each role (fallback if no custom permissions in DB)
DEFAULT_PERMISSIONS = {
    UserRole.admin: {
        "repo_view", "repo_view_students", "repo_create", "repo_delete", "repo_comment",
        "user_view", "user_edit", "user_delete", "group_manage",
        "assignment_view", "assignment_create", "grade_edit", "lab_accept", "grade_view_groups",
        "settings_view", "settings_edit", "logs_view", "repo_edit", "assignment_delete",
    },
    UserRole.teacher: {
        "repo_view", "repo_view_students", "repo_create", "repo_comment",
        "user_view", "user_edit", "group_manage",
        "assignment_view", "assignment_create", "grade_edit", "lab_accept", "grade_view_groups",
        "settings_view", "logs_view",
    },
    UserRole.laborant: {
        "repo_view", "repo_view_students", "repo_comment",
        "user_view", "assignment_view", "lab_accept", "grade_view_groups",
        "settings_view", "logs_view",
    },
    UserRole.student: {
        "repo_view", "repo_create", "user_view", "assignment_view", "settings_view",
    },
}


# Simple in-memory cache: {user_id: (permissions_set, timestamp)}
_perms_cache: dict[UUID, tuple[set[str], float]] = {}
CACHE_TTL_SECONDS = 60  # Cache permissions for 1 minute


async def get_user_permissions(
    user: User,
    session: AsyncSession,
) -> set[str]:
    """Get effective permissions for user (from DB or defaults) with caching."""
    now = time.time()
    
    # Check cache
    if user.id in _perms_cache:
        perms, timestamp = _perms_cache[user.id]
        if now - timestamp < CACHE_TTL_SECONDS:
            return perms
    
    # Get custom permissions from DB
    result = await session.execute(
        select(RolePermission)
        .where(RolePermission.role == user.role)
    )
    custom_perms = result.scalars().all()
    
    if custom_perms:
        perms = {p.permission_id for p in custom_perms if p.enabled}
    else:
        perms = DEFAULT_PERMISSIONS.get(user.role, set()).copy()
    
    # Update cache
    _perms_cache[user.id] = (perms, now)
    return perms


def invalidate_user_permissions_cache(user_id: UUID) -> None:
    """Invalidate permissions cache for a user."""
    _perms_cache.pop(user_id, None)


def invalidate_role_permissions_cache(role: UserRole) -> None:
    """Invalidate permissions cache for all users with a role."""
    _perms_cache.clear()  # Simplest approach - clear all


def require_permission(permission_id: str):
    """Decorator to require specific permission for endpoint.
    
    Usage:
        @router.post("/users")
        @require_permission("user_create")
        async def create_user(...):
            ...
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(
            *args,
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_session),
            **kwargs
        ):
            # Get user's effective permissions
            user_perms = await get_user_permissions(current_user, session)
            
            if permission_id not in user_perms:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: {permission_id} required",
                )
            
            return await func(*args, current_user=current_user, session=session, **kwargs)
        
        return wrapper
    return decorator


def require_any_permission(*permission_ids: str):
    """Decorator to require any of specified permissions.
    
    Usage:
        @router.get("/stats")
        @require_any_permission("logs_view", "settings_view")
        async def get_stats(...):
            ...
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(
            *args,
            current_user: User = Depends(get_current_user),
            session: AsyncSession = Depends(get_session),
            **kwargs
        ):
            user_perms = await get_user_permissions(current_user, session)
            
            if not any(p in user_perms for p in permission_ids):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: one of {permission_ids} required",
                )
            
            return await func(*args, current_user=current_user, session=session, **kwargs)
        
        return wrapper
    return decorator


def require_admin():
    """Decorator to require admin role."""
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(
            *args,
            current_user: User = Depends(get_current_user),
            **kwargs
        ):
            if current_user.role != UserRole.admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required",
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator
