import os
import secrets
import string
import asyncio
import csv
import io
import subprocess
import gzip
import shutil
import re
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal
from uuid import UUID

import httpx
import psutil
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, func, select, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import require_permission
from app.models.notification import Notification
from app.models.repository import Repository, RepositoryType
from app.models.student_repository import StudentRepository
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.course import Course
from app.models.activity_log import ActivityLog, ActivityType
from app.models.system_log import SystemLog, LogLevel, LogSource
from app.models.user import User, UserRole
from app.schemas.admin_forks import AdminForkEventsRead
from app.schemas.admin_reports import AdminCourseSummaryRead, AdminReportsOverviewRead
from app.schemas.notification import (
    AdminNotificationActionRead,
    AdminNotificationRead,
    AdminNotificationsResponse,
    AdminNotificationsStatsResponse,
)
from app.services.admin_reports_service import get_admin_reports_overview
from app.schemas.repository import RepositoryRead
from app.services.admin_forks_service import get_admin_fork_events
from app.services.notification_realtime import push_notifications_updated
from app.services.notification_service import sync_user_notifications
from app.services.notification_delivery import upsert_notification
from app.services.repository_presenter import build_repository_read
from app.schemas.system_log import LogEntry, LogLocateResponse, LogsResponse, LogsStats
from app.services.system_log_display import build_log_entry, logs_select_with_user
from app.schemas.user import (
    AdminResetPasswordRequest,
    AdminResetPasswordResponse,
    AdminUpdateUserRequest,
    AdminUserRead,
)
from app.services.user_service import (
    delete_user_by_id,
    get_all_users,
    reset_user_password,
    update_user_role_and_block,
)
from app.services.logging_service import log_event_background

_BACKUP_CREATE_LOCK = asyncio.Lock()


class TableSizeEntry(BaseModel):
    name: str
    size: str
    size_mb: float


class DatabaseMetrics(BaseModel):
    connections_active: int | None = None
    connections_max: int | None = None
    size_mb: float | None = None
    tables_count: int | None = None
    queries_per_sec: float | None = None
    avg_query_ms: float | None = None
    cache_hit_rate: float | None = None
    deadlocks: int | None = None
    last_migration: str | None = None
    top_tables: list[TableSizeEntry] | None = None


class SystemMetrics(BaseModel):
    cpu_percent: float | None = None
    cpu_model: str | None = None
    memory_percent: float | None = None
    memory_used_gb: float | None = None
    memory_total_gb: float | None = None
    disk_percent: float | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    network_upload_mbps: float | None = None
    network_download_mbps: float | None = None
    load_avg: list[float] | None = None
    requests_total_hour: int | None = None
    requests_errors_hour: int | None = None
    avg_response_ms: float | None = None
    p95_response_ms: float | None = None
    error_rate: float | None = None
    rps: float | None = None
    database: DatabaseMetrics


class MonitoredServiceRead(BaseModel):
    id: str
    name: str
    port: str
    online: bool
    uptime: str | None = None
    detail: str | None = None


class ServiceStatus(BaseModel):
    git: bool
    db: bool
    api: bool
    frontend: bool = False
    websocket: bool = False
    git_uptime: str | None = None
    git_version: str | None = None
    db_uptime: str | None = None
    db_version: str | None = None
    api_uptime: str | None = None
    api_version: str | None = None
    git_repos_count: int | None = None
    websocket_connections: int | None = None
    frontend_url: str | None = None
    services: list[MonitoredServiceRead] = []


class BackupInfo(BaseModel):
    last_backup: str | None
    next_backup: str | None
    last_backup_size_mb: float | None

router = APIRouter(prefix="/admin", tags=["admin"])

NotificationCategory = Literal["users", "system", "security"]
NotificationSeverity = Literal["info", "warning", "critical", "success"]
NotificationEventKind = Literal[
    "pending_user",
    "webhook_failed",
    "service_down",
    "disk_warning",
    "backup_failed",
    "backup_success",
    "suspicious_login",
    "failed_login",
    "http_5xx",
    "security_alert",
    "generic",
]


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _require_admin(current_user: User) -> None:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _check_not_self(current_user: User, target_user_id: UUID) -> None:
    """Prevent admin from modifying themselves."""
    if current_user.id == target_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot perform this action on yourself")


def _check_target_not_admin(target_user: User) -> None:
    """Prevent actions on other admin users."""
    if target_user.role == UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot perform this action on admin users")


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _emit_admin_backup_notification(
    session: AsyncSession,
    *,
    title: str,
    message: str,
    ntype: str,
    href: str = "/admin/monitoring",
    dedupe_key: str,
) -> None:
    """Best-effort notification for backup events; never raises outside."""
    try:
        admins_result = await session.execute(
            select(User.id).where(User.role == UserRole.admin)
        )
        admin_ids = list(admins_result.scalars().all())
        if not admin_ids:
            return

        created_at = datetime.now(timezone.utc)
        event_type = "backup_success" if (ntype or "").lower() == "success" else "backup_failed"
        touched_admin_ids: list[UUID] = []
        for admin_id in admin_ids:
            created = await upsert_notification(
                session,
                user_id=admin_id,
                dedupe_key=dedupe_key,
                title=title,
                message=message,
                ntype=ntype,
                href=href,
                created_at=created_at,
                event_type=event_type,
            )
            if created:
                touched_admin_ids.append(admin_id)
        await session.commit()
        for admin_id in touched_admin_ids:
            await push_notifications_updated(admin_id)
    except Exception:
        await session.rollback()


def _contains_any(haystack: str, *needles: str) -> bool:
    return any(needle in haystack for needle in needles)


def _extract_first_int(haystack: str) -> int | None:
    match = re.search(r"\b(\d{1,4})\b", haystack)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _extract_percent(haystack: str) -> int | None:
    match = re.search(r"(\d{1,3})\s*%", haystack)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _extract_minutes(haystack: str) -> int | None:
    match = re.search(r"(\d{1,4})\s*(мин|мину|minutes|min)\b", haystack)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _extract_ip(haystack: str) -> str | None:
    match = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", haystack)
    return match.group(0) if match else None


def _base_notification_category(*, haystack: str, href: str | None) -> NotificationCategory:
    if (
        "/users" in (href or "")
        or _contains_any(haystack, "пользоват", "user", "регистр", "pending", "одобр")
    ):
        return "users"
    if _contains_any(
        haystack,
        "безопас",
        "security",
        "auth",
        "логин",
        "login",
        "подозр",
        "failed",
        "неудач",
    ):
        return "security"
    return "system"


