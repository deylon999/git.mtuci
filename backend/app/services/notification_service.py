from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.notification import Notification
from app.models.repository import Repository
from app.models.role_permissions import TrustedAssistant
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.services.email_service import send_notification_email
from app.services.notification_delivery import deliver_notification, upsert_notification
from app.services.notification_prefs import STALE_REVIEW_HOURS, notification_prefs_from_user
from app.services.notification_realtime import push_notifications_updated
from app.services.student_dashboard_service import _load_student_assignment_context, _start_of_day, _submission_points
from app.services.user_settings_service import set_last_digest_at

_ADMIN_PENDING_DEDUPE = "admin:pending-users"


def _pending_count_from_message(message: str) -> int | None:
    match = re.search(r"(\d+)", message)
    return int(match.group(1)) if match else None


async def _sync_admin_pending_users_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    pending: int,
    now: datetime,
) -> bool:
    """Keep pending-users alert in sync; do not resurrect after the user marked it read."""
    result = await session.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == _ADMIN_PENDING_DEDUPE,
        )
    )
    existing = result.scalar_one_or_none()
    message = f"{pending} пользователь(ей) ждут подтверждения"
    title = "Ожидают одобрения"

    if pending <= 0:
        if existing:
            await session.delete(existing)
            return True
        return False

    if existing:
        previous = _pending_count_from_message(existing.message)
        if previous == pending:
            return False
        existing.title = title
        existing.message = message
        existing.href = "/users"
        if previous is not None and pending > previous:
            existing.read = False
        return True

    session.add(
        Notification(
            user_id=user_id,
            dedupe_key=_ADMIN_PENDING_DEDUPE,
            title=title,
            message=message,
            type="warning",
            href="/users",
            read=False,
            created_at=now,
        )
    )
    return True


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


async def notify_new_assignment_for_students(
    session: AsyncSession,
    *,
    assignment: Assignment,
    course_title: str,
    student_ids: list[UUID],
) -> int:
    if not student_ids:
        return 0
    result = await session.execute(select(User).where(User.id.in_(student_ids)))
    students = list(result.scalars().all())
    href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"
    created = 0
    for student in students:
        if await deliver_notification(
            session,
            student,
            category="assignments",
            dedupe_key=f"assignment-new:{assignment.id}",
            title="Новое задание",
            message=f"{assignment.title} · {course_title}",
            ntype="info",
            href=href,
            created_at=assignment.created_at,
        ):
            created += 1
    return created


async def notify_grade_posted(
    session: AsyncSession,
    *,
    student: User,
    assignment: Assignment,
    course_title: str,
    submission: Submission,
) -> bool:
    href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"
    return await deliver_notification(
        session,
        student,
        category="grades",
        dedupe_key=f"grade:{submission.id}",
        title="Новая оценка",
        message=f"{assignment.title} · {course_title}: {_submission_points(submission)} баллов",
        ntype="success",
        href=href,
        created_at=submission.graded_at,
    )


