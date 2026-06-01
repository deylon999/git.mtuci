from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User
from app.services.notification_classification import (
    NotificationEventType,
    build_classification_context,
    classify_notification,
    detect_notification_event_type,
)
from app.services.email_service import send_notification_email
from app.services.notification_prefs import NotificationCategory, notification_prefs_from_user
from app.services.notification_realtime import push_notifications_updated


async def upsert_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    dedupe_key: str,
    title: str,
    message: str,
    ntype: str,
    href: str | None = None,
    created_at: datetime | None = None,
    event_type: NotificationEventType | None = None,
) -> bool:
    result = await session.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    if result.scalar_one_or_none():
        return False

    resolved_event_type = event_type or detect_notification_event_type(
        title=title,
        message=message,
        href=href,
        ntype=ntype,
    )
    context = await build_classification_context(
        session,
        user_id=user_id,
        event_type=resolved_event_type,
        title=title,
        message=message,
        href=href,
        created_at=created_at,
    )
    severity, actionable = classify_notification(resolved_event_type, context)

    session.add(
        Notification(
            user_id=user_id,
            dedupe_key=dedupe_key,
            title=title,
            message=message,
            type=ntype,
            severity=severity,
            actionable=actionable,
            event_type=resolved_event_type,
            href=href,
            read=False,
            created_at=created_at or datetime.now(timezone.utc),
        )
    )
    return True


async def deliver_notification(
    session: AsyncSession,
    user: User,
    *,
    category: NotificationCategory,
    dedupe_key: str,
    title: str,
    message: str,
    ntype: str,
    href: str | None = None,
    created_at: datetime | None = None,
    email_subject: str | None = None,
    event_type: NotificationEventType | None = None,
) -> bool:
    """Create in-app notification when category is enabled; optionally send email."""
    prefs = notification_prefs_from_user(user)
    if not prefs.category_enabled(category):
        return False

    created = await upsert_notification(
        session,
        user_id=user.id,
        dedupe_key=dedupe_key,
        title=title,
        message=message,
        ntype=ntype,
        href=href,
        created_at=created_at,
        event_type=event_type,
    )
    if not created:
        return False

    if prefs.email and user.email:
        link = href or "/"
        full_href = link if link.startswith("http") else None
        send_notification_email(
            user.email,
            subject=email_subject or title,
            title=title,
            message=message,
            action_path=link,
            action_url=full_href,
        )

    await push_notifications_updated(user.id)
    return True


async def notify_users(
    session: AsyncSession,
    users: list[User],
    **kwargs,
) -> int:
    count = 0
    for user in users:
        if await deliver_notification(session, user, **kwargs):
            count += 1
    return count