def _detect_notification_event(
    *,
    title: str,
    message: str,
    href: str | None,
    ntype: str,
) -> tuple[NotificationEventKind, NotificationCategory, dict[str, int | float | bool | str | None]]:
    haystack = f"{title} {message} {href or ''}".lower()
    base_category = _base_notification_category(haystack=haystack, href=href)
    context: dict[str, int | float | bool | str | None] = {
        "service_down_minutes": _extract_minutes(haystack),
        "service_recovered_quickly": _contains_any(haystack, "восстанов", "restored", "recovered"),
        "disk_percent": _extract_percent(haystack),
        "backup_consecutive_failures": _extract_first_int(haystack),
        "failed_login_count_5m_ip": _extract_first_int(haystack),
        "error_5xx_rate_10m": _extract_percent(haystack),
        "ip": _extract_ip(haystack),
        "is_webhook_timeout": _contains_any(haystack, "timeout", "таймаут"),
    }

    # 1) Пользователи: ожидают подтверждения.
    if _contains_any(haystack, "ожида", "pending", "подтверж") and (
        "/users" in (href or "") or "пользоват" in haystack or "user" in haystack
    ):
        return "pending_user", "users", context

    # 2) Вебхуки.
    if _contains_any(haystack, "вебхук", "webhook"):
        has_delivery_issue = _contains_any(
            haystack,
            "failed",
            "error",
            "timeout",
            "не достав",
            "retry",
            "redeliver",
            "ошиб",
            "недоступ",
        )
        if has_delivery_issue:
            return "webhook_failed", "system", context

    # 3) Диск.
    if _contains_any(haystack, "диск", "disk"):
        return "disk_warning", "system", context

    # 4) Бэкапы.
    if _contains_any(haystack, "backup", "бэкап", "резервн"):
        if _contains_any(haystack, "error", "failed", "timeout", "ошиб", "неуда"):
            return "backup_failed", "system", context
        if _contains_any(haystack, "success", "выполн", "created", "создан"):
            return "backup_success", "system", context

    # 5) Сервисы.
    is_service = _contains_any(
        haystack,
        "service",
        "сервис",
        "недоступ",
        "unavailable",
        "down",
        "offline",
        "не отвечает",
    )
    if is_service:
        context["is_core_service"] = _contains_any(haystack, "gitea", "postgres", "database", "db", "api")
        context["is_smtp_service"] = _contains_any(haystack, "smtp", "mail")
        return "service_down", "system", context

    # 6) 5xx.
    if _contains_any(haystack, "5xx", "error rate", "ошибки 5"):
        return "http_5xx", "system", context

    # 7) Безопасность логинов.
    if _contains_any(haystack, "подозр", "suspicious", "bruteforce", "brute force"):
        return "suspicious_login", "security", context

    if _contains_any(haystack, "failed login", "неудач", "auth failed", "unauthorized"):
        return "failed_login", "security", context

    if base_category == "security":
        return "security_alert", "security", context

    return "generic", base_category, context




def _notification_unread_color(
    severity: Literal["info", "warning", "critical", "success"],
    is_read: bool,
) -> Literal["blue", "yellow", "red"] | None:
    if is_read:
        return None
    if severity == "critical":
        return "red"
    if severity == "warning":
        return "yellow"
    return "blue"


def _try_extract_pending_user_id(value: str) -> UUID | None:
    match = re.search(r"[0-9a-fA-F-]{36}", value)
    if not match:
        return None
    try:
        return UUID(match.group(0))
    except ValueError:
        return None


def _try_extract_repo_webhook_ids(href: str | None) -> tuple[UUID, UUID] | None:
    if not href:
        return None
    match = re.search(
        r"/repositories/([0-9a-fA-F-]{36})/settings/webhooks/([0-9a-fA-F-]{36})",
        href,
    )
    if not match:
        return None
    try:
        return UUID(match.group(1)), UUID(match.group(2))
    except ValueError:
        return None


def _build_notification_actions(
    *,
    title: str,
    message: str,
    href: str | None,
    event_kind: NotificationEventKind,
) -> list[AdminNotificationActionRead]:
    actions: list[AdminNotificationActionRead] = []

    pending_user_id = _try_extract_pending_user_id(f"{href or ''} {message}")
    if event_kind == "pending_user" and pending_user_id:
        actions.append(
            AdminNotificationActionRead(
                kind="approve_user",
                label="Принять",
                payload={"user_id": str(pending_user_id)},
            )
        )
        actions.append(
            AdminNotificationActionRead(
                kind="reject_user",
                label="Отклонить",
                payload={"user_id": str(pending_user_id)},
            )
        )
        return actions
    if event_kind == "pending_user" and href:
        actions.append(AdminNotificationActionRead(kind="open_link", label="Открыть", href=href))
        return actions

    if event_kind == "webhook_failed":
        parsed = _try_extract_repo_webhook_ids(href)
        if parsed:
            repo_id, webhook_id = parsed
            actions.append(
                AdminNotificationActionRead(
                    kind="retry_webhook",
                    label="Повторить",
                    payload={"repo_id": str(repo_id), "webhook_id": str(webhook_id)},
                )
            )
        elif href:
            actions.append(AdminNotificationActionRead(kind="open_link", label="Открыть", href=href))
        return actions

    if event_kind in {"service_down", "backup_failed"}:
        actions.append(
            AdminNotificationActionRead(kind="open_link", label="Мониторинг", href="/admin/monitoring")
        )
        return actions

    if event_kind == "disk_warning":
        actions.append(
            AdminNotificationActionRead(kind="open_link", label="Настройки", href="/admin/settings")
        )
        return actions

    if event_kind == "suspicious_login":
        actions.append(AdminNotificationActionRead(kind="open_link", label="Логи", href="/logs"))
        return actions

    return actions


def _severity_from_row(row: Notification) -> NotificationSeverity:
    value = (row.severity or "").lower()
    if value in {"info", "warning", "critical", "success"}:
        return value  # type: ignore[return-value]
    ntype = (row.type or "").lower()
    if ntype == "success":
        return "success"
    if ntype == "warning":
        return "warning"
    if ntype == "error":
        return "critical"
    return "info"


def _category_from_event(
    event_kind: NotificationEventKind,
    *,
    title: str,
    message: str,
    href: str | None,
) -> NotificationCategory:
    if event_kind == "pending_user":
        return "users"
    if event_kind in {"suspicious_login", "failed_login", "security_alert"}:
        return "security"
    if event_kind == "generic":
        haystack = f"{title} {message} {href or ''}".lower()
        return _base_notification_category(haystack=haystack, href=href)
    return "system"


