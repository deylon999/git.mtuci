from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.role_permissions import TrustedAssistant
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.teacher_dashboard import (
    TeacherActivityItemRead,
    TeacherCourseDetailRead,
    TeacherCourseListItemRead,
    TeacherCourseStudentDetailRead,
    TeacherCourseWeekActivityRead,
    TeacherDashboardActivityDayRead,
    TeacherDashboardCommitRead,
    TeacherDashboardCourseSummaryRead,
    TeacherDashboardDeadlineRead,
    TeacherDashboardFullRead,
    TeacherDashboardPendingWorkRead,
    TeacherDashboardRead,
    TeacherGradingQueueItemRead,
    TeacherGradingQueueStatsRead,
    TeacherStudentListItemRead,
    TeacherStudentsSummaryRead,
    TeacherTemplateRepoRead,
)

STALE_HOURS = 48


async def _teacher_course_ids(session: AsyncSession, *, user: User) -> list[UUID]:
    if user.role == UserRole.teacher:
        result = await session.execute(select(Course.id).where(Course.teacher_id == user.id))
        return list(result.scalars().all())

    if user.role == UserRole.laborant:
        teacher_ids_result = await session.execute(
            select(TrustedAssistant.teacher_id).where(
                TrustedAssistant.assistant_id == user.id,
                TrustedAssistant.can_grade.is_(True),
            )
        )
        teacher_ids = list(teacher_ids_result.scalars().all())
        if not teacher_ids:
            return []
        result = await session.execute(select(Course.id).where(Course.teacher_id.in_(teacher_ids)))
        return list(result.scalars().all())

    return []


async def _enrolled_student_ids(session: AsyncSession, course_ids: list[UUID]) -> list[UUID]:
    if not course_ids:
        return []
    result = await session.execute(
        select(func.distinct(CourseEnrollment.student_id)).where(
            CourseEnrollment.course_id.in_(course_ids)
        )
    )
    return [row[0] for row in result.all()]


def _department_from_user(user: User) -> str | None:
    prefs = user.preferences if isinstance(user.preferences, dict) else {}
    dept = prefs.get("department") or prefs.get("department_name")
    return str(dept).strip() if dept else None


def _waiting_meta(submitted_at: datetime, *, now: datetime) -> tuple[float, bool]:
    delta = now - submitted_at
    hours = max(0.0, delta.total_seconds() / 3600.0)
    return hours, hours >= STALE_HOURS


async def get_teacher_dashboard(session: AsyncSession, *, user: User) -> TeacherDashboardRead:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return TeacherDashboardRead(
            courses_count=0,
            students_total=0,
            assignments_total=0,
            pending_grading=0,
            submissions_this_week=0,
            overdue_assignments=0,
        )

    courses_count = len(course_ids)
    students_total = int(
        await session.scalar(
            select(func.count(func.distinct(CourseEnrollment.student_id))).where(
                CourseEnrollment.course_id.in_(course_ids)
            )
        )
        or 0
    )
    assignments_total = int(
        await session.scalar(
            select(func.count()).select_from(Assignment).where(Assignment.course_id.in_(course_ids))
        )
        or 0
    )
    pending_grading = int(
        await session.scalar(
            select(func.count())
            .select_from(Submission)
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(
                Assignment.course_id.in_(course_ids),
                Submission.submitted_at.is_not(None),
                Submission.grade.is_(None),
                Submission.final_grade.is_(None),
            )
        )
        or 0
    )
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    submissions_this_week = int(
        await session.scalar(
            select(func.count())
            .select_from(Submission)
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(
                Assignment.course_id.in_(course_ids),
                Submission.submitted_at.is_not(None),
                Submission.submitted_at >= week_ago,
            )
        )
        or 0
    )
    now = datetime.now(timezone.utc)
    overdue_assignments = int(
        await session.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.course_id.in_(course_ids), Assignment.deadline < now)
        )
        or 0
    )

    return TeacherDashboardRead(
        courses_count=courses_count,
        students_total=students_total,
        assignments_total=assignments_total,
        pending_grading=pending_grading,
        submissions_this_week=submissions_this_week,
        overdue_assignments=overdue_assignments,
    )