async def _sync_teacher_course_notifications(
    session: AsyncSession,
    *,
    user: User,
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
            if await deliver_notification(
                session,
                user,
                category="teacher_pr_submitted",
                dedupe_key=f"submission-new:{sub.id}",
                title="Новая сдача работы",
                message=f"{student_name} · {assignment.title} ({course_title})",
                ntype="info",
                href=href,
                created_at=sub.submitted_at,
            ):
                created += 1

        stale_before = now - timedelta(hours=STALE_REVIEW_HOURS)
        stale_result = await session.execute(
            select(Submission, Assignment, User)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .join(User, Submission.student_id == User.id)
            .where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.submitted_at.isnot(None),
                Submission.submitted_at <= stale_before,
                Submission.graded_at.is_(None),
            )
        )
        for sub, assignment, student in stale_result.all():
            course = course_by_id.get(assignment.course_id)
            course_title = course.title if course else "—"
            href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"
            student_name = student.full_name or student.email or "Студент"
            hours = max(0, int((now - sub.submitted_at).total_seconds() // 3600))
            if await deliver_notification(
                session,
                user,
                category="teacher_pr_stale",
                dedupe_key=f"submission-stale:{sub.id}",
                title="Работа без проверки >24ч",
                message=f"{student_name} · {assignment.title} ({course_title}) — {hours} ч",
                ntype="warning",
                href=href,
                created_at=now,
            ):
                created += 1

    for assignment in assignments:
        if assignment.deadline >= now:
            continue
        course = course_by_id.get(assignment.course_id)
        course_title = course.title if course else "—"
        href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"

        enrolled_result = await session.execute(
            select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == assignment.course_id)
        )
        enrolled_ids = list(enrolled_result.scalars().all())
        if not enrolled_ids:
            continue

        submitted_result = await session.execute(
            select(Submission.student_id).where(
                Submission.assignment_id == assignment.id,
                Submission.submitted_at.isnot(None),
            )
        )
        submitted_ids = set(submitted_result.scalars().all())

        for student_id in enrolled_ids:
            if student_id in submitted_ids:
                continue
            student_result = await session.execute(select(User).where(User.id == student_id))
            student = student_result.scalar_one_or_none()
            student_name = (
                (student.full_name or student.email or "Студент") if student else "Студент"
            )
            if await deliver_notification(
                session,
                user,
                category="teacher_deadline_missed",
                dedupe_key=f"teacher-missed:{assignment.id}:{student_id}",
                title="Просрочен дедлайн",
                message=f"{student_name} не сдал · {assignment.title} ({course_title})",
                ntype="error",
                href=href,
                created_at=now,
            ):
                created += 1

    return created


async def _maybe_send_teacher_daily_digest(
    session: AsyncSession,
    *,
    user: User,
    course_ids: list[UUID],
) -> bool:
    prefs = notification_prefs_from_user(user)
    if not prefs.teacher_daily_digest or not prefs.email or not user.email:
        return False

    now = datetime.now(timezone.utc)
    if prefs.last_digest_at and (now - prefs.last_digest_at) < timedelta(hours=24):
        return False

    pending_review = 0
    stale_count = 0
    missed_count = 0

    if course_ids:
        assignments_result = await session.execute(
            select(Assignment.id).where(Assignment.course_id.in_(course_ids))
        )
        assignment_ids = list(assignments_result.scalars().all())
        if assignment_ids:
            pending_review = int(
                await session.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.submitted_at.isnot(None),
                        Submission.graded_at.is_(None),
                    )
                )
                or 0
            )
            stale_before = now - timedelta(hours=STALE_REVIEW_HOURS)
            stale_count = int(
                await session.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.submitted_at.isnot(None),
                        Submission.submitted_at <= stale_before,
                        Submission.graded_at.is_(None),
                    )
                )
                or 0
            )

        assignments_past = await session.execute(
            select(Assignment).where(
                Assignment.course_id.in_(course_ids),
                Assignment.deadline < now,
            )
        )
        for assignment in assignments_past.scalars().all():
            enrolled_result = await session.execute(
                select(func.count()).select_from(CourseEnrollment).where(
                    CourseEnrollment.course_id == assignment.course_id
                )
            )
            total_enrolled = int(enrolled_result.scalar() or 0)
            submitted_result = await session.execute(
                select(func.count())
                .select_from(Submission)
                .where(
                    Submission.assignment_id == assignment.id,
                    Submission.submitted_at.isnot(None),
                )
            )
            submitted = int(submitted_result.scalar() or 0)
            missed_count += max(0, total_enrolled - submitted)

    lines = [
        f"Работ на проверке: {pending_review}",
        f"Без проверки >{STALE_REVIEW_HOURS} ч: {stale_count}",
        f"Просроченных сдач (студенты): {missed_count}",
    ]
    send_notification_email(
        user.email,
        subject="MTUCI — ежедневный дайджест",
        title="Сводка за день",
        message="\n".join(lines),
        action_path="/teacher/grading",
    )

    user.preferences = set_last_digest_at(
        user.preferences if isinstance(user.preferences, dict) else None,
        now,
    )
    session.add(user)
    return True