async def _build_admin_notifications_feed(
    session: AsyncSession,
    current_user: User,
) -> list[AdminNotificationRead]:
    await sync_user_notifications(
        session,
        user_id=current_user.id,
        group_name=current_user.group_name,
        role=current_user.role,
    )

    combined: list[AdminNotificationRead] = []

    notifications_result = await session.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    for row in notifications_result.scalars().all():
        if row.event_type and row.event_type in {
            "pending_user",
            "webhook_failed",
            "service_down",
            "disk_warning",
            "backup_failed",
            "backup_success",
            "suspicious_login",
            "failed_login",
            "http_5xx",
            "security_alert",
            "generic",
        }:
            event_kind: NotificationEventKind = row.event_type  # type: ignore[assignment]
        else:
            event_kind, _, _ = _detect_notification_event(
                title=row.title,
                message=row.message,
                href=row.href,
                ntype=row.type,
            )
        inferred_severity = _severity_from_row(row)
        is_actionable = bool(row.actionable)
        inferred_category = _category_from_event(
            event_kind,
            title=row.title,
            message=row.message,
            href=row.href,
        )
        actions = _build_notification_actions(
            title=row.title,
            message=row.message,
            href=row.href,
            event_kind=event_kind,
        ) if is_actionable else []
        combined.append(
            AdminNotificationRead(
                id=row.id,
                title=row.title,
                message=row.message,
                type=row.type,
                read=row.read,
                href=row.href,
                created_at=row.created_at,
                category=inferred_category,
                severity=inferred_severity,
                unread_color=_notification_unread_color(inferred_severity, row.read),
                actionable=is_actionable,
                virtual=False,
                actions=actions,
            )
        )
    combined.sort(key=lambda item: item.created_at, reverse=True)
    return combined


@router.get("/users", response_model=list[AdminUserRead])
@require_permission("user_view")
async def admin_get_users(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> List[AdminUserRead]:
    users = await get_all_users(session)

    personal_counts: dict[UUID, int] = {}
    personal_result = await session.execute(
        select(Repository.owner_id, func.count())
        .group_by(Repository.owner_id)
    )
    for owner_id, count in personal_result.all():
        personal_counts[owner_id] = int(count or 0)

    assignment_counts: dict[UUID, int] = {}
    assignment_result = await session.execute(
        select(StudentRepository.student_id, func.count())
        .group_by(StudentRepository.student_id)
    )
    for student_id, count in assignment_result.all():
        assignment_counts[student_id] = int(count or 0)

    items: list[AdminUserRead] = []
    for user in users:
        base = AdminUserRead.model_validate(user)
        repo_count = personal_counts.get(user.id, 0) + assignment_counts.get(user.id, 0)
        items.append(base.model_copy(update={"repositories_count": repo_count}))
    return items


class AdminReviewQueueItemRead(BaseModel):
    repo_label: str
    pending_count: int
    urgency: str = "normal"


@router.get("/review-queue", response_model=list[AdminReviewQueueItemRead])
@require_permission("settings_view")
async def admin_review_queue(
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AdminReviewQueueItemRead]:
    """Pending assignment submissions grouped by repository (grading queue)."""
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(
            StudentRepository.repo_name,
            Assignment.title,
            Course.title,
            func.count(Submission.id).label("pending_count"),
            func.min(Submission.submitted_at).label("oldest_submitted"),
        )
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .outerjoin(
            StudentRepository,
            and_(
                StudentRepository.assignment_id == Assignment.id,
                StudentRepository.student_id == Submission.student_id,
            ),
        )
        .where(
            Submission.submitted_at.is_not(None),
            Submission.grade.is_(None),
            Submission.final_grade.is_(None),
        )
        .group_by(StudentRepository.repo_name, Assignment.title, Course.title)
        .order_by(func.min(Submission.submitted_at).asc())
        .limit(limit)
    )

    items: list[AdminReviewQueueItemRead] = []
    for repo_name, assignment_title, course_title, pending_count, oldest in result.all():
        label = repo_name or f"{course_title}/{assignment_title}"
        hours = 0.0
        if oldest is not None:
            hours = (now - oldest.astimezone(timezone.utc)).total_seconds() / 3600
        if hours >= 48:
            urgency = "urgent"
        elif hours >= 24:
            urgency = "today"
        else:
            urgency = "normal"
        items.append(
            AdminReviewQueueItemRead(
                repo_label=label,
                pending_count=int(pending_count or 0),
                urgency=urgency,
            )
        )
    return items


