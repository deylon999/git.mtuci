from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.system_log import SystemLog

NotificationSeverity = Literal["info", "warning", "critical", "success"]
NotificationEventType = Literal[
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

ACTIONABLE_EVENT_TYPES: set[NotificationEventType] = {
    "pending_user",
    "webhook_failed",
    "service_down",
    "disk_warning",
    "backup_failed",
    "suspicious_login",
}


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


def _extract_percent(haystack: str) -> float | None:
    match = re.search(r"(\d{1,3})\s*%", haystack)
    if not match:
        return None
    try:
        return float(match.group(1))
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


def detect_notification_event_type(
    *,
    title: str,
    message: str,
    href: str | None,
    ntype: str,
) -> NotificationEventType:
    haystack = f"{title} {message} {href or ''}".lower()

    if _contains_any(haystack, "ожида", "pending", "подтверж") and (
        "/users" in (href or "") or _contains_any(haystack, "пользоват", "user")
    ):
        return "pending_user"

    if _contains_any(haystack, "вебхук", "webhook") and _contains_any(
        haystack,
        "failed",
        "error",
        "timeout",
        "не достав",
        "retry",
        "redeliver",
        "ошиб",
        "недоступ",
    ):
        return "webhook_failed"

    if _contains_any(haystack, "диск", "disk"):
        return "disk_warning"

    if _contains_any(haystack, "backup", "бэкап", "резервн"):
        if _contains_any(haystack, "success", "выполн", "created", "создан"):
            return "backup_success"
        if _contains_any(haystack, "error", "failed", "timeout", "ошиб", "неуда"):
            return "backup_failed"

    if _contains_any(
        haystack,
        "service",
        "сервис",
        "недоступ",
        "unavailable",
        "down",
        "offline",
        "не отвечает",
        "gitea",
        "postgres",
        "database",
        "db",
        "api",
        "smtp",
    ):
        return "service_down"

    if _contains_any(haystack, "5xx", "error rate", "ошибки 5"):
        return "http_5xx"

    if _contains_any(haystack, "подозр", "suspicious", "bruteforce", "brute force"):
        return "suspicious_login"

    if _contains_any(haystack, "failed login", "неудач", "auth failed", "unauthorized"):
        return "failed_login"

    if _contains_any(haystack, "безопас", "security", "auth", "логин", "login"):
        return "security_alert"

    return "generic"


async def build_classification_context(
    session: AsyncSession,
    *,
    user_id: UUID,
    event_type: NotificationEventType,
    title: str,
    message: str,
    href: str | None,
    created_at: datetime | None = None,
) -> dict[str, float | int | bool | str | None]:
    now = created_at or datetime.now(timezone.utc)
    haystack = f"{title} {message} {href or ''}".lower()
    context: dict[str, float | int | bool | str | None] = {
        "service_down_minutes": _extract_minutes(haystack) or 0,
        "service_recovered_quickly": _contains_any(haystack, "восстанов", "restored", "recovered"),
        "is_core_service": _contains_any(haystack, "gitea", "postgres", "database", "db", "api"),
        "disk_percent": _extract_percent(haystack) or 0.0,
        "backup_last_success_hours": 0.0,
        "backup_consecutive_failures": _extract_first_int(haystack) or 0,
        "failed_login_count_5m_ip": _extract_first_int(haystack) or 0,
        "error_5xx_rate_10m": _extract_percent(haystack) or 0.0,
        "is_webhook_timeout": _contains_any(haystack, "timeout", "таймаут"),
        "ip": _extract_ip(haystack),
    }

    if event_type in {"failed_login", "suspicious_login"}:
        ip = context.get("ip")
        if isinstance(ip, str) and ip:
            cutoff = now - timedelta(minutes=5)
            result = await session.execute(
                select(func.count())
                .select_from(SystemLog)
                .where(
                    SystemLog.created_at >= cutoff,
                    SystemLog.ip_address == ip,
                    or_(
                        SystemLog.message.ilike("%failed login%"),
                        SystemLog.message.ilike("%неудач%"),
                    ),
                )
            )
            context["failed_login_count_5m_ip"] = int(result.scalar() or 0)

    if event_type == "http_5xx":
        cutoff = now - timedelta(minutes=10)
        total_result = await session.execute(
            select(func.count())
            .select_from(SystemLog)
            .where(
                SystemLog.created_at >= cutoff,
                SystemLog.http_status.isnot(None),
            )
        )
        total = int(total_result.scalar() or 0)
        errors_result = await session.execute(
            select(func.count())
            .select_from(SystemLog)
            .where(
                SystemLog.created_at >= cutoff,
                SystemLog.http_status.isnot(None),
                SystemLog.http_status >= 500,
            )
        )
        errors = int(errors_result.scalar() or 0)
        context["error_5xx_rate_10m"] = (errors * 100.0 / total) if total > 0 else 0.0

    if event_type == "backup_failed":
        history_result = await session.execute(
            select(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.event_type.in_(["backup_success", "backup_failed"]),
            )
            .order_by(Notification.created_at.desc())
            .limit(200)
        )
        history = list(history_result.scalars().all())

        last_success: datetime | None = None
        consecutive_failures = 0
        scanning_head = True
        for row in history:
            if row.event_type == "backup_success":
                if last_success is None:
                    last_success = row.created_at
                scanning_head = False
                continue
            if scanning_head and row.event_type == "backup_failed":
                consecutive_failures += 1

        if last_success is None:
            context["backup_last_success_hours"] = 10_000.0
        else:
            context["backup_last_success_hours"] = max(
                0.0,
                (now - last_success).total_seconds() / 3600.0,
            )
        context["backup_consecutive_failures"] = max(
            int(context.get("backup_consecutive_failures") or 0),
            consecutive_failures,
        )

    return context


def classify_notification(
    event_type: NotificationEventType,
    context: dict[str, float | int | bool | str | None],
) -> tuple[NotificationSeverity, bool]:
    actionable = event_type in ACTIONABLE_EVENT_TYPES

    service_down_minutes = int(context.get("service_down_minutes") or 0)
    service_recovered_quickly = bool(context.get("service_recovered_quickly") or False)
    is_core_service = bool(context.get("is_core_service") or False)
    disk_percent = float(context.get("disk_percent") or 0.0)
    backup_last_success_hours = float(context.get("backup_last_success_hours") or 0.0)
    backup_consecutive_failures = int(context.get("backup_consecutive_failures") or 0)
    failed_login_count_5m_ip = int(context.get("failed_login_count_5m_ip") or 0)
    error_5xx_rate_10m = float(context.get("error_5xx_rate_10m") or 0.0)
    is_webhook_timeout = bool(context.get("is_webhook_timeout") or False)

    if event_type == "service_down":
        if is_core_service and service_down_minutes > 5:
            return "critical", actionable
        if service_recovered_quickly or service_down_minutes <= 5:
            return "warning", actionable
        return "warning", actionable

    if event_type == "disk_warning":
        if disk_percent > 90:
            return "critical", actionable
        if 80 <= disk_percent <= 90:
            return "warning", actionable
        return "info", actionable

    if event_type == "backup_failed":
        if backup_last_success_hours > 24 or backup_consecutive_failures >= 2:
            return "critical", actionable
        return "warning", actionable

    if event_type == "failed_login":
        if failed_login_count_5m_ip > 10:
            return "critical", False
        if failed_login_count_5m_ip >= 1:
            return "warning", False
        return "info", False

    if event_type == "http_5xx":
        if error_5xx_rate_10m > 5:
            return "critical", False
        return "warning", False

    if event_type == "webhook_failed":
        if is_webhook_timeout:
            return "warning", actionable
        return "warning", actionable

    if event_type == "suspicious_login":
        if failed_login_count_5m_ip > 10:
            return "critical", actionable
        return "warning", actionable

    if event_type == "pending_user":
        return "warning", actionable

    if event_type == "backup_success":
        return "success", False

    if event_type == "security_alert":
        return "warning", False

    return "info", False