async def sync_user_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    group_name: str | None,
    role: UserRole,
) -> int:
    """Create notification rows for recent events (idempotent via dedupe_key)."""
    user = await session.get(User, user_id)
    if not user:
        return 0

    now = datetime.now(timezone.utc)
    since_grades = now - timedelta(days=30)
    since_new_assignments = now - timedelta(days=14)
    created = 0
    teacher_course_ids: list[UUID] = []

    if role == UserRole.student:
        ctx = await _load_student_assignment_context(session, student_id=user_id, group_name=group_name)

        for assignment in ctx.all_assignments:
            sub = ctx.submissions_map.get(assignment.id)
            course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
            href = f"/courses/{assignment.course_id}/assignments/{assignment.id}"

            if (
                assignment.created_at >= since_new_assignments
                and assignment.start_date <= now
            ):
                if await deliver_notification(
                    session,
                    user,
                    category="assignments",
                    dedupe_key=f"assignment-new:{assignment.id}",
                    title="Новое задание",
                    message=f"{assignment.title} · {course_title}",
                    ntype="info",
                    href=href,
                    created_at=assignment.created_at,
                ):
                    created += 1

            if sub and sub.graded_at and sub.graded_at >= since_grades:
                if await deliver_notification(
                    session,
                    user,
                    category="grades",
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
                    if await deliver_notification(
                        session,
                        user,
                        category="grades",
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
                    if await deliver_notification(
                        session,
                        user,
                        category="assignments",
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
        teacher_course_ids = list(course_by_id.keys())
        created += await _sync_teacher_course_notifications(
            session,
            user=user,
            course_ids=teacher_course_ids,
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
            teacher_course_ids = list(course_by_id.keys())
            created += await _sync_teacher_course_notifications(
                session,
                user=user,
                course_ids=teacher_course_ids,
                course_by_id=course_by_id,
                since=since_grades,
                now=now,
            )

    if role == UserRole.admin:
        pending = await session.scalar(select(func.count()).select_from(User).where(User.is_pending.is_(True))) or 0
        if await _sync_admin_pending_users_notification(
            session,
            user_id=user_id,
            pending=int(pending),
            now=now,
        ):
            created += 1
            await push_notifications_updated(user_id)

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
    pr_category = "assignments" if role == UserRole.student else "teacher_pr_submitted"
    for log in log_result.scalars().all():
        href = await _repo_pulls_href(session, log.repo_name)
        if await deliver_notification(
            session,
            user,
            category=pr_category,
            dedupe_key=f"pr-comment:{log.id}",
            title="Комментарий к Pull Request",
            message=log.message or f"Репозиторий {log.repo_name or ''}",
            ntype="info",
            href=href,
            created_at=log.created_at,
        ):
            created += 1

    if role in (UserRole.teacher, UserRole.laborant) and teacher_course_ids:
        if await _maybe_send_teacher_daily_digest(session, user=user, course_ids=teacher_course_ids):
            created += 1

    await session.commit()
    return created


async def list_notifications(
    session: AsyncSession,
    *,
    user_id: UUID,
    group_name: str | None,
    role: UserRole,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    await sync_user_notifications(session, user_id=user_id, group_name=group_name, role=role)
    result = await session.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
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
    user = await session.get(User, user_id)
    if not user:
        return
    href = await _repo_pulls_href(session, repo_name)
    category = "assignments" if user.role == UserRole.student else "teacher_pr_submitted"
    await deliver_notification(
        session,
        user,
        category=category,
        dedupe_key=f"pr-comment:{activity_log_id}",
        title=f"Комментарий к PR #{pr_number}",
        message=f"{repo_name}: {comment_preview[:200]}",
        ntype="info",
        href=href,
    )
    await session.commit()