@router.get("/users/export")
@require_permission("user_view")
async def export_users_csv(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Export all users to CSV file."""
    users = await get_all_users(session)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(["ID", "Email", "Full Name", "Role", "Group", "Student ID", "Is Blocked", "Is Pending", "Created At", "Last Login"])
    
    # Write user data
    for user in users:
        writer.writerow([
            str(user.id),
            user.email,
            user.full_name,
            user.role.value,
            user.group_name or "",
            user.student_id or "",
            user.is_blocked,
            user.is_pending,
            user.created_at.isoformat() if user.created_at else "",
            user.last_login.isoformat() if user.last_login else "",
        ])
    
    # Create response
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=users_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


class UserImportRow(BaseModel):
    email: str
    full_name: str
    role: str
    group_name: Optional[str] = None
    student_id: Optional[str] = None


@router.post("/users/import")
@require_permission("user_edit")
async def import_users_csv(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Import users from CSV file."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Read CSV content
    content = await file.read()
    csv_text = content.decode('utf-8')
    
    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_text))
    
    imported_count = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):  # Start from 2 (header is row 1)
        try:
            email = row.get('email', '').strip()
            full_name = row.get('full_name', '').strip()
            role_str = row.get('role', '').strip().lower()
            group_name = row.get('group_name', '').strip() or None
            student_id = row.get('student_id', '').strip() or None
            
            if not email or not full_name:
                errors.append(f"Row {row_num}: Missing email or full_name")
                continue
            
            # Validate role
            valid_roles = {r.value for r in UserRole}
            if role_str not in valid_roles:
                errors.append(f"Row {row_num}: Invalid role '{role_str}'. Valid roles: {', '.join(valid_roles)}")
                continue
            
            # Check if user already exists
            existing = await session.execute(
                select(User).where(User.email == email)
            )
            if existing.scalar_one_or_none():
                errors.append(f"Row {row_num}: User with email '{email}' already exists")
                continue
            
            # Generate random password
            password = _generate_password()
            
            # Create user
            import bcrypt
            password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            new_user = User(
                email=email,
                password_hash=password_hash,
                full_name=full_name,
                role=UserRole(role_str),
                group_name=group_name,
                student_id=student_id,
                is_blocked=False,
                is_pending=True,  # Require approval
            )
            
            session.add(new_user)
            imported_count += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    await session.commit()
    
    return {
        "imported": imported_count,
        "errors": errors,
        "total": imported_count + len(errors)
    }


@router.patch("/users/{user_id}", response_model=AdminUserRead)
@require_permission("user_edit")
async def admin_patch_user(
    user_id: UUID,
    payload: AdminUpdateUserRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminUserRead:
    _check_not_self(current_user, user_id)

    # Fetch target user and check if admin
    result = await session.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_target_not_admin(target_user)

    user = await update_user_role_and_block(
        session,
        user_id=user_id,
        role=payload.role,
        is_blocked=payload.is_blocked,
        is_pending=payload.is_pending,
        group_name=payload.group_name,
        student_id=payload.student_id,
    )
    return AdminUserRead.model_validate(user)


@router.post("/users/{user_id}/approve", response_model=AdminUserRead)
@require_permission("user_edit")
async def admin_approve_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminUserRead:
    """Approve pending user."""
    ip_address = get_client_ip(request)
    _check_not_self(current_user, user_id)

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_target_not_admin(user)

    user.is_pending = False
    await session.commit()
    await session.refresh(user)

    # Log approval
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.admin,
        message=f"Approved user: {user.email}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=200,
    ))

    return AdminUserRead.model_validate(user)


@router.post("/users/{user_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("user_edit")
async def admin_reject_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Reject a pending registration (removes the user account)."""
    ip_address = get_client_ip(request)
    _check_not_self(current_user, user_id)

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_target_not_admin(user)

    if not user.is_pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending users can be rejected",
        )

    user_email = user.email
    await delete_user_by_id(session, user_id)

    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.admin,
        message=f"Rejected pending user: {user_email}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=204,
    ))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("user_delete")
