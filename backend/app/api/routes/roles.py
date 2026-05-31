"""
Roles and permissions API routes
"""
from typing import List, Optional
from datetime import datetime, timezone
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import (
    get_user_permissions,
    invalidate_role_permissions_cache,
)
from app.models.user import User, UserRole
from app.models.system_log import LogLevel, LogSource
from app.models.role_permissions import RolePermission, TrustedAssistant
from app.models.permission_audit import PermissionAudit
from app.services.permission_service import log_permission_change, get_audit_logs
from app.services.logging_service import log_event_background
from app.core.permission_catalog import (
    CATEGORY_NAMES,
    PERMISSION_DEFINITIONS,
    PERMISSION_TEMPLATES,
)

router = APIRouter(prefix="/roles", tags=["roles"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/my-permissions")
async def get_my_permissions(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    """Get current user's permissions."""
    perms = await get_user_permissions(current_user, session)
    return list(perms)


# Input models for permission updates
class PermissionInput(BaseModel):
    id: str
    enabled: bool

class CategoryInput(BaseModel):
    title: str
    permissions: List[PermissionInput]


# Role definitions with metadata
ROLE_DEFINITIONS = {
    "admin": {
        "name": "Администратор",
        "description": "Полный доступ ко всем функциям системы",
        "icon": "Shield",
        "icon_bg": "bg-yellow-500/20 text-yellow-400",
        "is_system": True,
    },
    "teacher": {
        "name": "Преподаватель",
        "description": "Управление курсами и оценками студентов",
        "icon": "Briefcase",
        "icon_bg": "bg-purple-500/20 text-purple-400",
        "is_system": True,
    },
    "laborant": {
        "name": "Лаборант",
        "description": "Проверка лабораторных работ, консультирование студентов и модерирование репозиториев по поручению преподавателя",
        "icon": "Microscope",
        "icon_bg": "bg-emerald-500/20 text-emerald-400",
        "is_system": False,
    },
    "student": {
        "name": "Студент",
        "description": "Доступ к курсам и сдача заданий",
        "icon": "User",
        "icon_bg": "bg-blue-500/20 text-blue-400",
        "is_system": False,
    },
}


@router.get("")
async def get_roles(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Get all roles with real user counts from database."""
    # Get user counts by role
    result = await session.execute(
        select(User.role, func.count(User.id))
        .group_by(User.role)
    )
    counts = {role.value: count for role, count in result.all()}
    
    roles = []
    for role_id, meta in ROLE_DEFINITIONS.items():
        roles.append({
            "id": role_id,
            "name": meta["name"],
            "description": meta["description"],
            "icon": meta["icon"],
            "icon_bg": meta["icon_bg"],
            "user_count": counts.get(role_id, 0),
            "is_system": meta["is_system"],
        })
    
    return roles


@router.get("/permissions")
async def get_role_permissions(
    role: UserRole,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Get permission categories for a specific role (with custom overrides from DB)."""
    if role.value not in PERMISSION_TEMPLATES:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Full matrix: unknown keys default off, then role template, then DB overrides
    template = {perm_id: False for perm_id in PERMISSION_DEFINITIONS}
    template.update(PERMISSION_TEMPLATES[role.value])
    
    # Load custom permissions from DB
    result = await session.execute(
        select(RolePermission)
        .where(RolePermission.role == role.value)
    )
    custom_perms = result.scalars().all()
    
    # Merge custom permissions with defaults
    for perm in custom_perms:
        template[perm.permission_id] = perm.enabled
    
    # Group permissions by category
    categories = {}
    for perm_id, enabled in template.items():
        perm_def = PERMISSION_DEFINITIONS.get(perm_id)
        if not perm_def:
            continue
        
        category = perm_def["category"]
        if category not in categories:
            categories[category] = {
                "title": CATEGORY_NAMES[category],
                "permissions": [],
            }
        
        categories[category]["permissions"].append({
            "id": perm_id,
            "name": perm_def["name"],
            "description": perm_def["description"],
            "level": perm_def["level"],
            "enabled": enabled,
        })
    
    return list(categories.values())


@router.get("/laborants")
async def get_laborants(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Get all laborants for teacher management with trusted status."""
    # Get all laborants
    result = await session.execute(
        select(User.id, User.full_name)
        .where(User.role == UserRole.laborant)
        .order_by(User.full_name)
    )
    
    # Get trusted laborants for current teacher
    trusted_result = await session.execute(
        select(TrustedAssistant.assistant_id)
        .where(TrustedAssistant.teacher_id == current_user.id)
    )
    trusted_ids = {str(row[0]) for row in trusted_result.all()}
    
    laborants = []
    for user_id, full_name in result.all():
        initials = "".join([n[0] for n in full_name.split()[:2]]).upper()
        laborants.append({
            "id": str(user_id),
            "name": full_name,
            "initials": initials,
            "trusted": str(user_id) in trusted_ids,
        })
    
    return laborants


@router.post("/permissions/{role}")
async def save_role_permissions(
    role: UserRole,
    request: Request,
    permissions: List[CategoryInput],
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Save permission changes for a role (admin only)."""
    ip_address = get_client_ip(request)
    
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Only admins can modify permissions")
    
    # Validate all permission IDs
    valid_perm_ids = set(PERMISSION_DEFINITIONS.keys())
    for category in permissions:
        for perm in category.permissions:
            if perm.id not in valid_perm_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid permission_id: {perm.id}. Valid permissions: {', '.join(sorted(valid_perm_ids))}"
                )

    # Collect changes for audit log
    changed_perms = []
    for category in permissions:
        for perm in category.permissions:
            changed_perms.append({"id": perm.id, "enabled": perm.enabled})
    
    # Delete existing custom permissions for this role
    await session.execute(
        delete(RolePermission)
        .where(RolePermission.role == role.value)
    )
    
    # Insert new permissions
    for category in permissions:
        for perm in category.permissions:
            db_perm = RolePermission(
                role=role.value,
                permission_id=perm.id,
                enabled=perm.enabled,
            )
            session.add(db_perm)
    
    # Log the change
    await log_permission_change(
        session=session,
        actor=current_user,
        target_role=role,
        action="save_batch",
        details={"permissions": changed_perms}
    )
    
    await session.commit()
    
    # Log permission change in system logs
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.permissions,
        message=f"Updated permissions for role: {role.value}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=200,
    ))
    
    # Invalidate cache so users pick up new permissions immediately
    invalidate_role_permissions_cache(role)
    
    return {"success": True, "message": f"Permissions updated for {role.value}"}


@router.post("/permissions/{role}/reset")
async def reset_role_permissions(
    role: UserRole,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Reset permissions to defaults for a role (admin only)."""
    ip_address = get_client_ip(request)
    
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Only admins can reset permissions")
    
    # Delete custom permissions for this role
    await session.execute(
        delete(RolePermission)
        .where(RolePermission.role == role.value)
    )
    
    # Log the reset
    await log_permission_change(
        session=session,
        actor=current_user,
        target_role=role,
        action="reset"
    )
    
    await session.commit()
    
    # Log permission reset in system logs
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.permissions,
        message=f"Reset permissions to defaults for role: {role.value}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=200,
    ))
    
    # Invalidate cache so users pick up default permissions immediately
    invalidate_role_permissions_cache(role)
    
    if role.value not in PERMISSION_TEMPLATES:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Return default permissions
    # Keep reset response shape consistent with GET /roles/permissions:
    # return full permission matrix where missing template keys are disabled.
    template = {perm_id: False for perm_id in PERMISSION_DEFINITIONS}
    template.update(PERMISSION_TEMPLATES[role.value])
    categories = {}
    for perm_id, enabled in template.items():
        perm_def = PERMISSION_DEFINITIONS.get(perm_id)
        if not perm_def:
            continue
        
        category = perm_def["category"]
        if category not in categories:
            categories[category] = {
                "title": CATEGORY_NAMES[category],
                "permissions": [],
            }
        
        categories[category]["permissions"].append({
            "id": perm_id,
            "name": perm_def["name"],
            "description": perm_def["description"],
            "level": perm_def["level"],
            "enabled": enabled,
        })
    
    return list(categories.values())


@router.post("/trusted")
async def trust_assistant(
    assistant_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Add a laborant to teacher's trusted assistants."""
    if current_user.role != UserRole.teacher:
        raise HTTPException(status_code=403, detail="Only teachers can manage trusted assistants")

    result = await session.execute(
        select(User).where(User.id == assistant_id, User.role == UserRole.laborant)
    )
    assistant = result.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found or not a laborant")

    existing = await session.execute(
        select(TrustedAssistant).where(
            TrustedAssistant.teacher_id == current_user.id,
            TrustedAssistant.assistant_id == assistant_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"success": True, "message": "Already trusted"}

    trusted = TrustedAssistant(
        teacher_id=current_user.id,
        assistant_id=assistant_id,
        can_grade=True,
    )
    session.add(trusted)
    await session.commit()
    return {"success": True, "message": f"Trusted {assistant.full_name}"}


@router.delete("/trusted/{assistant_id}")
async def untrust_assistant(
    assistant_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Remove a laborant from teacher's trusted assistants."""
    if current_user.role != UserRole.teacher:
        raise HTTPException(status_code=403, detail="Only teachers can manage trusted assistants")

    result = await session.execute(
        select(TrustedAssistant).where(
            TrustedAssistant.teacher_id == current_user.id,
            TrustedAssistant.assistant_id == assistant_id,
        )
    )
    trusted = result.scalar_one_or_none()
    if not trusted:
        raise HTTPException(status_code=404, detail="Trusted assistant record not found")

    await session.delete(trusted)
    await session.commit()
    return {"success": True, "message": "Removed from trusted assistants"}


@router.get("/audit-logs")
async def get_permission_audit_logs(
    target_role: UserRole | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Get permission audit logs (admin only)."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Only admins can view audit logs")
    
    logs = await get_audit_logs(session, target_role, limit, offset)
    
    # Get actor details
    actor_ids = [log.actor_id for log in logs if log.actor_id]
    actors = {}
    if actor_ids:
        result = await session.execute(
            select(User.id, User.full_name).where(User.id.in_(actor_ids))
        )
        actors = {str(row[0]): row[1] for row in result.all()}
    
    return [
        {
            "id": str(log.id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_name": actors.get(str(log.actor_id), "Unknown") if log.actor_id else "System",
            "actor_role": log.actor_role,
            "target_role": log.target_role,
            "action": log.action,
            "permission_id": log.permission_id,
            "details": json.loads(log.details) if log.details else None,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