async def get_teacher_dashboard_full(session: AsyncSession, *, user: User) -> TeacherDashboardFullRead:
    course_ids = await _teacher_course_ids(session, user=user)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if not course_ids:
        return TeacherDashboardFullRead(
            greeting_name=user.full_name,
            department=_department_from_user(user),
            active_courses_count=0,
            students_total=0,
            pending_grading=0,
            commits_today=0,
        )

    base = await get_teacher_dashboard(session, user=user)
    student_ids = await _enrolled_student_ids(session, course_ids)

    commits_today = 0
    if student_ids:
        commits_today = int(
            await session.scalar(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.user_id.in_(student_ids),
                    ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
                    ActivityLog.created_at >= today_start,
                )
            )
            or 0
        )

    queue = await get_teacher_grading_queue(session, user=user, limit=5)
    pending_work = [
        TeacherDashboardPendingWorkRead(
            submission_id=item.submission_id,
            student_id=item.student_id,
            student_name=item.student_name,
            assignment_id=item.assignment_id,
            assignment_title=item.assignment_title,
            course_id=item.course_id,
            course_title=item.course_title,
            submitted_at=item.submitted_at,
            repo_name=item.repo_name,
            waiting_hours=item.waiting_hours,
            is_stale=item.is_stale,
        )
        for item in queue
    ]

    recent_commits: list[TeacherDashboardCommitRead] = []
    if student_ids:
        commit_rows = await session.execute(
            select(ActivityLog, User.full_name)
            .join(User, User.id == ActivityLog.user_id, isouter=True)
            .where(
                ActivityLog.user_id.in_(student_ids),
                ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
            )
            .order_by(ActivityLog.created_at.desc())
            .limit(12)
        )
        for log, name in commit_rows.all():
            recent_commits.append(
                TeacherDashboardCommitRead(
                    student_id=log.user_id,
                    student_name=name or log.user_login or "Студент",
                    repo_name=log.repo_name,
                    message=log.message,
                    created_at=log.created_at,
                )
            )

    courses_result = await session.execute(
        select(Course).where(Course.id.in_(course_ids)).order_by(Course.title)
    )
    courses = list(courses_result.scalars().all())
    course_summaries: list[TeacherDashboardCourseSummaryRead] = []
    for course in courses:
        students_count = int(
            await session.scalar(
                select(func.count()).select_from(CourseEnrollment).where(
                    CourseEnrollment.course_id == course.id
                )
            )
            or 0
        )
        assignments_count = int(
            await session.scalar(
                select(func.count()).select_from(Assignment).where(Assignment.course_id == course.id)
            )
            or 0
        )
        pending_count = int(
            await session.scalar(
                select(func.count())
                .select_from(Submission)
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .where(
                    Assignment.course_id == course.id,
                    Submission.submitted_at.is_not(None),
                    Submission.grade.is_(None),
                    Submission.final_grade.is_(None),
                )
            )
            or 0
        )
        course_summaries.append(
            TeacherDashboardCourseSummaryRead(
                course_id=course.id,
                title=course.title,
                students_count=students_count,
                assignments_count=assignments_count,
                pending_count=pending_count,
            )
        )

    deadlines: list[TeacherDashboardDeadlineRead] = []
    deadline_rows = await session.execute(
        select(Assignment, Course)
        .join(Course, Course.id == Assignment.course_id)
        .where(Assignment.course_id.in_(course_ids), Assignment.deadline >= now - timedelta(days=1))
        .order_by(Assignment.deadline.asc())
        .limit(8)
    )
    for assignment, course in deadline_rows.all():
        total_students = int(
            await session.scalar(
                select(func.count()).select_from(CourseEnrollment).where(
                    CourseEnrollment.course_id == course.id
                )
            )
            or 0
        )
        submitted_count = int(
            await session.scalar(
                select(func.count())
                .select_from(Submission)
                .where(
                    Submission.assignment_id == assignment.id,
                    Submission.submitted_at.is_not(None),
                )
            )
            or 0
        )
        deadlines.append(
            TeacherDashboardDeadlineRead(
                assignment_id=assignment.id,
                assignment_title=assignment.title,
                course_id=course.id,
                course_title=course.title,
                deadline=assignment.deadline,
                submitted_count=submitted_count,
                total_students=total_students,
            )
        )

    activity_by_day: list[TeacherDashboardActivityDayRead] = []
    if student_ids:
        week_start = now - timedelta(days=6)
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        day_rows = await session.execute(
            select(
                func.date_trunc("day", ActivityLog.created_at).label("day"),
                func.count().label("cnt"),
            )
            .where(
                ActivityLog.user_id.in_(student_ids),
                ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
                ActivityLog.created_at >= week_start,
            )
            .group_by("day")
            .order_by("day")
        )
        counts_by_date: dict[str, int] = {}
        for day_val, cnt in day_rows.all():
            if day_val is None:
                continue
            d = day_val.date() if hasattr(day_val, "date") else day_val
            counts_by_date[str(d)] = int(cnt)
        for i in range(7):
            d = (week_start + timedelta(days=i)).date()
            key = str(d)
            activity_by_day.append(
                TeacherDashboardActivityDayRead(date=key, commits=counts_by_date.get(key, 0))
            )

    return TeacherDashboardFullRead(
        greeting_name=user.full_name,
        department=_department_from_user(user),
        active_courses_count=base.courses_count,
        students_total=base.students_total,
        pending_grading=base.pending_grading,
        commits_today=commits_today,
        pending_work=pending_work,
        recent_commits=recent_commits,
        courses=course_summaries,
        deadlines=deadlines,
        activity_by_day=activity_by_day,
    )


