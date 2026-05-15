from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.repository import Repository
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.student_dashboard import (
    StudentActivityFeedItemRead,
    StudentActivitySummaryRead,
    StudentDashboardCourseRead,
    StudentDashboardKpiRead,
    StudentDashboardStatsRead,
    StudentDeadlineDetailRead,
    StudentDeadlineRead,
    StudentGroupRankingEntryRead,
    StudentGroupRankingRead,
    StudentRecentRepositoryRead,
    StudentSidebarCountsRead,
)
from app.services.course_service import list_student_courses
from app.services.gitea_service import GITEA_ADMIN_USERNAME, list_repo_commits_page

GITEA_OWNER = GITEA_ADMIN_USERNAME


def _start_of_day(dt: datetime) -> datetime:
    local = dt.astimezone(timezone.utc)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _is_same_day(a: datetime, b: datetime) -> bool:
    return _start_of_day(a) == _start_of_day(b)


def _score_color(score: int | None, score_max: int) -> str:
    if score is None:
        return "muted"
    ratio = score / score_max if score_max > 0 else 0
    if ratio >= 0.85:
        return "success"
    if ratio >= 0.6:
        return "warning"
    return "danger"


def _deadline_urgency(deadline: datetime, now: datetime) -> str:
    today = _start_of_day(now)
    tomorrow = today + timedelta(days=1)
    d = _start_of_day(deadline)
    if d <= today:
        return "danger"
    if d == tomorrow:
        return "warning"
    diff_days = (d - today).days
    if diff_days <= 3:
        return "info"
    return "muted"


def _deadlines_today_sub(titles: list[str], next_title: str | None) -> str:
    if titles:
        return " и ".join(titles[:2])
    if next_title:
        return f"Ближайший: {next_title}"
    return "На сегодня нет"


def _submission_points(sub: Submission) -> int:
    if sub.final_grade is not None:
        return int(round(sub.final_grade))
    if sub.grade is not None:
        return sub.grade
    return 0


async def _count_student_commits_week(session: AsyncSession, *, student_id: UUID, week_ago: datetime) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
            ActivityLog.created_at >= week_ago,
        )
    )
    return int(result.scalar() or 0)


async def _gitea_commit_count(gitea_repo_name: str | None) -> int | None:
    if not gitea_repo_name:
        return None
    try:
        commits, has_more = await list_repo_commits_page(
            owner=GITEA_OWNER,
            repo=gitea_repo_name,
            limit=100,
            page=1,
        )
        total = len(commits)
        if has_more:
            return max(total, 100)
        return total
    except Exception:
        return None


@dataclass
class _StudentAssignmentContext:
    courses: list[Course]
    all_assignments: list[Assignment]
    submissions_map: dict[UUID, Submission]
    course_title_by_id: dict[UUID, str]


