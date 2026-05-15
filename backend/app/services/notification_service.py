from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.notification import Notification
from app.models.user import UserRole
from app.services.student_dashboard_service import _load_student_assignment_context, _start_of_day, _submission_points


async def _upsert_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    dedupe_key: str,
    title: str,
    message: str,
    ntype: str,
    href: str | None = None,
    created_at: datetime | None = None,
) -> None:
    result = await session.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return

    session.add(
        Notification(
            user_id=user_id,
            dedupe_key=dedupe_key,
            title=title,
            message=message,
            type=ntype,
            href=href,
            read=False,
            created_at=created_at or datetime.now(timezone.utc),
        )
    )


async def sync_user_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    group_name: str | None,
    role: UserRole,
) -> None:
    """Create notification rows for recent events (idempotent via dedupe_key)."""
    now = datetime.now(timezone.utc)
    since_grades = now - timedelta(days=30)

    if role == UserRole.student:
        ctx = await _load_student_assignment_context(session, student_id=user_id, group_name=group_name)

        for assignment in ctx.all_assignments:
            sub = ctx.submissions_map.get(assignment.id)
            course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
            href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"

            if sub and sub.graded_at and sub.graded_at >= since_grades:
                score = _submission_points(sub)
                await _upsert_notification(
                    session,
                    user_id=user_id,
                    dedupe_key=f"grade:{sub.id}",
                    title="Новая оценка",
                    message=f"{assignment.title} · {course_title}: {score} баллов",
                    ntype="success",
                    href=href,
                    created_at=sub.graded_at,
                )

            if sub and sub.comment and sub.comment.strip():
                updated_at = sub.graded_at or sub.submitted_at
                if updated_at and updated_at >= since_grades:
                    preview = sub.comment.strip()[:120]
                    await _upsert_notification(
                        session,
                        user_id=user_id,
                        dedupe_key=f"teacher-comment:{sub.id}",
                        title="Комментарий преподавателя",
                        message=f"{assignment.title}: {preview}",
                        ntype="warning",
                        href=href,
                        created_at=updated_at,
                    )

            if assignment.deadline >= _start_of_day(now) and assignment.deadline <= now + timedelta(days=7):
                if sub is None or sub.submitted_at is None:
                    days_left = (_start_of_day(assignment.deadline) - _start_of_day(now)).days
                    await _upsert_notification(
                        session,
                        user_id=user_id,
                        dedupe_key=f"deadline:{assignment.id}",
                        title="Приближается дедлайн",
                        message=f"{assignment.title} · {course_title} — через {max(days_left, 0)} дн.",
                        ntype="error" if days_left <= 1 else "warning",
                        href=href,
                        created_at=now,
                    )

    log_result = await session.execute(
        select(ActivityLog)
        .where(
            ActivityLog.user_id == user_id,
            ActivityLog.activity_type == ActivityType.pr_comment,
            ActivityLog.created_at >= since_grades,
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(50)
    )
    for log in log_result.scalars().all():
        await _upsert_notification(
            session,
            user_id=user_id,
            dedupe_key=f"pr-comment:{log.id}",
            title="Комментарий к Pull Request",
            message=log.message or f"Репозиторий {log.repo_name or ''}",
            ntype="info",
            href="/repositories",
            created_at=log.created_at,
        )

    await session.commit()


async def list_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    group_name: str | None,
    role: UserRole,
    limit: int = 50,
) -> list[Notification]:
    await sync_user_notifications(session, user_id=user_id, group_name=group_name, role=role)
    result = await session.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def mark_notification_read(session: AsyncSession, *, user_id: UUID, notification_id: UUID) -> bool:
    result = await session.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(read=True)
    )
    await session.commit()
    return result.rowcount > 0


async def mark_all_notifications_read(session: AsyncSession, *, user_id: UUID) -> int:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
        .values(read=True)
    )
    await session.commit()
    return result.rowcount or 0


async def delete_notification(session: AsyncSession, *, user_id: UUID, notification_id: UUID) -> bool:
    result = await session.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    await session.delete(row)
    await session.commit()
    return True


async def create_pr_comment_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    repo_name: str,
    pr_number: int,
    comment_preview: str,
    activity_log_id: UUID,
) -> None:
    await _upsert_notification(
        session,
        user_id=user_id,
        dedupe_key=f"pr-comment:{activity_log_id}",
        title=f"Комментарий к PR #{pr_number}",
        message=f"{repo_name}: {comment_preview[:200]}",
        ntype="info",
        href="/repositories",
    )
    await session.commit()
