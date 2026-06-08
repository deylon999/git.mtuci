from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.course_file import CourseFile
from app.models.assignment import Assignment
from app.models.user import User, UserRole
from app.services.student_repository_service import ensure_student_repository


async def _enroll_students_by_target_groups(
    session: AsyncSession,
    *,
    course_id: UUID,
    target_groups: list[str] | None,
) -> int:
    """Зачислить всех активных студентов из выбранных групп."""
    if not target_groups:
        return 0
    normalized = sorted({g.strip() for g in target_groups if g and g.strip()})
    if not normalized:
        return 0

    students_q = await session.execute(
        select(User).where(
            User.role == UserRole.student,
            User.group_name.in_(normalized),
            User.is_blocked.is_(False),
            User.is_pending.is_(False),
        )
    )
    students = list(students_q.scalars().all())
    added = 0
    for student in students:
        existing_q = await session.execute(
            select(CourseEnrollment).where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.student_id == student.id,
            )
        )
        if existing_q.scalar_one_or_none():
            continue
        session.add(CourseEnrollment(course_id=course_id, student_id=student.id))
        added += 1
    if added:
        await session.flush()
    return added


async def create_course(
    session: AsyncSession,
    *,
    course_id: UUID | None = None,
    teacher_id: UUID,
    title: str,
    description: str | None,
    grade_max: int,
    target_groups: list[str] | None = None,
    files: list[dict] | None = None,
) -> Course:
    course_data = {
        "title": title,
        "description": description,
        "teacher_id": teacher_id,
        "grade_max": grade_max,
        "target_groups": target_groups,
        "files": [
            CourseFile(
                original_filename=file_info["original_filename"],
                storage_path=file_info["storage_path"],
                content_type=file_info.get("content_type"),
                file_size=file_info["file_size"],
            )
            for file_info in files or []
        ],
    }
    if course_id is not None:
        course_data["id"] = course_id
    course = Course(**course_data)
    session.add(course)
    await session.flush()
    await _enroll_students_by_target_groups(
        session,
        course_id=course.id,
        target_groups=target_groups,
    )
    await session.commit()
    await session.refresh(course)
    counts = await _get_enrolled_counts(session, [course.id])
    course.enrolled_count = counts.get(course.id, 0)
    return course


async def _get_enrolled_counts(session: AsyncSession, course_ids: list[UUID]) -> dict[UUID, int]:
    """Get enrolled student counts for given course IDs."""
    if not course_ids:
        return {}
    from sqlalchemy import func
    result = await session.execute(
        select(CourseEnrollment.course_id, func.count().label("count"))
        .where(CourseEnrollment.course_id.in_(course_ids))
        .group_by(CourseEnrollment.course_id)
    )
    return {row[0]: row[1] for row in result.all()}


async def list_all_courses(session: AsyncSession) -> list[Course]:
    result = await session.execute(
        select(Course).options(selectinload(Course.files)).order_by(Course.created_at.desc())
    )
    courses = list(result.scalars().all())
    counts = await _get_enrolled_counts(session, [c.id for c in courses])
    for course in courses:
        course._enrolled_count = counts.get(course.id, 0)
    return courses


async def list_teacher_courses(session: AsyncSession, *, teacher_id: UUID) -> list[Course]:
    result = await session.execute(
        select(Course)
        .options(selectinload(Course.files))
        .where(Course.teacher_id == teacher_id)
        .order_by(Course.created_at.desc())
    )
    courses = list(result.scalars().all())
    
    # Get enrolled counts
    counts = await _get_enrolled_counts(session, [c.id for c in courses])
    for course in courses:
        course.enrolled_count = counts.get(course.id, 0)
    
    return courses


async def list_student_courses(session: AsyncSession, *, student_id: UUID, group_name: str | None = None) -> list[Course]:
    """List courses available to student.
    
    Returns courses that:
    - Student is enrolled in, OR
    - Have no target_groups set (available to all), OR
    - Have student's group in target_groups
    """
    from sqlalchemy import or_
    
    # Get courses student is enrolled in
    enrolled_q = await session.execute(
        select(Course)
        .options(selectinload(Course.files))
        .join(
            CourseEnrollment,
            CourseEnrollment.course_id == Course.id,
        )
        .where(CourseEnrollment.student_id == student_id)
        .order_by(Course.created_at.desc())
    )
    enrolled_courses = list(enrolled_q.scalars().all())
    
    # Get courses available to student's group (or all if no target_groups)
    if group_name:
        # Courses with no target_groups OR courses including student's group
        available_q = await session.execute(
            select(Course)
            .options(selectinload(Course.files))
            .where(
                or_(
                    Course.target_groups.is_(None),
                    Course.target_groups == [],
                    Course.target_groups.any(group_name)
                )
            )
            .order_by(Course.created_at.desc())
        )
    else:
        # Only courses with no target_groups (available to all)
        available_q = await session.execute(
            select(Course)
            .options(selectinload(Course.files))
            .where(
                or_(
                    Course.target_groups.is_(None),
                    Course.target_groups == []
                )
            )
            .order_by(Course.created_at.desc())
        )
    
    available_courses = list(available_q.scalars().all())
    
    # Combine and deduplicate
    seen_ids = set()
    result_courses = []
    for course in enrolled_courses + available_courses:
        if course.id not in seen_ids:
            seen_ids.add(course.id)
            result_courses.append(course)
    
    # Get enrolled counts for all courses
    counts = await _get_enrolled_counts(session, [c.id for c in result_courses])
    for course in result_courses:
        course.enrolled_count = counts.get(course.id, 0)
    
    return result_courses


