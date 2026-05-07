"""
Permission service with audit logging
"""
from __future__ import annotations

import json
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.permission_audit import PermissionAudit

# Re-export permission functions from core.permissions (single source of truth)
from app.core.permissions import (
    get_user_permissions as get_user_permissions_cached,
    invalidate_user_permissions_cache as invalidate_user_cache,
    invalidate_role_permissions_cache as invalidate_role_cache,
)


async def log_permission_change(
    session: AsyncSession,
    actor: User,
    target_role: UserRole,
    action: str,  # 'grant', 'revoke', 'reset', 'save_batch'
    permission_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Log a permission change to audit table."""
    audit = PermissionAudit(
        actor_id=actor.id,
        actor_role=actor.role.value,
        target_role=target_role.value,
        action=action,
        permission_id=permission_id,
        details=json.dumps(details) if details else None,
        created_at=datetime.now(timezone.utc),
    )
    session.add(audit)


async def get_audit_logs(
    session: AsyncSession,
    target_role: Optional[UserRole] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[PermissionAudit]:
    """Get permission audit logs."""
    query = select(PermissionAudit).order_by(PermissionAudit.created_at.desc())
    
    if target_role:
        query = query.where(PermissionAudit.target_role == target_role.value)
    
    query = query.limit(limit).offset(offset)
    result = await session.execute(query)
    return list(result.scalars().all())
