from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.repository import Repository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.admin_reports import AdminCourseSummaryRead, AdminReportsOverviewRead


async def get_admin_reports_overview(session: AsyncSession) -> AdminReportsOverviewRead:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = int(await session.scalar(select(func.count()).select_from(User)) or 0)
    pending_users = int(
        await session.scalar(select(func.count()).select_from(User).where(User.is_pending.is_(True)))
        or 0
    )
    total_students = int(
        await session.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.student)
        )
        or 0
    )
    total_teachers = int(
        await session.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.teacher)
        )
        or 0
    )
    total_courses = int(await session.scalar(select(func.count()).select_from(Course)) or 0)
    total_repositories = int(await session.scalar(select(func.count()).select_from(Repository)) or 0)
    submissions_pending_grade = int(
        await session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(
                Submission.submitted_at.is_not(None),
                Submission.grade.is_(None),
                Submission.final_grade.is_(None),
            )
        )
        or 0
    )
    activity_today = int(
        await session.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(ActivityLog.created_at >= today_start)
        )
        or 0
    )

    courses_q = await session.execute(
        select(Course).order_by(Course.created_at.desc()).limit(12)
    )
    courses = list(courses_q.scalars().all())
    course_ids = [c.id for c in courses]

    students_by_course: dict = {}
    assignments_by_course: dict = {}
    if course_ids:
        enroll_counts = await session.execute(
            select(CourseEnrollment.course_id, func.count())
            .where(CourseEnrollment.course_id.in_(course_ids))
            .group_by(CourseEnrollment.course_id)
        )
        students_by_course = {row[0]: int(row[1]) for row in enroll_counts.all()}

        assign_counts = await session.execute(
            select(Assignment.course_id, func.count())
            .where(Assignment.course_id.in_(course_ids))
            .group_by(Assignment.course_id)
        )
        assignments_by_course = {row[0]: int(row[1]) for row in assign_counts.all()}

    teacher_ids = list({c.teacher_id for c in courses})
    teachers_map: dict = {}
    if teacher_ids:
        teachers_q = await session.execute(
            select(User.id, User.full_name).where(User.id.in_(teacher_ids))
        )
        teachers_map = {row[0]: row[1] for row in teachers_q.all()}

    course_summaries = [
        AdminCourseSummaryRead(
            id=str(c.id),
            title=c.title,
            teacher_name=teachers_map.get(c.teacher_id, "—"),
            students_count=students_by_course.get(c.id, 0),
            assignments_count=assignments_by_course.get(c.id, 0),
        )
        for c in courses
    ]

    return AdminReportsOverviewRead(
        total_users=total_users,
        pending_users=pending_users,
        total_students=total_students,
        total_teachers=total_teachers,
        total_courses=total_courses,
        total_repositories=total_repositories,
        submissions_pending_grade=submissions_pending_grade,
        activity_today=activity_today,
        courses=course_summaries,
    )
