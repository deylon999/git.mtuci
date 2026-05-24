"""Resolve display names for system log entries (API + export)."""
from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_log import SystemLog
from app.models.user import User
from app.schemas.system_log import LogEntry
from app.services.user_service import get_user_by_id

_EMAIL_IN_MESSAGE = re.compile(
    r"(?:"
    r"for user:\s*(\S+@\S+)|"
    r"for email:\s*(\S+@\S+)|"
    r"Approved user:\s*(\S+@\S+)|"
    r"Rejected pending user:\s*(\S+@\S+)|"
    r"Deleted user:\s*(\S+@\S+)|"
    r"Blocked user attempted login:\s*(\S+@\S+)|"
    r"Failed login attempt for (?:email|user):\s*(\S+@\S+)|"
    r"Successful login for user:\s*(\S+@\S+)"
    r")",
    re.IGNORECASE,
)


def extract_email_from_message(message: str | None) -> str | None:
    if not message:
        return None
    match = _EMAIL_IN_MESSAGE.search(message)
    if not match:
        return None
    for group in match.groups():
        if group:
            return group.rstrip(".,;")
    return None


async def resolve_log_display_user(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    user_email: str | None,
    user_full_name: str | None,
    message: str | None = None,
) -> tuple[str | None, str | None]:
    email = (user_email or "").strip() or None
    full_name = (user_full_name or "").strip() or None

    if user_id and (not email or not full_name):
        user = await get_user_by_id(session, user_id)
        if user:
            email = email or user.email
            full_name = full_name or user.full_name

    if not email:
        email = extract_email_from_message(message)

    return email, full_name


def build_log_entry(
    log: SystemLog,
    *,
    joined_email: str | None = None,
    joined_full_name: str | None = None,
) -> LogEntry:
    email = (log.user_email or "").strip() or (joined_email or "").strip() or None
    full_name = (log.user_full_name or "").strip() or (joined_full_name or "").strip() or None
    if not email:
        email = extract_email_from_message(log.message)
    return LogEntry.from_log(
        log,
        joined_email=email,
        joined_full_name=full_name,
    )


def logs_select_with_user():
    """SystemLog row + coalesced user email/name from users table."""
    resolved_email = func.coalesce(
        func.nullif(SystemLog.user_email, ""),
        User.email,
    )
    resolved_name = func.coalesce(
        func.nullif(SystemLog.user_full_name, ""),
        User.full_name,
    )
    return (
        select(SystemLog, resolved_email, resolved_name)
        .join(User, SystemLog.user_id == User.id, isouter=True)
    )