async def _student_can_access_course(
    session: AsyncSession,
    *,
    course: Course,
    student_id: UUID,
    group_name: str | None,
) -> bool:
    enrollment_q = await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course.id,
            CourseEnrollment.student_id == student_id,
        )
    )
    if enrollment_q.scalar_one_or_none():
        return True

    target_groups = course.target_groups
    if target_groups is None or len(target_groups) == 0:
        return True
    return group_name is not None and group_name in list(target_groups)


async def get_course_for_user(
    session: AsyncSession,
    *,
    user: User,
    course_id: UUID,
) -> Course:
    """Return course if the user may access it (teacher owner, laborant assistant, student, or admin)."""
    from app.services.teacher_dashboard_service import _teacher_course_ids

    course_q = await session.execute(
        select(Course).options(selectinload(Course.files)).where(Course.id == course_id)
    )
    course = course_q.scalar_one_or_none()
    if not course:
        raise ValueError("Course not found")

    if user.role == UserRole.teacher:
        if course.teacher_id != user.id:
            raise PermissionError("Access denied")
    elif user.role == UserRole.laborant:
        allowed_ids = await _teacher_course_ids(session, user=user)
        if course.id not in allowed_ids:
            raise PermissionError("Access denied")
    elif user.role == UserRole.student:
        if not await _student_can_access_course(
            session,
            course=course,
            student_id=user.id,
            group_name=user.group_name,
        ):
            raise PermissionError("Access denied")
    elif user.role == UserRole.admin:
        pass
    else:
        raise PermissionError("Access denied")

    counts = await _get_enrolled_counts(session, [course.id])
    course.enrolled_count = counts.get(course.id, 0)
    return course


async def delete_teacher_course(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
) -> None:
    course_q = await session.execute(select(Course).where(Course.id == course_id))
    course = course_q.scalar_one_or_none()
    if not course:
        raise ValueError("Course not found")
    if course.teacher_id != teacher_id:
        raise PermissionError("Course not found or not owned by teacher")

    await session.delete(course)
    await session.commit()


async def delete_course_for_actor(
    session: AsyncSession,
    *,
    actor: User,
    course_id: UUID,
) -> None:
    course_q = await session.execute(
        select(Course).options(selectinload(Course.files)).where(Course.id == course_id)
    )
    course = course_q.scalar_one_or_none()
    if not course:
        raise ValueError("Course not found")

    if actor.role == UserRole.teacher and course.teacher_id != actor.id:
        raise PermissionError("Course not found or not owned by teacher")
    if actor.role not in {UserRole.teacher, UserRole.admin}:
        raise PermissionError("Access denied")

    await session.delete(course)
    await session.commit()


async def enroll_student_to_course(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
    student_id: UUID,
) -> CourseEnrollment:
    course_q = await session.execute(select(Course).where(Course.id == course_id))
    course = course_q.scalar_one_or_none()
    if not course or course.teacher_id != teacher_id:
        raise PermissionError("Course not found or not owned by teacher")

    student_q = await session.execute(select(User).where(User.id == student_id))
    student = student_q.scalar_one_or_none()
    if not student or student.role != UserRole.student:
        raise ValueError("Student not found")

    existing_q = await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id,
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing:
        return existing

    enrollment = CourseEnrollment(course_id=course_id, student_id=student_id)
    session.add(enrollment)

    # Для нового студента создаём персональные репозитории для всех заданий курса.
    assignments_q = await session.execute(select(Assignment.id).where(Assignment.course_id == course_id))
    assignment_ids = list(assignments_q.scalars().all())
    for assignment_id in assignment_ids:
        await ensure_student_repository(
            session,
            assignment_id=assignment_id,
            student_id=student_id,
        )

    await session.commit()
    await session.refresh(enrollment)
    return enrollment