async def list_assistant_courses(session: AsyncSession, *, user: User) -> list[Course]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []
    result = await session.execute(
        select(Course).where(Course.id.in_(course_ids)).order_by(Course.created_at.desc())
    )
    return list(result.scalars().all())


async def get_teacher_grading_queue(
    session: AsyncSession,
    *,
    user: User,
    limit: int = 100,
    course_id: UUID | None = None,
) -> list[TeacherGradingQueueItemRead]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []
    if course_id is not None:
        if course_id not in course_ids:
            return []
        course_ids = [course_id]

    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(Submission, Assignment, Course, User, StudentRepository)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .join(User, User.id == Submission.student_id)
        .outerjoin(
            StudentRepository,
            and_(
                StudentRepository.assignment_id == Assignment.id,
                StudentRepository.student_id == Submission.student_id,
            ),
        )
        .where(
            Course.id.in_(course_ids),
            Submission.submitted_at.is_not(None),
            Submission.grade.is_(None),
            Submission.final_grade.is_(None),
        )
        .order_by(Submission.submitted_at.asc())
        .limit(limit)
    )

    items: list[TeacherGradingQueueItemRead] = []
    for submission, assignment, course, student, student_repo in result.all():
        if submission.submitted_at is None:
            continue
        hours, is_stale = _waiting_meta(submission.submitted_at, now=now)
        items.append(
            TeacherGradingQueueItemRead(
                submission_id=submission.id,
                student_id=student.id,
                student_name=student.full_name,
                assignment_id=assignment.id,
                assignment_title=assignment.title,
                course_id=course.id,
                course_title=course.title,
                submitted_at=submission.submitted_at,
                repo_name=student_repo.repo_name if student_repo else None,
                waiting_hours=round(hours, 1),
                is_stale=is_stale,
            )
        )
    return items


async def get_teacher_grading_queue_stats(
    session: AsyncSession,
    *,
    user: User,
    course_id: UUID | None = None,
) -> TeacherGradingQueueStatsRead:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return TeacherGradingQueueStatsRead(pending=0, stale=0, graded_today=0, avg_waiting_hours=None)
    if course_id is not None:
        if course_id not in course_ids:
            return TeacherGradingQueueStatsRead(pending=0, stale=0, graded_today=0, avg_waiting_hours=None)
        course_ids = [course_id]

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    pending_rows = await session.execute(
        select(Submission.submitted_at)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Course.id.in_(course_ids),
            Submission.submitted_at.is_not(None),
            Submission.grade.is_(None),
            Submission.final_grade.is_(None),
        )
    )
    submitted_ats = [row[0] for row in pending_rows.all() if row[0] is not None]
    stale = 0
    hours_sum = 0.0
    for submitted_at in submitted_ats:
        hours, is_stale = _waiting_meta(submitted_at, now=now)
        if is_stale:
            stale += 1
        hours_sum += hours
    pending = len(submitted_ats)
    avg_hours = round(hours_sum / pending, 1) if pending else None

    graded_today_result = await session.execute(
        select(func.count())
        .select_from(Submission)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Course.id.in_(course_ids),
            Submission.graded_at.is_not(None),
            Submission.graded_at >= today_start,
        )
    )
    graded_today = int(graded_today_result.scalar() or 0)

    return TeacherGradingQueueStatsRead(
        pending=pending,
        stale=stale,
        graded_today=graded_today,
        avg_waiting_hours=avg_hours,
    )


