from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.notification import Notification
from app.models.repository import Repository
from app.models.role_permissions import TrustedAssistant
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.services.notification_realtime import push_notifications_updated
from app.services.student_dashboard_service import _load_student_assignment_context, _start_of_day, _submission_points


async def _repo_pulls_href(session: AsyncSession, repo_name: str | None) -> str:
    if not repo_name:
        return "/repositories"
    short = repo_name.split("/")[-1] if "/" in repo_name else repo_name
    result = await session.execute(
        select(Repository.id)
        .where(
            or_(
                Repository.gitea_repo_name == repo_name,
                Repository.gitea_repo_name == short,
                Repository.name == short,
            )
        )
        .limit(1)
    )
    repo_id = result.scalar_one_or_none()
    return f"/repositories/{repo_id}/pulls" if repo_id else "/repositories"


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
) -> bool:
    result = await session.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    if result.scalar_one_or_none():
        return False

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
    return True


async def _sync_teacher_course_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    course_ids: list[UUID],
    course_by_id: dict[UUID, Course],
    since: datetime,
    now: datetime,
) -> int:
    if not course_ids:
        return 0

    created = 0
    assignments_result = await session.execute(select(Assignment).where(Assignment.course_id.in_(course_ids)))
    assignments = list(assignments_result.scalars().all())
    assignment_ids = [a.id for a in assignments]

    if assignment_ids:
        subs_result = await session.execute(
            select(Submission, Assignment, User)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .join(User, Submission.student_id == User.id)
            .where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.submitted_at.isnot(None),
                Submission.submitted_at >= since,
                Submission.graded_at.is_(None),
            )
        )
        for sub, assignment, student in subs_result.all():
            course = course_by_id.get(assignment.course_id)
            course_title = course.title if course else "—"
            href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"
            student_name = student.full_name or student.email or "Студент"
            if await _upsert_notification(
                session,
                user_id=user_id,
                dedupe_key=f"submission-new:{sub.id}",
                title="Новая сдача работы",
                message=f"{student_name} · {assignment.title} ({course_title})",
                ntype="info",
                href=href,
                created_at=sub.submitted_at,
            ):
                created += 1

    for assignment in assignments:
        if assignment.deadline < _start_of_day(now) or assignment.deadline > now + timedelta(days=7):
            continue
        course = course_by_id.get(assignment.course_id)
        course_title = course.title if course else "—"
        days_left = (_start_of_day(assignment.deadline) - _start_of_day(now)).days
        href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"
        if await _upsert_notification(
            session,
            user_id=user_id,
            dedupe_key=f"teacher-deadline:{assignment.id}",
            title="Дедлайн задания",
            message=f"{assignment.title} · {course_title} — через {max(days_left, 0)} дн.",
            ntype="error" if days_left <= 1 else "warning",
            href=href,
            created_at=now,
        ):
            created += 1

    return created


