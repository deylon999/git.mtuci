from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.user import User
from app.schemas.admin_forks import AdminForkEventRead, AdminForkEventsRead, AdminForkStatsRead


def _parse_fork_target(message: str | None) -> str | None:
    if not message:
        return None
    text = message.strip()
    if text.startswith("→"):
        return text[1:].strip() or None
    return text or None


def _activity_to_event(log: ActivityLog, user: User) -> AdminForkEventRead:
    event_type = (
        log.activity_type.value if hasattr(log.activity_type, "value") else str(log.activity_type)
    )
    source = log.repo_name
    target: str | None = None
    if event_type == "fork":
        target = _parse_fork_target(log.message)
    elif event_type == "repo_created":
        target = log.repo_name

    return AdminForkEventRead(
        id=log.id,
        event_type=event_type,
        user_id=user.id,
        user_full_name=user.full_name,
        user_login=log.user_login or user.mtuci_login,
        source_repo=source,
        target_repo=target,
        message=log.message,
        created_at=log.created_at,
    )


async def get_admin_fork_events(
    session: AsyncSession,
    *,
    limit: int = 200,
    offset: int = 0,
    event_type: str | None = None,
) -> AdminForkEventsRead:
    types: list[ActivityType] = [ActivityType.fork, ActivityType.repo_created]
    if event_type == "fork":
        types = [ActivityType.fork]
    elif event_type in ("repo_created", "created"):
        types = [ActivityType.repo_created]

    base_filter = ActivityLog.activity_type.in_(types)

    total = int(
        await session.scalar(select(func.count()).select_from(ActivityLog).where(base_filter)) or 0
    )
    forks_count = int(
        await session.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(ActivityLog.activity_type == ActivityType.fork)
        )
        or 0
    )
    created_count = int(
        await session.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(ActivityLog.activity_type == ActivityType.repo_created)
        )
        or 0
    )

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = int(
        await session.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(base_filter, ActivityLog.created_at >= today_start)
        )
        or 0
    )
    unique_users = int(
        await session.scalar(
            select(func.count(func.distinct(ActivityLog.user_id))).select_from(ActivityLog).where(
                base_filter
            )
        )
        or 0
    )

    result = await session.execute(
        select(ActivityLog, User)
        .join(User, User.id == ActivityLog.user_id)
        .where(base_filter)
        .order_by(ActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    events = [_activity_to_event(log, user) for log, user in result.all()]

    return AdminForkEventsRead(
        stats=AdminForkStatsRead(
            total=total,
            forks_count=forks_count,
            created_count=created_count,
            today_count=today_count,
            unique_users=unique_users,
        ),
        events=events,
    )