async def list_teacher_courses_enriched(
    session: AsyncSession, *, user: User
) -> list[TeacherCourseListItemRead]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(Course).where(Course.id.in_(course_ids)).order_by(Course.created_at.desc())
    )
    courses = list(result.scalars().all())
    items: list[TeacherCourseListItemRead] = []
    for course in courses:
        students_count = int(
            await session.scalar(
                select(func.count()).select_from(CourseEnrollment).where(
                    CourseEnrollment.course_id == course.id
                )
            )
            or 0
        )
        assignments_count = int(
            await session.scalar(
                select(func.count()).select_from(Assignment).where(Assignment.course_id == course.id)
            )
            or 0
        )
        pending_count = int(
            await session.scalar(
                select(func.count())
                .select_from(Submission)
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .where(
                    Assignment.course_id == course.id,
                    Submission.submitted_at.is_not(None),
                    Submission.grade.is_(None),
                    Submission.final_grade.is_(None),
                )
            )
            or 0
        )
        nearest = await session.execute(
            select(Assignment)
            .where(Assignment.course_id == course.id, Assignment.deadline >= now)
            .order_by(Assignment.deadline.asc())
            .limit(1)
        )
        nearest_assignment = nearest.scalar_one_or_none()
        submitted_count = 0
        if assignments_count > 0 and students_count > 0:
            submitted_count = int(
                await session.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .join(Assignment, Assignment.id == Submission.assignment_id)
                    .where(
                        Assignment.course_id == course.id,
                        Submission.submitted_at.is_not(None),
                    )
                )
                or 0
            )
        total_slots = assignments_count * students_count
        submitted_percent = (
            round(submitted_count / total_slots * 100, 1) if total_slots > 0 else None
        )
        items.append(
            TeacherCourseListItemRead(
                course_id=course.id,
                title=course.title,
                description=course.description,
                students_count=students_count,
                assignments_count=assignments_count,
                pending_count=pending_count,
                grade_max=course.grade_max,
                target_groups=list(course.target_groups or []),
                nearest_deadline=nearest_assignment.deadline if nearest_assignment else None,
                nearest_deadline_title=nearest_assignment.title if nearest_assignment else None,
                submitted_percent=submitted_percent,
            )
        )
    return items


async def list_teacher_students(
    session: AsyncSession,
    *,
    user: User,
    limit: int = 500,
) -> TeacherStudentsSummaryRead:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return TeacherStudentsSummaryRead(
            students_total=0,
            active_this_week=0,
            average_grade=None,
            pending_grading=0,
        )

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    enroll_rows = await session.execute(
        select(CourseEnrollment.student_id, CourseEnrollment.course_id, Course.title, User)
        .join(User, User.id == CourseEnrollment.student_id)
        .join(Course, Course.id == CourseEnrollment.course_id)
        .where(CourseEnrollment.course_id.in_(course_ids))
    )

    by_student: dict[UUID, dict] = {}
    for student_id, course_id, course_title, student_user in enroll_rows.all():
        bucket = by_student.setdefault(
            student_id,
            {
                "user": student_user,
                "courses": [],
                "course_ids": [],
            },
        )
        if course_title not in bucket["courses"]:
            bucket["courses"].append(course_title)
        bucket["course_ids"].append(course_id)

    pending_grading = int(
        await session.scalar(
            select(func.count())
            .select_from(Submission)
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(
                Assignment.course_id.in_(course_ids),
                Submission.submitted_at.is_not(None),
                Submission.grade.is_(None),
                Submission.final_grade.is_(None),
            )
        )
        or 0
    )

    grade_rows = await session.execute(
        select(func.avg(Submission.final_grade))
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.course_id.in_(course_ids),
            Submission.final_grade.is_not(None),
        )
    )
    avg_grade_val = grade_rows.scalar_one_or_none()
    average_grade = round(float(avg_grade_val), 1) if avg_grade_val is not None else None

    items: list[TeacherStudentListItemRead] = []
    active_this_week = 0

    for student_id, data in list(by_student.items())[:limit]:
        student_user: User = data["user"]
        last_activity = await session.scalar(
            select(func.max(ActivityLog.created_at)).where(ActivityLog.user_id == student_id)
        )
        if last_activity and last_activity >= week_ago:
            active_this_week += 1

        repos_count = int(
            await session.scalar(
                select(func.count())
                .select_from(StudentRepository)
                .join(Assignment, Assignment.id == StudentRepository.assignment_id)
                .where(
                    StudentRepository.student_id == student_id,
                    Assignment.course_id.in_(course_ids),
                )
            )
            or 0
        )
        commits_total = int(
            await session.scalar(
                select(func.count())
                .select_from(ActivityLog)
                .where(
                    ActivityLog.user_id == student_id,
                    ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
                )
            )
            or 0
        )
        student_avg = await session.scalar(
            select(func.avg(Submission.final_grade))
            .join(Assignment, Assignment.id == Submission.assignment_id)
            .where(
                Submission.student_id == student_id,
                Assignment.course_id.in_(course_ids),
                Submission.final_grade.is_not(None),
            )
        )
        if last_activity is None:
            activity_status = "inactive"
        elif last_activity >= week_ago:
            activity_status = "active"
        elif last_activity >= now - timedelta(days=30):
            activity_status = "idle"
        else:
            activity_status = "inactive"

        items.append(
            TeacherStudentListItemRead(
                student_id=student_id,
                full_name=student_user.full_name,
                email=student_user.email,
                group_name=student_user.group_name,
                courses=data["courses"],
                course_ids=data["course_ids"],
                repositories_count=repos_count,
                commits_total=commits_total,
                last_activity_at=last_activity,
                average_grade=round(float(student_avg), 1) if student_avg is not None else None,
                activity_status=activity_status,
            )
        )

    items.sort(key=lambda x: x.full_name.lower())

    return TeacherStudentsSummaryRead(
        students_total=len(by_student),
        active_this_week=active_this_week,
        average_grade=average_grade,
        pending_grading=pending_grading,
        items=items,
    )