async def _load_student_assignment_context(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> _StudentAssignmentContext:
    courses = await list_student_courses(session, student_id=student_id, group_name=group_name)
    course_ids = [c.id for c in courses]
    all_assignments: list[Assignment] = []
    if course_ids:
        a_result = await session.execute(select(Assignment).where(Assignment.course_id.in_(course_ids)))
        all_assignments = list(a_result.scalars().all())

    assignment_ids = [a.id for a in all_assignments]
    submissions_map: dict[UUID, Submission] = {}
    if assignment_ids:
        s_result = await session.execute(
            select(Submission).where(
                Submission.student_id == student_id,
                Submission.assignment_id.in_(assignment_ids),
            )
        )
        submissions_map = {s.assignment_id: s for s in s_result.scalars().all()}

    return _StudentAssignmentContext(
        courses=courses,
        all_assignments=all_assignments,
        submissions_map=submissions_map,
        course_title_by_id={c.id: c.title for c in courses},
    )


async def get_student_dashboard_stats(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> StudentDashboardStatsRead:
    now = datetime.now(timezone.utc)
    today_start = _start_of_day(now)
    week_ago = now - timedelta(days=7)

    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    courses = ctx.courses
    all_assignments = ctx.all_assignments
    submissions_map = ctx.submissions_map
    course_title_by_id = ctx.course_title_by_id

    teachers: dict[UUID, str] = {}
    if courses:
        teacher_ids = list({c.teacher_id for c in courses})
        t_result = await session.execute(select(User.id, User.full_name).where(User.id.in_(teacher_ids)))
        teachers = {row[0]: row[1] for row in t_result.all()}

    upcoming = sorted(
        [a for a in all_assignments if a.deadline >= today_start],
        key=lambda a: a.deadline,
    )
    deadlines_today_titles = [a.title for a in upcoming if _is_same_day(a.deadline, now)]
    next_title = upcoming[0].title if upcoming and not deadlines_today_titles else (
        upcoming[0].title if upcoming else None
    )

    pending_assignments = 0
    for a in upcoming:
        sub = submissions_map.get(a.id)
        if sub is None or sub.submitted_at is None:
            pending_assignments += 1

    personal_count = (
        await session.execute(
            select(func.count()).select_from(Repository).where(Repository.owner_id == student_id)
        )
    ).scalar() or 0
    assignment_repo_count = (
        await session.execute(
            select(func.count()).select_from(StudentRepository).where(StudentRepository.student_id == student_id)
        )
    ).scalar() or 0
    repos_total = int(personal_count) + int(assignment_repo_count)

    repos_week_delta = (
        await session.execute(
            select(func.count()).select_from(Repository).where(
                Repository.owner_id == student_id,
                Repository.created_at >= week_ago,
            )
        )
    ).scalar() or 0

    course_items: list[StudentDashboardCourseRead] = []
    for course in courses:
        course_assignments = [a for a in all_assignments if a.course_id == course.id]
        grades: list[float] = []
        for a in course_assignments:
            sub = submissions_map.get(a.id)
            if sub is None:
                continue
            if sub.final_grade is not None:
                grades.append(float(sub.final_grade))
            elif sub.grade is not None:
                grades.append(float(sub.grade))
        avg_score = round(sum(grades) / len(grades)) if grades else None
        course_items.append(
            StudentDashboardCourseRead(
                id=course.id,
                title=course.title,
                teacher_name=teachers.get(course.teacher_id, "—"),
                assignments_count=len(course_assignments),
                score=avg_score,
                score_max=course.grade_max,
                score_color=_score_color(avg_score, course.grade_max),
            )
        )

    commits_week = await _count_student_commits_week(session, student_id=student_id, week_ago=week_ago)
    commits_week_avg = round(commits_week / 7, 1) if commits_week > 0 else None

    kpi = StudentDashboardKpiRead(
        repos_total=repos_total,
        repos_week_delta=int(repos_week_delta),
        commits_week=commits_week,
        commits_week_avg=commits_week_avg,
        courses_active=len(courses),
        assignments_total=len(all_assignments),
        deadlines_today=len(deadlines_today_titles),
        deadlines_today_sub=_deadlines_today_sub(deadlines_today_titles, next_title),
    )
    sidebar = StudentSidebarCountsRead(
        courses_count=len(courses),
        assignments_pending=pending_assignments,
    )

    deadline_items = [
        StudentDeadlineRead(
            id=f"{a.course_id}-{a.id}",
            assignment_id=a.id,
            course_id=a.course_id,
            name=a.title,
            course=course_title_by_id.get(a.course_id, "—"),
            deadline=a.deadline,
            urgency=_deadline_urgency(a.deadline, now),
        )
        for a in upcoming[:20]
    ]

    return StudentDashboardStatsRead(
        kpi=kpi,
        sidebar=sidebar,
        courses=course_items,
        deadlines=deadline_items,
    )


async def get_student_deadlines(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 100,
) -> list[StudentDeadlineDetailRead]:
    now = datetime.now(timezone.utc)
    today_start = _start_of_day(now)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)

    upcoming = sorted(
        [a for a in ctx.all_assignments if a.deadline >= today_start],
        key=lambda a: a.deadline,
    )

    items: list[StudentDeadlineDetailRead] = []
    for a in upcoming[:limit]:
        sub = ctx.submissions_map.get(a.id)
        submitted = bool(sub and sub.submitted_at)
        items.append(
            StudentDeadlineDetailRead(
                id=f"{a.course_id}-{a.id}",
                assignment_id=a.id,
                course_id=a.course_id,
                name=a.title,
                course=ctx.course_title_by_id.get(a.course_id, "—"),
                deadline=a.deadline,
                urgency=_deadline_urgency(a.deadline, now),
                submitted=submitted,
            )
        )
    return items


async def get_student_recent_repositories(
    session: AsyncSession,
    *,
    student_id: UUID,
    limit: int = 5,
) -> list[StudentRecentRepositoryRead]:
    items: list[StudentRecentRepositoryRead] = []

    p_result = await session.execute(
        select(Repository)
        .where(Repository.owner_id == student_id)
        .order_by(Repository.updated_at.desc())
        .limit(limit * 2)
    )
    for repo in p_result.scalars().all():
        visibility = repo.repo_type.value if hasattr(repo.repo_type, "value") else str(repo.repo_type)
        items.append(
            StudentRecentRepositoryRead(
                id=str(repo.id),
                name=repo.name,
                assignment_label=None,
                language=repo.language,
                commits_count=None,
                updated_at=repo.updated_at,
                visibility=visibility,
                source="personal",
                repository_id=repo.id,
            )
        )

    ar_result = await session.execute(
        select(StudentRepository, Assignment, Course)
        .join(Assignment, Assignment.id == StudentRepository.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(StudentRepository.student_id == student_id)
        .order_by(StudentRepository.created_at.desc())
        .limit(limit * 2)
    )
    for student_repo, assignment, course in ar_result.all():
        items.append(
            StudentRecentRepositoryRead(
                id=str(student_repo.id),
                name=student_repo.repo_name,
                assignment_label=f"{course.title} · {assignment.title}",
                language=None,
                commits_count=None,
                updated_at=student_repo.created_at,
                visibility="private",
                source="assignment",
                course_id=course.id,
                assignment_id=assignment.id,
            )
        )

    items.sort(key=lambda x: x.updated_at, reverse=True)
    trimmed = items[:limit]

    personal = [item for item in trimmed if item.source == "personal" and item.repository_id]
    if personal:
        repo_ids = [item.repository_id for item in personal if item.repository_id]
        repo_rows = await session.execute(select(Repository).where(Repository.id.in_(repo_ids)))
        gitea_by_id = {r.id: r.gitea_repo_name for r in repo_rows.scalars().all()}
        counts = await asyncio.gather(
            *[_gitea_commit_count(gitea_by_id.get(item.repository_id)) for item in personal]
        )
        count_by_repo_id = {personal[i].repository_id: counts[i] for i in range(len(personal))}
        trimmed = [
            item.model_copy(update={"commits_count": count_by_repo_id[item.repository_id]})
            if item.repository_id in count_by_repo_id
            else item
            for item in trimmed
        ]

    return trimmed


async def get_student_activity_summary(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> StudentActivitySummaryRead:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)

    commits_week = await _count_student_commits_week(session, student_id=student_id, week_ago=week_ago)

    pr_result = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.activity_type == ActivityType.pull_request,
            ActivityLog.created_at >= week_ago,
        )
    )
    prs_open = int(pr_result.scalar() or 0)

    submitted = 0
    in_review = 0
    for sub in ctx.submissions_map.values():
        if sub.submitted_at and sub.submitted_at >= week_ago:
            submitted += 1
        if sub.submitted_at and sub.grade is None and sub.final_grade is None:
            in_review += 1

    pending = sum(
        1
        for a in ctx.all_assignments
        if a.deadline >= _start_of_day(now)
        and (
            (sub := ctx.submissions_map.get(a.id)) is None or sub.submitted_at is None
        )
    )
    submit_target = max(pending + submitted, 1)
    commits_part = min(commits_week / 20, 1.0) * 50
    submit_part = min(submitted / submit_target, 1.0) * 50
    week_progress_percent = min(100, int(commits_part + submit_part))

    return StudentActivitySummaryRead(
        week_progress_percent=week_progress_percent,
        commits=commits_week,
        prs_open=prs_open,
        submitted=submitted,
        in_review=in_review,
    )