async def admin_delete_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ip_address = get_client_ip(request)
    _check_not_self(current_user, user_id)

    # Fetch target user and check if admin
    result = await session.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_target_not_admin(target_user)

    user_email = target_user.email

    await delete_user_by_id(session, user_id)

    # Log deletion
    asyncio.create_task(log_event_background(
        level=LogLevel.INFO,
        source=LogSource.admin,
        message=f"Deleted user: {user_email}",
        ip_address=ip_address,
        user_id=current_user.id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        http_status=204,
    ))

    # Важно: явно возвращаем Response, чтобы FastAPI не пытался сериализовать body.
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/reset-password", response_model=AdminResetPasswordResponse)
@require_permission("user_edit")
async def admin_reset_password(
    user_id: UUID,
    payload: Optional[AdminResetPasswordRequest] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminResetPasswordResponse:
    _check_not_self(current_user, user_id)

    # Fetch target user and check if admin
    result = await session.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _check_target_not_admin(target_user)

    if payload and payload.new_password:
        new_password = payload.new_password
    else:
        new_password = _generate_password()

    await reset_user_password(session, user_id=user_id, new_password=new_password)
    return AdminResetPasswordResponse(new_password=new_password)


@router.get("/notifications", response_model=AdminNotificationsResponse)
@require_permission("settings_view")
async def admin_get_notifications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    category: Literal["all", "users", "system", "security"] = Query(default="all"),
    unread: bool | None = Query(default=None),
    severity: Literal["info", "warning", "critical", "success"] | None = Query(default=None),
    actionable: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminNotificationsResponse:
    _require_admin(current_user)
    combined = await _build_admin_notifications_feed(session, current_user)

    # 3) Filtering
    filtered = combined
    if category != "all":
        filtered = [item for item in filtered if item.category == category]
    if unread is True:
        filtered = [item for item in filtered if not item.read]
    elif unread is False:
        filtered = [item for item in filtered if item.read]
    if severity is not None:
        filtered = [item for item in filtered if item.severity == severity]
    if actionable is not None:
        filtered = [item for item in filtered if item.actionable is actionable]

    if q and q.strip():
        query_lower = q.strip().lower()
        filtered = [
            item
            for item in filtered
            if query_lower in item.title.lower()
            or query_lower in item.message.lower()
            or query_lower in (item.href or "").lower()
        ]

    total = len(filtered)
    pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit
    page_items = filtered[offset: offset + limit]

    return AdminNotificationsResponse(
        items=page_items,
        total=total,
        page=page,
        pages=pages,
    )


@router.get("/notifications/stats", response_model=AdminNotificationsStatsResponse)
@require_permission("settings_view")
async def admin_get_notifications_stats(
    q: str | None = Query(default=None, max_length=200),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminNotificationsStatsResponse:
    _require_admin(current_user)
    items = await _build_admin_notifications_feed(session, current_user)

    if q and q.strip():
        query_lower = q.strip().lower()
        items = [
            item
            for item in items
            if query_lower in item.title.lower()
            or query_lower in item.message.lower()
            or query_lower in (item.href or "").lower()
        ]

    return AdminNotificationsStatsResponse(
        total=len(items),
        unread=sum(1 for item in items if not item.read),
        action_required=sum(1 for item in items if item.actionable),
        critical=sum(1 for item in items if item.severity == "critical"),
        users=sum(1 for item in items if item.category == "users"),
        system=sum(1 for item in items if item.category == "system"),
        security=sum(1 for item in items if item.category == "security"),
    )


@router.delete("/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("settings_view")
async def admin_clear_read_notifications(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    _require_admin(current_user)

    result = await session.execute(
        delete(Notification).where(
            Notification.user_id == current_user.id,
            Notification.read.is_(True),
        )
    )
    await session.commit()
    if (result.rowcount or 0) > 0:
        await push_notifications_updated(current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/system-metrics", response_model=SystemMetrics)
@require_permission("settings_view")
async def admin_system_metrics(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SystemMetrics:
    from app.core.metrics_middleware import get_http_metrics
    from app.services.monitoring_service import (
        collect_database_metrics,
        read_cpu_model,
        sample_network_mbps,
    )

    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_model = read_cpu_model()

    mem = psutil.virtual_memory()
    memory_percent = mem.percent
    memory_used_gb = round(mem.used / (1024**3), 2)
    memory_total_gb = round(mem.total / (1024**3), 2)

    disk = psutil.disk_usage("/")
    disk_percent = disk.percent
    disk_used_gb = round(disk.used / (1024**3), 2)
    disk_total_gb = round(disk.total / (1024**3), 2)

    network_upload_mbps, network_download_mbps = sample_network_mbps()

    try:
        load_avg = [round(x, 2) for x in psutil.getloadavg()]
    except (AttributeError, OSError):
        load_avg = [0.0, 0.0, 0.0]

    http_metrics = get_http_metrics()
    db_raw = await collect_database_metrics(session)
    top_tables = None
    if db_raw.get("top_tables"):
        top_tables = [TableSizeEntry.model_validate(row) for row in db_raw["top_tables"]]

    database = DatabaseMetrics(
        connections_active=db_raw.get("connections_active"),
        connections_max=db_raw.get("connections_max"),
        size_mb=db_raw.get("size_mb"),
        tables_count=db_raw.get("tables_count"),
        queries_per_sec=db_raw.get("queries_per_sec"),
        avg_query_ms=db_raw.get("avg_query_ms"),
        cache_hit_rate=db_raw.get("cache_hit_rate"),
        deadlocks=db_raw.get("deadlocks"),
        last_migration=db_raw.get("last_migration"),
        top_tables=top_tables,
    )

    return SystemMetrics(
        cpu_percent=cpu_percent,
        cpu_model=cpu_model,
        memory_percent=memory_percent,
        memory_used_gb=memory_used_gb,
        memory_total_gb=memory_total_gb,
        disk_percent=disk_percent,
        disk_used_gb=disk_used_gb,
        disk_total_gb=disk_total_gb,
        network_upload_mbps=network_upload_mbps,
        network_download_mbps=network_download_mbps,
        load_avg=load_avg,
        requests_total_hour=http_metrics["requests_total_hour"],
        requests_errors_hour=http_metrics["requests_errors_hour"],
        avg_response_ms=http_metrics["avg_response_ms"],
        p95_response_ms=http_metrics["p95_response_ms"],
        error_rate=http_metrics["error_rate"],
        rps=http_metrics["rps"],
        database=database,
    )


@router.get("/service-status", response_model=ServiceStatus)
@require_permission("settings_view")
async def admin_service_status(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ServiceStatus:
    from app.services.monitoring_service import build_service_status

    payload = await build_service_status(session)
    services = [MonitoredServiceRead.model_validate(s) for s in payload.pop("services", [])]
    return ServiceStatus(**payload, services=services)


@router.post("/restart")
@require_permission("admin")
async def restart_api(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Restart the API service (Linux/Docker only)."""
    import subprocess
    import signal
    import os
    import sys

    try:
        # Check if running on Windows
        if sys.platform == "win32":
            # On Windows, return a message that restart is not supported
            return {"status": "warning", "message": "API restart is not supported on Windows. Please restart the server manually."}

        # Send SIGTERM to self for graceful shutdown (Linux/Docker)
        os.kill(os.getpid(), signal.SIGTERM)
        return {"status": "success", "message": "API restart initiated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backups", response_model=BackupInfo)
@require_permission("logs_view")
async def admin_backups(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BackupInfo:

    # Check for backup files in backups directory
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "backups")
    last_backup = None
    last_backup_size_mb = None

    if os.path.exists(backup_dir):
        try:
            files = [f for f in os.listdir(backup_dir) if f.endswith(".sql") or f.endswith(".sql.gz") or f.endswith(".dump")]
            if files:
                # Get most recent file
                files_with_time = [
                    (f, os.path.getmtime(os.path.join(backup_dir, f)))
                    for f in files
                ]
                files_with_time.sort(key=lambda x: x[1], reverse=True)
                last_backup_time = datetime.fromtimestamp(files_with_time[0][1])
                # Convert to Moscow time (UTC+3)
                last_backup_time_msk = last_backup_time.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=3)))
                last_backup = last_backup_time_msk.strftime("%d.%m.%Y %H:%M")
                # Get file size in MB
                file_size_bytes = os.path.getsize(os.path.join(backup_dir, files_with_time[0][0]))
                last_backup_size_mb = round(file_size_bytes / (1024 * 1024), 1)
        except Exception:
            pass

    # Next backup is scheduled for 03:00 MSK daily
    now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=3)))
    next_backup_time = now.replace(hour=3, minute=0, second=0, microsecond=0)
    if now >= next_backup_time:
        # If it's already past 03:00 today, schedule for tomorrow
        next_backup_time = next_backup_time + timedelta(days=1)
    next_backup = next_backup_time.strftime("%d.%m.%Y %H:%M")

    return BackupInfo(last_backup=last_backup, next_backup=next_backup, last_backup_size_mb=last_backup_size_mb)


@router.post("/backups/create")
@require_permission("settings_edit")
async def admin_create_backup(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if _BACKUP_CREATE_LOCK.locked():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Backup is already in progress. Please wait a few seconds and retry.",
        )

    # Use backups directory in project root for local development
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup_file = os.path.join(backup_dir, f"backup_{timestamp}.sql")

    # Get DB connection from environment
    db_host = os.getenv("POSTGRES_HOST", "localhost")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    db_name = os.getenv("POSTGRES_DB", "app")
    db_user = os.getenv("POSTGRES_USER", "postgres")
    db_pass = os.getenv("POSTGRES_PASSWORD", "postgres")

    async with _BACKUP_CREATE_LOCK:
        try:
            # Run pg_dump
            env = os.environ.copy()
            env["PGPASSWORD"] = db_pass

            result = await asyncio.to_thread(
                subprocess.run,
                [
                    "pg_dump",
                    "-h", db_host,
                    "-p", db_port,
                    "-U", db_user,
                    "-d", db_name,
                    "-f", backup_file,
                    "--clean",
                    "--if-exists",
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode != 0:
                await _emit_admin_backup_notification(
                    session,
                    title="Ошибка бэкапа",
                    message=f"pg_dump failed: {result.stderr}"[:240],
                    ntype="error",
                    dedupe_key=f"backup:error:pgdump:{timestamp}",
                )
                raise HTTPException(status_code=500, detail=f"Backup failed: {result.stderr}")

            backup_file_gz = f"{backup_file}.gz"

            def _compress_sql_to_gzip(src: str, dst: str) -> None:
                with open(src, "rb") as src_file, gzip.open(dst, "wb") as dst_file:
                    shutil.copyfileobj(src_file, dst_file)
                os.remove(src)

            await asyncio.to_thread(_compress_sql_to_gzip, backup_file, backup_file_gz)

            backup_name = f"backup_{timestamp}.sql.gz"
            await _emit_admin_backup_notification(
                session,
                title="Бэкап выполнен успешно",
                message=f"Создан файл {backup_name}",
                ntype="success",
                dedupe_key=f"backup:success:{timestamp}",
            )

            return {"success": True, "file": backup_name, "message": "Backup created successfully"}

        except subprocess.TimeoutExpired:
            await _emit_admin_backup_notification(
                session,
                title="Ошибка бэкапа",
                message="Создание бэкапа завершилось по таймауту",
                ntype="error",
                dedupe_key=f"backup:error:timeout:{timestamp}",
            )
            raise HTTPException(status_code=500, detail="Backup timeout")
        except HTTPException:
            raise
        except Exception as e:
            await _emit_admin_backup_notification(
                session,
                title="Ошибка бэкапа",
                message=f"Backup error: {str(e)}"[:240],
                ntype="error",
                dedupe_key=f"backup:error:{timestamp}",
            )
            raise HTTPException(status_code=500, detail=f"Backup error: {str(e)}")


@router.get("/repositories", response_model=List[RepositoryRead])
@require_permission("repo_view")
async def admin_list_repositories(
    repo_type: Optional[RepositoryType] = None,
    language: Optional[str] = None,
    is_blocked: Optional[bool] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> List[RepositoryRead]:
    """Get all repositories with optional filters and pagination (admin only)."""
    query = select(Repository, User).outerjoin(User, Repository.owner_id == User.id)

    if repo_type:
        query = query.where(Repository.repo_type == repo_type)
    if language:
        query = query.where(Repository.language == language)
    if is_blocked is not None:
        query = query.where(Repository.is_blocked == is_blocked)

    query = query.order_by(Repository.created_at.desc()).offset(skip).limit(limit)

    result = await session.execute(query)
    repos_with_owners = result.all()

    repositories = []
    for repo, owner_user in repos_with_owners:
        # Count commits from activity_log
        commits_result = await session.execute(
            select(func.count(ActivityLog.id)).where(
                ActivityLog.repo_name == repo.gitea_repo_name,
                ActivityLog.activity_type == ActivityType.commit
            )
        )
        commits_count = commits_result.scalar() or 0

        owner_name = owner_user.full_name if owner_user else None
        repositories.append(
            await build_repository_read(
                repo,
                owner_user,
                owner_full_name=owner_name,
                commits_count=commits_count,
            )
        )

    return repositories


@router.get("/reports/overview", response_model=AdminReportsOverviewRead)
@require_permission("settings_view")
async def admin_reports_overview(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminReportsOverviewRead:
    return await get_admin_reports_overview(session)


@router.get("/courses", response_model=List[AdminCourseSummaryRead])
@require_permission("settings_view")
async def admin_list_courses_summary(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> List[AdminCourseSummaryRead]:
    overview = await get_admin_reports_overview(session)
    return overview.courses[:limit]


@router.get("/forks", response_model=AdminForkEventsRead)
@require_permission("repo_view")
async def admin_fork_events(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    event_type: Optional[str] = Query(default=None, description="fork | repo_created"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AdminForkEventsRead:
    """Fork and repository creation events from activity log."""
    return await get_admin_fork_events(
        session,
        limit=limit,
        offset=offset,
        event_type=event_type,
    )


@router.post("/repositories/{repository_id}/toggle-block", response_model=RepositoryRead)
@require_permission("repo_edit")
async def admin_toggle_repository_block(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RepositoryRead:
    """Toggle repository blocked status (admin only)."""
    result = await session.execute(
        select(Repository).where(Repository.id == repository_id)
    )
    repository = result.scalar_one_or_none()
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    repository.is_blocked = not repository.is_blocked
    await session.commit()
    await session.refresh(repository)
    owner_user = await session.get(User, repository.owner_id) if repository.owner_id else None
    return await build_repository_read(repository, owner_user)


@router.delete("/repositories/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_permission("repo_delete")
async def admin_delete_repository(
    repository_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Permanently delete any repository (platform DB + Gitea)."""
    from app.services.repository_admin_service import admin_delete_repository as delete_repo

    await delete_repo(session, repository_id=repository_id, actor=current_user)


# System-wide Gitea webhook setup
GITEA_URL = os.getenv("GITEA_URL", "http://gitea:3000")
GITEA_TOKEN = os.getenv("GITEA_TOKEN", "")
GITEA_ADMIN_USERNAME = os.getenv("GITEA_ADMIN_USERNAME", "gitea_admin")
GITEA_ADMIN_PASSWORD = os.getenv("GITEA_ADMIN_PASSWORD", "admin12345")
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "http://api:8000/webhooks")
WEBHOOK_SECRET = os.getenv("GITEA_WEBHOOK_SECRET", "")


def get_gitea_auth_headers() -> dict[str, str]:
    """Возвращает заголовки авторизации для Gitea API."""
    if GITEA_TOKEN:
        return {"Authorization": f"token {GITEA_TOKEN}"}

    # Basic auth с admin credentials
    credentials = f"{GITEA_ADMIN_USERNAME}:{GITEA_ADMIN_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


@router.post("/setup-gitea-webhook")
async def setup_gitea_system_webhook(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Create system-wide webhook in Gitea to capture all events from all repositories.
    This needs to be called once after Gitea is set up.
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"GITEA_TOKEN configured: {bool(GITEA_TOKEN)}, length: {len(GITEA_TOKEN) if GITEA_TOKEN else 0}")
    logger.info(f"GITEA_URL: {GITEA_URL}")

    auth_headers = get_gitea_auth_headers()

    async with httpx.AsyncClient() as client:
        # Check if system webhook already exists
        hooks_response = await client.get(
            f"{GITEA_URL}/api/v1/admin/hooks",
            headers=auth_headers,
            timeout=10.0,
        )
        
        if hooks_response.status_code == 200:
            hooks = hooks_response.json()
            for hook in hooks:
                config = hook.get("config", {})
                if config.get("url") == f"{WEBHOOK_BASE_URL}/gitea":
                    return {
                        "status": "already_exists",
                        "message": "System webhook already configured",
                        "hook_id": hook.get("id"),
                    }
        
        # Create system webhook for all events
        logger.info(f"Creating system webhook -> {WEBHOOK_BASE_URL}/gitea")
        
        # Gitea system webhook API
        response = await client.post(
            f"{GITEA_URL}/api/v1/admin/hooks",
            headers={
                **auth_headers,
                "Content-Type": "application/json",
            },
            json={
                "type": "gitea",
                "config": {
                    "url": f"{WEBHOOK_BASE_URL}/gitea",
                    "content_type": "json",
                    "secret": WEBHOOK_SECRET,
                },
                "events": [
                    "push",
                    "create",
                    "delete",
                    "fork",
                    "repository",
                    "release",
                ],
                "active": True,
            },
            timeout=10.0,
        )
        
        if response.status_code in (201, 200):
            hook_data = response.json()
            logger.info(f"System webhook created successfully: {hook_data.get('id')}")
            return {
                "status": "created",
                "message": "System webhook created successfully",
                "hook_id": hook_data.get("id"),
                "events": ["push", "create", "delete", "fork", "repository", "release"],
            }
        else:
            error_text = response.text[:500]
            logger.error(f"Failed to create system webhook: {response.status_code} - {error_text}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create system webhook: {response.status_code} - {error_text}",
            )


@router.post("/sync-gitea-repositories")
async def sync_gitea_repositories(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Sync all repositories from Gitea to local database.
    This is useful for initial sync or after webhook setup.
    """
    import logging
    from app.models.repository import Repository, RepositoryType
    from app.core.config import settings

    logger = logging.getLogger(__name__)

    auth_headers = get_gitea_auth_headers()

    async with httpx.AsyncClient() as client:
        # Get all repositories from Gitea (using user repos endpoint with admin token)
        response = await client.get(
            f"{settings.GITEA_URL}/api/v1/user/repos",
            headers=auth_headers,
            timeout=30.0,
        )

        if response.status_code != 200:
            logger.error(f"Failed to fetch repositories from Gitea: {response.status_code}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch repositories from Gitea: {response.status_code}",
            )

        gitea_repos = response.json()
        synced_count = 0
        updated_count = 0

        for gitea_repo in gitea_repos:
            gitea_repo_id = gitea_repo.get("id")
            full_name = gitea_repo.get("full_name")
            description = gitea_repo.get("description")
            clone_url = gitea_repo.get("clone_url")
            is_private = gitea_repo.get("private", False)
            language = gitea_repo.get("language")
            owner_login = gitea_repo.get("owner", {}).get("login")

            # Find user by login
            user_id = None
            if owner_login:
                result = await session.execute(
                    select(User.id).where(User.mtuci_login == owner_login)
                )
                user_id = result.scalar_one_or_none()

            # Check if repo already exists
            existing = await session.execute(
                select(Repository).where(Repository.gitea_repo_id == gitea_repo_id)
            )
            repo = existing.scalar_one_or_none()

            if repo:
                # Update existing repo
                repo.description = description
                repo.clone_url = clone_url
                repo.language = language
                if user_id:
                    repo.owner_id = user_id
                updated_count += 1
            else:
                # Create new repo
                new_repo = Repository(
                    name=full_name.split("/")[-1] if "/" in full_name else full_name,
                    description=description,
                    gitea_repo_name=full_name,
                    gitea_repo_id=gitea_repo_id,
                    clone_url=clone_url,
                    owner_id=user_id,
                    repo_type=RepositoryType.private if is_private else RepositoryType.public,
                    language=language,
                )
                session.add(new_repo)
                synced_count += 1

            # Sync commits for this repo
            try:
                commits_response = await client.get(
                    f"{settings.GITEA_URL}/api/v1/repos/{full_name}/commits",
                    headers=auth_headers,
                    timeout=30.0,
                )
                if commits_response.status_code == 200:
                    commits = commits_response.json()
                    from app.models.activity_log import ActivityLog, ActivityType
                    from datetime import datetime, timezone

                    for commit in commits:
                        # Check if commit already logged
                        commit_sha = commit.get("sha")
                        existing_commit = await session.execute(
                            select(ActivityLog).where(
                                ActivityLog.repo_name == full_name,
                                ActivityLog.message.like(f"%{commit_sha[:7]}%")
                            )
                        )
                        if not existing_commit.scalar_one_or_none():
                            # Log commit
                            commit_author = commit.get("commit", {}).get("author", {}).get("name")
                            commit_message = commit.get("commit", {}).get("message", "")
                            commit_date_str = commit.get("commit", {}).get("author", {}).get("date")

                            # Try to find user by author name
                            commit_user_id = user_id
                            if not commit_user_id and commit_author:
                                result = await session.execute(
                                    select(User.id).where(User.full_name.ilike(f"%{commit_author}%"))
                                )
                                commit_user_id = result.scalar_one_or_none()

                            activity = ActivityLog(
                                user_id=commit_user_id,
                                user_login=owner_login if not commit_user_id else None,
                                activity_type=ActivityType.commit,
                                repo_name=full_name,
                                message=f"{commit_message[:100]} ({commit_sha[:7]})",
                                created_at=datetime.fromisoformat(commit_date_str.replace("Z", "+00:00")) if commit_date_str else datetime.now(timezone.utc),
                            )
                            session.add(activity)
            except Exception as e:
                logger.warning(f"Failed to sync commits for {full_name}: {e}")

        await session.commit()
        logger.info(f"Synced {synced_count} new repos, updated {updated_count} existing repos from Gitea")

        return {
            "status": "ok",
            "synced": synced_count,
            "updated": updated_count,
            "total": len(gitea_repos),
        }


# ============ LOGS ENDPOINTS ============

def _build_log_conditions(
    *,
    level: Optional[LogLevel],
    source: Optional[LogSource],
    search: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> list:
    conditions = []
    if level:
        conditions.append(SystemLog.level == level)
    if source:
        conditions.append(SystemLog.source == source)
    if date_from:
        conditions.append(SystemLog.created_at >= date_from)
    if date_to:
        conditions.append(SystemLog.created_at <= date_to)
    if search:
        search_pattern = f"%{search}%"
        conditions.append(
            or_(
                SystemLog.message.ilike(search_pattern),
                SystemLog.user_email.ilike(search_pattern),
                SystemLog.user_full_name.ilike(search_pattern),
                SystemLog.ip_address.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.full_name.ilike(search_pattern),
            )
        )
    return conditions


def _apply_logs_sort(query, sort: str):
    if sort == "desc":
        return query.order_by(SystemLog.created_at.desc(), SystemLog.id.desc())
    return query.order_by(SystemLog.created_at.asc(), SystemLog.id.asc())


@router.get("/logs", response_model=LogsResponse)
async def get_logs(
    level: Optional[LogLevel] = Query(None),
    source: Optional[LogSource] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    sort: str = Query("desc", pattern="^(desc|asc)$"),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get system logs with filtering and pagination."""
    _require_admin(current_user)

    query = logs_select_with_user()
    count_query = (
        select(func.count())
        .select_from(SystemLog)
        .join(User, SystemLog.user_id == User.id, isouter=True)
    )

    conditions = _build_log_conditions(
        level=level,
        source=source,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))

    total_result = await session.execute(count_query)
    total = total_result.scalar()

    query = _apply_logs_sort(query, sort)

    # Apply pagination
    query = query.limit(limit).offset(offset)

    result = await session.execute(query)
    rows = result.all()

    return LogsResponse(
        logs=[
            build_log_entry(log, joined_email=joined_email, joined_full_name=joined_full_name)
            for log, joined_email, joined_full_name in rows
        ],
        total=total,
    )


@router.get("/logs/locate", response_model=LogLocateResponse)
async def locate_log_page(
    log_id: UUID = Query(...),
    level: Optional[LogLevel] = Query(None),
    source: Optional[LogSource] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    sort: str = Query("desc", pattern="^(desc|asc)$"),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LogLocateResponse:
    """Locate which page contains the requested log under current filters/sort."""
    _require_admin(current_user)

    conditions = _build_log_conditions(
        level=level,
        source=source,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    count_query = (
        select(func.count())
        .select_from(SystemLog)
        .join(User, SystemLog.user_id == User.id, isouter=True)
    )
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_result = await session.execute(count_query)
    total = int(total_result.scalar() or 0)
    pages = (total + limit - 1) // limit if total > 0 else 0

    target_query = (
        select(SystemLog.id, SystemLog.created_at)
        .select_from(SystemLog)
        .join(User, SystemLog.user_id == User.id, isouter=True)
        .where(SystemLog.id == log_id)
    )
    if conditions:
        target_query = target_query.where(and_(*conditions))
    target_result = await session.execute(target_query)
    target = target_result.first()
    if not target:
        return LogLocateResponse(
            found=False,
            total=total,
            page=1,
            pages=pages,
            limit=limit,
            offset=0,
        )

    _, target_created_at = target
    if sort == "desc":
        before_cmp = or_(
            SystemLog.created_at > target_created_at,
            and_(SystemLog.created_at == target_created_at, SystemLog.id > log_id),
        )
    else:
        before_cmp = or_(
            SystemLog.created_at < target_created_at,
            and_(SystemLog.created_at == target_created_at, SystemLog.id < log_id),
        )

    before_conditions = [*conditions, before_cmp]
    before_query = (
        select(func.count())
        .select_from(SystemLog)
        .join(User, SystemLog.user_id == User.id, isouter=True)
        .where(and_(*before_conditions))
    )
    before_result = await session.execute(before_query)
    before = int(before_result.scalar() or 0)
    page = before // limit + 1
    offset = max(0, (page - 1) * limit)

    return LogLocateResponse(
        found=True,
        total=total,
        page=page,
        pages=pages,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/stats", response_model=LogsStats)
async def get_logs_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get logs statistics."""
    _require_admin(current_user)

    # Total logs
    total_result = await session.execute(select(func.count()).select_from(SystemLog))
    total = total_result.scalar() or 0

    # Today's date range
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # Errors today
    errors_result = await session.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(
            and_(
                SystemLog.level == LogLevel.ERROR,
                SystemLog.created_at >= today_start,
                SystemLog.created_at < today_end,
            )
        )
    )
    errors_today = errors_result.scalar() or 0

    # Warnings today
    warnings_result = await session.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(
            and_(
                SystemLog.level == LogLevel.WARNING,
                SystemLog.created_at >= today_start,
                SystemLog.created_at < today_end,
            )
        )
    )
    warnings_today = warnings_result.scalar() or 0

    # Success today (2xx HTTP status)
    success_result = await session.execute(
        select(func.count())
        .select_from(SystemLog)
        .where(
            and_(
                SystemLog.http_status >= 200,
                SystemLog.http_status < 300,
                SystemLog.created_at >= today_start,
                SystemLog.created_at < today_end,
            )
        )
    )
    success_today = success_result.scalar() or 0

    return LogsStats(
        total=total,
        errors_today=errors_today,
        warnings_today=warnings_today,
        success_today=success_today,
    )


@router.get("/logs/export")
async def export_logs(
    level: Optional[LogLevel] = Query(None),
    source: Optional[LogSource] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    sort: str = Query("desc", pattern="^(desc|asc)$"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Export logs to CSV."""
    _require_admin(current_user)

    query = logs_select_with_user()

    conditions = _build_log_conditions(
        level=level,
        source=source,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    if conditions:
        query = query.where(and_(*conditions))

    query = _apply_logs_sort(query, sort)

    result = await session.execute(query)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "id", "created_at", "level", "source", "user_id", "user_email",
        "user_full_name", "message", "detail", "ip_address", "http_status"
    ])

    for log, joined_email, joined_full_name in rows:
        entry = build_log_entry(log, joined_email=joined_email, joined_full_name=joined_full_name)
        writer.writerow([
            str(log.id),
            log.created_at.isoformat(),
            log.level.value,
            log.source.value,
            str(log.user_id) if log.user_id else "",
            entry.user_email or "",
            entry.user_full_name or "",
            log.message,
            log.detail or "",
            log.ip_address,
            str(log.http_status) if log.http_status else "",
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="logs_{datetime.now(timezone.utc).isoformat()}.csv"'
        }
    )


@router.delete("/logs/old")
async def delete_old_logs(
    days: int = Query(30, ge=0, le=365),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete logs older than specified days. If days=0, delete all logs."""
    _require_admin(current_user)

    if days == 0:
        # Delete all logs
        count_result = await session.execute(select(func.count()).select_from(SystemLog))
        deleted_count = count_result.scalar() or 0
        
        await session.execute(SystemLog.__table__.delete())
    else:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Get count before deletion
        count_result = await session.execute(
            select(func.count())
            .select_from(SystemLog)
            .where(SystemLog.created_at < cutoff_date)
        )
        deleted_count = count_result.scalar() or 0

        # Delete
        await session.execute(
            SystemLog.__table__.delete().where(SystemLog.created_at < cutoff_date)
        )

    await session.commit()

    return {"deleted_count": deleted_count}