async def list_teacher_activity(
    session: AsyncSession,
    *,
    user: User,
    limit: int = 80,
    course_id: UUID | None = None,
) -> list[TeacherActivityItemRead]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []
    if course_id is not None:
        if course_id not in course_ids:
            return []
        course_ids = [course_id]

    student_ids = await _enrolled_student_ids(session, course_ids)
    if not student_ids:
        return []

    rows = await session.execute(
        select(ActivityLog, User.full_name)
        .join(User, User.id == ActivityLog.user_id, isouter=True)
        .where(ActivityLog.user_id.in_(student_ids))
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    return [
        TeacherActivityItemRead(
            id=log.id,
            activity_type=log.activity_type.value,
            student_name=name or log.user_login,
            repo_name=log.repo_name,
            message=log.message,
            created_at=log.created_at,
        )
        for log, name in rows.all()
    ]


def _activity_status(last_activity: datetime | None, *, now: datetime, week_ago: datetime) -> str:
    if last_activity is None:
        return "inactive"
    if last_activity >= week_ago:
        return "active"
    if last_activity >= now - timedelta(days=30):
        return "idle"
    return "inactive"


async def get_teacher_course_detail(
    session: AsyncSession,
    *,
    user: User,
    course_id: UUID,
) -> TeacherCourseDetailRead:
    course_ids = await _teacher_course_ids(session, user=user)
    if course_id not in course_ids:
        raise PermissionError("Course not found")

    course = await session.get(Course, course_id)
    if not course:
        raise ValueError("Course not found")

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    assignments_q = await session.execute(
        select(Assignment).where(Assignment.course_id == course_id).order_by(Assignment.deadline.asc())
    )
    assignments = list(assignments_q.scalars().all())
    assignment_ids = [a.id for a in assignments]

    students_q = await session.execute(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc())
    )
    students = list(students_q.scalars().all())
    student_ids = [s.id for s in students]

    subs_map: dict[tuple[UUID, UUID], Submission] = {}
    if assignment_ids and student_ids:
        subs_q = await session.execute(
            select(Submission).where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.student_id.in_(student_ids),
            )
        )
        for sub in subs_q.scalars().all():
            subs_map[(sub.assignment_id, sub.student_id)] = sub

    pending_grading = sum(
        1
        for sub in subs_map.values()
        if sub.submitted_at is not None and sub.grade is None and sub.final_grade is None
    )

    final_grades = [
        float(sub.final_grade if sub.final_grade is not None else sub.grade)
        for sub in subs_map.values()
        if sub.grade is not None or sub.final_grade is not None
    ]
    average_grade = round(sum(final_grades) / len(final_grades), 1) if final_grades else None

    total_slots = len(assignments) * len(students) if assignments and students else 0
    graded_slots = sum(
        1
        for sub in subs_map.values()
        if sub.grade is not None or sub.final_grade is not None
    )
    completion_percent = round(graded_slots / total_slots * 100, 1) if total_slots else None

    activity_by_week: list[TeacherCourseWeekActivityRead] = []
    if student_ids:
        for week_offset in range(4):
            start = now - timedelta(days=(3 - week_offset) * 7 + 7)
            end = now - timedelta(days=(3 - week_offset) * 7)
            cnt = int(
                await session.scalar(
                    select(func.count())
                    .select_from(ActivityLog)
                    .where(
                        ActivityLog.user_id.in_(student_ids),
                        ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
                        ActivityLog.created_at >= start,
                        ActivityLog.created_at < end,
                    )
                )
                or 0
            )
            label = start.strftime("%d.%m")
            activity_by_week.append(TeacherCourseWeekActivityRead(week_label=label, commits=cnt))

    student_details: list[TeacherCourseStudentDetailRead] = []
    for student in students:
        completed = 0
        grades: list[float] = []
        for a in assignments:
            sub = subs_map.get((a.id, student.id))
            if not sub:
                continue
            if sub.submitted_at is not None or sub.grade is not None or sub.final_grade is not None:
                completed += 1
            if sub.final_grade is not None:
                grades.append(float(sub.final_grade))
            elif sub.grade is not None:
                grades.append(float(sub.grade))
        last_activity = await session.scalar(
            select(func.max(ActivityLog.created_at)).where(ActivityLog.user_id == student.id)
        )
        student_details.append(
            TeacherCourseStudentDetailRead(
                student_id=student.id,
                full_name=student.full_name,
                email=student.email,
                group_name=student.group_name,
                completed_assignments=completed,
                total_assignments=len(assignments),
                average_grade=round(sum(grades) / len(grades), 1) if grades else None,
                last_activity_at=last_activity,
                activity_status=_activity_status(last_activity, now=now, week_ago=week_ago),
            )
        )

    return TeacherCourseDetailRead(
        course_id=course.id,
        title=course.title,
        description=course.description,
        grade_max=course.grade_max,
        target_groups=list(course.target_groups or []),
        students_count=len(students),
        assignments_count=len(assignments),
        average_grade=average_grade,
        completion_percent=completion_percent,
        pending_grading=pending_grading,
        activity_by_week=activity_by_week,
        students=student_details,
    )