def _feed_time_label(dt: datetime, now: datetime) -> str:
    diff = now - dt.astimezone(timezone.utc)
    minutes = int(diff.total_seconds() // 60)
    if minutes < 1:
        return "Только что"
    if minutes < 60:
        return f"{minutes} мин назад"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} ч назад"
    days = hours // 24
    if days == 1:
        return "Вчера"
    if days < 7:
        return f"{days} дн назад"
    return dt.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M")


async def get_student_activity_feed(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 12,
) -> list[StudentActivityFeedItemRead]:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=14)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    grade_max_by_course = {c.id: c.grade_max for c in ctx.courses}
    items: list[StudentActivityFeedItemRead] = []

    for assignment in ctx.all_assignments:
        sub = ctx.submissions_map.get(assignment.id)
        if sub and sub.graded_at and sub.graded_at >= since:
            score = _submission_points(sub)
            course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
            items.append(
                StudentActivityFeedItemRead(
                    id=f"grade-{sub.id}",
                    type="success",
                    text=f"{assignment.title} — ",
                    bold=f"оценка {score}",
                    text_after=f" · {course_title}",
                    time_label=_feed_time_label(sub.graded_at, now),
                    created_at=sub.graded_at,
                    badge=f"{score} / {grade_max_by_course.get(assignment.course_id, 100)}",
                    badge_variant="ok",
                    href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
                )
            )
        if sub and sub.comment and sub.comment.strip():
            updated_at = sub.graded_at or sub.submitted_at
            if updated_at and updated_at >= since:
                items.append(
                    StudentActivityFeedItemRead(
                        id=f"comment-{sub.id}",
                        type="comment",
                        text="Комментарий преподавателя к ",
                        bold=assignment.title,
                        text_after=f": «{sub.comment.strip()[:80]}{'…' if len(sub.comment.strip()) > 80 else ''}»",
                        time_label=_feed_time_label(updated_at, now),
                        created_at=updated_at,
                        badge="Новое",
                        badge_variant="warn",
                        href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
                    )
                )

    deadline_horizon = now + timedelta(days=3)
    for assignment in ctx.all_assignments:
        if assignment.deadline < now or assignment.deadline > deadline_horizon:
            continue
        sub = ctx.submissions_map.get(assignment.id)
        if sub and sub.submitted_at:
            continue
        days_left = (_start_of_day(assignment.deadline) - _start_of_day(now)).days
        days_label = "сегодня" if days_left <= 0 else f"{days_left} дн"
        course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
        items.append(
            StudentActivityFeedItemRead(
                id=f"deadline-{assignment.id}",
                type="deadline",
                text="Дедлайн ",
                bold=days_label,
                text_after=f" — {assignment.title} · {course_title}",
                time_label="Напоминание",
                created_at=assignment.deadline,
                badge=days_label,
                badge_variant="err" if days_left <= 1 else "warn",
                href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
            )
        )

    log_result = await session.execute(
        select(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.created_at >= since,
            ActivityLog.activity_type.in_(
                [
                    ActivityType.commit,
                    ActivityType.push,
                    ActivityType.pull_request,
                    ActivityType.pr_comment,
                    ActivityType.repo_created,
                ]
            ),
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(30)
    )
    for log in log_result.scalars().all():
        if log.activity_type in (ActivityType.commit, ActivityType.push):
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="commit",
                    text="Коммит в ",
                    bold=log.repo_name or "репозиторий",
                    text_after=f" — {log.message[:60] if log.message else ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.pull_request:
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="notification",
                    text="Pull Request в ",
                    bold=log.repo_name or "репозиторий",
                    text_after=f" — {log.message[:60] if log.message else ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.pr_comment:
            pr_match = re.search(r"PR #(\d+)", log.message or "")
            pr_label = f"#{pr_match.group(1)}" if pr_match else ""
            comment_tail = log.message or ""
            if ": " in comment_tail:
                comment_tail = comment_tail.split(": ", 1)[-1][:80]
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="comment",
                    text="Комментарий к Pull Request ",
                    bold=pr_label or "в репозитории",
                    text_after=f" {log.repo_name or ''} — «{comment_tail}»" if comment_tail else f" {log.repo_name or ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    badge="PR",
                    badge_variant="warn",
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.repo_created:
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="notification",
                    text="Создан репозиторий ",
                    bold=log.repo_name or "",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items[:limit]


async def get_student_group_ranking(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    student_full_name: str,
) -> StudentGroupRankingRead:
    if not group_name:
        return StudentGroupRankingRead(
            group_name=None,
            your_name=student_full_name,
            entries=[],
        )

    students_result = await session.execute(
        select(User.id, User.full_name).where(
            User.role == UserRole.student,
            User.group_name == group_name,
        )
    )
    students = list(students_result.all())
    if not students:
        return StudentGroupRankingRead(group_name=group_name, your_name=student_full_name, entries=[])

    student_ids = [row[0] for row in students]
    points_by_student: dict[UUID, int] = {sid: 0 for sid in student_ids}

    subs_result = await session.execute(
        select(Submission.student_id, Submission.grade, Submission.final_grade).where(
            Submission.student_id.in_(student_ids),
            or_(Submission.grade.is_not(None), Submission.final_grade.is_not(None)),
        )
    )
    for sid, grade, final_grade in subs_result.all():
        if final_grade is not None:
            points_by_student[sid] = points_by_student.get(sid, 0) + int(round(final_grade))
        elif grade is not None:
            points_by_student[sid] = points_by_student.get(sid, 0) + grade

    names = {row[0]: row[1] for row in students}
    ranked = sorted(
        [(sid, names.get(sid, "—"), points_by_student.get(sid, 0)) for sid in student_ids],
        key=lambda x: x[2],
        reverse=True,
    )

    your_place: int | None = None
    your_points: int | None = None
    entries: list[StudentGroupRankingEntryRead] = []
    for place, (sid, name, pts) in enumerate(ranked, start=1):
        is_you = sid == student_id
        if is_you:
            your_place = place
            your_points = pts
        if place <= 3 or is_you:
            display_name = f"{name} (Вы)" if is_you else name
            entries.append(
                StudentGroupRankingEntryRead(
                    place=place,
                    student_id=sid,
                    name=display_name,
                    points=pts,
                    is_you=is_you,
                )
            )

    total = len(ranked)
    top_percent_label: str | None = None
    if your_place is not None and total > 0:
        percentile = (your_place / total) * 100
        if percentile <= 10:
            top_percent_label = "Топ 10%"
        elif percentile <= 25:
            top_percent_label = "Топ 25%"

    return StudentGroupRankingRead(
        group_name=group_name,
        your_place=your_place,
        your_points=your_points,
        your_name=student_full_name,
        top_percent_label=top_percent_label,
        entries=entries,
    )
