from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.user import User, UserRole
from app.schemas.course_roster import CourseStudentRead, EnrollByGroupResult
from app.services.course_service import enroll_student_to_course


async def list_course_students(
    session: AsyncSession,
    *,
    course_id: UUID,
) -> list[CourseStudentRead]:
    result = await session.execute(
        select(User, CourseEnrollment.enrolled_at)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .where(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc())
    )
    items: list[CourseStudentRead] = []
    for user, enrolled_at in result.all():
        items.append(
            CourseStudentRead(
                student_id=user.id,
                full_name=user.full_name,
                email=user.email,
                group_name=user.group_name,
                student_number=user.student_id,
                enrolled_at=enrolled_at,
            )
        )
    return items


async def unenroll_student_from_course(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
    student_id: UUID,
) -> None:
    course_q = await session.execute(select(Course).where(Course.id == course_id))
    course = course_q.scalar_one_or_none()
    if not course or course.teacher_id != teacher_id:
        raise PermissionError("Course not found or not owned by teacher")

    enrollment_q = await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id,
        )
    )
    enrollment = enrollment_q.scalar_one_or_none()
    if not enrollment:
        raise ValueError("Student is not enrolled in this course")

    await session.delete(enrollment)
    await session.commit()


async def enroll_group_to_course(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
    group_name: str,
) -> EnrollByGroupResult:
    normalized = group_name.strip()
    if not normalized:
        raise ValueError("Group name is required")

    students_q = await session.execute(
        select(User).where(
            User.role == UserRole.student,
            User.group_name == normalized,
            User.is_blocked.is_(False),
            User.is_pending.is_(False),
        )
    )
    students = list(students_q.scalars().all())

    enrolled_ids: list[UUID] = []
    skipped = 0
    for student in students:
        try:
            await enroll_student_to_course(
                session,
                teacher_id=teacher_id,
                course_id=course_id,
                student_id=student.id,
            )
            enrolled_ids.append(student.id)
        except PermissionError:
            raise
        except ValueError:
            skipped += 1

    return EnrollByGroupResult(
        group_name=normalized,
        enrolled=len(enrolled_ids),
        skipped=skipped,
        student_ids=enrolled_ids,
    )