async def list_teacher_templates(
    session: AsyncSession,
    *,
    user: User,
) -> list[TeacherTemplateRepoRead]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []

    rows = await session.execute(
        select(Assignment.gitea_repo_name, Assignment.title, Assignment.created_at, Course.title)
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Assignment.course_id.in_(course_ids),
            Assignment.gitea_repo_name.is_not(None),
            Assignment.gitea_repo_name != "",
        )
    )

    by_repo: dict[str, dict] = {}
    for repo_name, assignment_title, created_at, course_title in rows.all():
        name = str(repo_name).strip()
        if not name:
            continue
        bucket = by_repo.setdefault(
            name,
            {
                "assignments_count": 0,
                "courses": set(),
                "last_assignment_at": None,
                "description": assignment_title,
            },
        )
        bucket["assignments_count"] += 1
        bucket["courses"].add(course_title)
        if bucket["last_assignment_at"] is None or (
            created_at and created_at > bucket["last_assignment_at"]
        ):
            bucket["last_assignment_at"] = created_at
            bucket["description"] = assignment_title

    items = [
        TeacherTemplateRepoRead(
            repo_name=name,
            description=data["description"],
            assignments_count=data["assignments_count"],
            courses=sorted(data["courses"]),
            last_assignment_at=data["last_assignment_at"],
        )
        for name, data in sorted(by_repo.items(), key=lambda x: x[0].lower())
    ]
    return items


async def build_teacher_students_csv(session: AsyncSession, *, user: User) -> str:
    import csv
    import io

    summary = await list_teacher_students(session, user=user, limit=5000)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "ФИО",
            "Email",
            "Группа",
            "Курсы",
            "Репозиториев",
            "Коммитов",
            "Средний балл",
            "Активность",
            "Последняя активность",
        ]
    )
    for s in summary.items:
        writer.writerow(
            [
                s.full_name,
                s.email,
                s.group_name or "",
                "; ".join(s.courses),
                s.repositories_count,
                s.commits_total,
                s.average_grade if s.average_grade is not None else "",
                s.activity_status,
                s.last_activity_at.isoformat() if s.last_activity_at else "",
            ]
        )
    return buffer.getvalue()
