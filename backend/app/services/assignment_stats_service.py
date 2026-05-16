from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course_enrollment import CourseEnrollment
from app.models.submission import Submission
from app.schemas.assignment_stats import AssignmentStatsRead


async def get_assignment_stats(
    session: AsyncSession,
    *,
    course_id: UUID,
    assignment_id: UUID,
) -> AssignmentStatsRead:
    assignment_q = await session.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.course_id == course_id,
        )
    )
    assignment = assignment_q.scalar_one_or_none()
    if not assignment:
        raise ValueError("Assignment not found")

    students_count = int(
        await session.scalar(
            select(func.count())
            .select_from(CourseEnrollment)
            .where(CourseEnrollment.course_id == course_id)
        )
        or 0
    )

    subs_q = await session.execute(
        select(Submission).where(Submission.assignment_id == assignment_id)
    )
    submissions = list(subs_q.scalars().all())
    now = datetime.now(timezone.utc)

    submitted_count = sum(1 for s in submissions if s.submitted_at is not None)
    graded_count = sum(
        1 for s in submissions if s.grade is not None or s.final_grade is not None
    )
    pending_grade_count = sum(
        1
        for s in submissions
        if s.submitted_at is not None and s.grade is None and s.final_grade is None
    )
    overdue_count = max(0, students_count - submitted_count) if assignment.deadline < now else 0

    final_grades = [
        float(s.final_grade if s.final_grade is not None else s.grade)
        for s in submissions
        if s.grade is not None or s.final_grade is not None
    ]
    raw_grades = [float(s.grade) for s in submissions if s.grade is not None]

    return AssignmentStatsRead(
        assignment_id=assignment.id,
        course_id=course_id,
        title=assignment.title,
        students_total=students_count,
        submitted_count=submitted_count,
        graded_count=graded_count,
        pending_grade_count=pending_grade_count,
        overdue_count=overdue_count,
        average_grade=round(sum(raw_grades) / len(raw_grades), 1) if raw_grades else None,
        average_final_grade=round(sum(final_grades) / len(final_grades), 1) if final_grades else None,
    )