async def sync_user_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    group_name: str | None,
    role: UserRole,
) -> int:
    """Create notification rows for recent events (idempotent via dedupe_key)."""
    now = datetime.now(timezone.utc)
    since_grades = now - timedelta(days=30)
    created = 0

    if role == UserRole.student:
        ctx = await _load_student_assignment_context(session, student_id=user_id, group_name=group_name)

        for assignment in ctx.all_assignments:
            sub = ctx.submissions_map.get(assignment.id)
            course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
            href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"

            if sub and sub.graded_at and sub.graded_at >= since_grades:
                if await _upsert_notification(
                    session,
                    user_id=user_id,
                    dedupe_key=f"grade:{sub.id}",
                    title="Новая оценка",
                    message=f"{assignment.title} · {course_title}: {_submission_points(sub)} баллов",
                    ntype="success",
                    href=href,
                    created_at=sub.graded_at,
                ):
                    created += 1

            if sub and sub.comment and sub.comment.strip():
                updated_at = sub.graded_at or sub.submitted_at
                if updated_at and updated_at >= since_grades:
                    preview = sub.comment.strip()[:120]
                    if await _upsert_notification(
                        session,
                        user_id=user_id,
                        dedupe_key=f"teacher-comment:{sub.id}",
                        title="Комментарий преподавателя",
                        message=f"{assignment.title}: {preview}",
                        ntype="warning",
                        href=href,
                        created_at=updated_at,
                    ):
                        created += 1

            if assignment.deadline >= _start_of_day(now) and assignment.deadline <= now + timedelta(days=7):
                if sub is None or sub.submitted_at is None:
                    days_left = (_start_of_day(assignment.deadline) - _start_of_day(now)).days
                    if await _upsert_notification(
                        session,
                        user_id=user_id,
                        dedupe_key=f"deadline:{assignment.id}",
                        title="Приближается дедлайн",
                        message=f"{assignment.title} · {course_title} — через {max(days_left, 0)} дн.",
                        ntype="error" if days_left <= 1 else "warning",
                        href=href,
                        created_at=now,
                    ):
                        created += 1

    if role == UserRole.teacher:
        courses_result = await session.execute(select(Course).where(Course.teacher_id == user_id))
        courses = list(courses_result.scalars().all())
        course_by_id = {c.id: c for c in courses}
        created += await _sync_teacher_course_notifications(
            session,
            user_id=user_id,
            course_ids=list(course_by_id.keys()),
            course_by_id=course_by_id,
            since=since_grades,
            now=now,
        )

    if role == UserRole.laborant:
        teacher_ids_result = await session.execute(
            select(TrustedAssistant.teacher_id).where(
                TrustedAssistant.assistant_id == user_id,
                TrustedAssistant.can_grade.is_(True),
            )
        )
        teacher_ids = list(teacher_ids_result.scalars().all())
        if teacher_ids:
            courses_result = await session.execute(select(Course).where(Course.teacher_id.in_(teacher_ids)))
            courses = list(courses_result.scalars().all())
            course_by_id = {c.id: c for c in courses}
            created += await _sync_teacher_course_notifications(
                session,
                user_id=user_id,
                course_ids=list(course_by_id.keys()),
                course_by_id=course_by_id,
                since=since_grades,
                now=now,
            )

    if role == UserRole.admin:
        pending = await session.scalar(select(func.count()).select_from(User).where(User.is_pending.is_(True))) or 0
        if pending > 0:
            if await _upsert_notification(
                session,
                user_id=user_id,
                dedupe_key="admin:pending-users",
                title="Ожидают одобрения",
                message=f"{pending} пользователь(ей) ждут подтверждения",
                ntype="warning",
                href="/users",
                created_at=now,
            ):
                created += 1

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
        href = await _repo_pulls_href(session, log.repo_name)
        if await _upsert_notification(
            session,
            user_id=user_id,
            dedupe_key=f"pr-comment:{log.id}",
            title="Комментарий к Pull Request",
            message=log.message or f"Репозиторий {log.repo_name or ''}",
            ntype="info",
            href=href,
            created_at=log.created_at,
        ):
            created += 1

    await session.commit()
    if created > 0:
        await push_notifications_updated(user_id)
    return created


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
    ok = result.rowcount > 0
    if ok:
        await push_notifications_updated(user_id)
    return ok


async def mark_all_notifications_read(session: AsyncSession, *, user_id: UUID) -> int:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
        .values(read=True)
    )
    await session.commit()
    count = result.rowcount or 0
    if count > 0:
        await push_notifications_updated(user_id)
    return count


async def delete_notification(session: AsyncSession, *, user_id: UUID, notification_id: UUID) -> bool:
    result = await session.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    await session.delete(row)
    await session.commit()
    await push_notifications_updated(user_id)
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
    href = await _repo_pulls_href(session, repo_name)
    created = await _upsert_notification(
        session,
        user_id=user_id,
        dedupe_key=f"pr-comment:{activity_log_id}",
        title=f"Комментарий к PR #{pr_number}",
        message=f"{repo_name}: {comment_preview[:200]}",
        ntype="info",
        href=href,
    )
    await session.commit()
    if created:
        await push_notifications_updated(user_id)
