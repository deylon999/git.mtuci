from __future__ import annotations

import csv
import io
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.submission import Submission
from app.models.user import User


async def build_course_grades_csv(
    session: AsyncSession,
    *,
    course_id: UUID,
) -> str:
    course = await session.get(Course, course_id)
    if not course:
        raise ValueError("Course not found")

    students_q = await session.execute(
        select(User)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc())
    )
    students = list(students_q.scalars().all())

    assignments_q = await session.execute(
        select(Assignment)
        .where(Assignment.course_id == course_id)
        .order_by(Assignment.deadline.asc())
    )
    assignments = list(assignments_q.scalars().all())

    assignment_ids = [a.id for a in assignments]
    submissions_map: dict[tuple[UUID, UUID], Submission] = {}
    if assignment_ids and students:
        subs_q = await session.execute(
            select(Submission).where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.student_id.in_([s.id for s in students]),
            )
        )
        for sub in subs_q.scalars().all():
            submissions_map[(sub.assignment_id, sub.student_id)] = sub

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    header = ["Студент", "Email", "Группа"] + [a.title for a in assignments] + ["Средний"]
    writer.writerow(header)

    for student in students:
        row: list[str] = [
            student.full_name,
            student.email,
            student.group_name or "",
        ]
        grades: list[float] = []
        for assignment in assignments:
            sub = submissions_map.get((assignment.id, student.id))
            if sub and sub.final_grade is not None:
                val = float(sub.final_grade)
            elif sub and sub.grade is not None:
                val = float(sub.grade)
            else:
                val = None
            row.append("" if val is None else str(round(val, 1)))
            if val is not None:
                grades.append(val)
        avg = round(sum(grades) / len(grades), 1) if grades else ""
        row.append(str(avg) if avg != "" else "")
        writer.writerow(row)

    return buffer.getvalue()
