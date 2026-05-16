from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.role_permissions import TrustedAssistant
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.teacher_dashboard import TeacherDashboardRead, TeacherGradingQueueItemRead


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
) -> list[TeacherGradingQueueItemRead]:
    course_ids = await _teacher_course_ids(session, user=user)
    if not course_ids:
        return []

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
            )
        )
    return items
