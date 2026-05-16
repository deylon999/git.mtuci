from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.user import User, UserRole
from app.services.notification_service import notify_new_assignment_for_students
from app.services.student_repository_service import ensure_student_repository


async def create_assignment(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
    title: str,
    description: str | None,
    start_date: datetime,
    deadline: datetime,
    late_penalty_periods: list[dict[str, int]],
    files: list[dict] | None = None,
) -> Assignment:
    from app.models.assignment_file import AssignmentFile
    
    course_q = await session.execute(select(Course).where(Course.id == course_id))
    course = course_q.scalar_one_or_none()
    if not course or course.teacher_id != teacher_id:
        raise PermissionError("Course not found or not owned by teacher")
    if start_date > deadline:
        raise ValueError("start_date must be less than or equal to deadline")
    for p in late_penalty_periods:
        weeks = int(p.get("weeks", 0))
        max_grade = int(p.get("max_grade", -1))
        if weeks <= 0:
            raise ValueError("late_penalty_periods.weeks must be > 0")
        if max_grade < 0:
            raise ValueError("late_penalty_periods.max_grade must be >= 0")

    assignment_id = uuid4()

    # Создаём запись задания.
    assignment = Assignment(
        id=assignment_id,
        course_id=course_id,
        title=title,
        description=description,
        start_date=start_date,
        deadline=deadline,
        late_penalty_periods=late_penalty_periods,
        gitea_repo_name=None,
    )

    session.add(assignment)
    await session.flush()

    # Сохраняем файлы задания.
    if files:
        for file_info in files:
            file_record = AssignmentFile(
                assignment_id=assignment_id,
                original_filename=file_info["original_filename"],
                storage_path=file_info["storage_path"],
                content_type=file_info.get("content_type"),
                file_size=file_info["file_size"],
            )
            session.add(file_record)

    # Для нового задания создаём персональный репозиторий каждому текущему студенту курса.
    enrolled_q = await session.execute(
        select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course_id)
    )
    enrolled_student_ids = list(enrolled_q.scalars().all())
    for student_id in enrolled_student_ids:
        await ensure_student_repository(
            session,
            assignment_id=assignment.id,
            student_id=student_id,
        )

    await session.commit()
    await session.refresh(assignment)
    await notify_new_assignment_for_students(
        session,
        assignment=assignment,
        course_title=course.title,
        student_ids=enrolled_student_ids,
    )
    await session.commit()
    return assignment


async def list_assignments_for_teacher(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
) -> list[Assignment]:
    course_q = await session.execute(select(Course).where(Course.id == course_id))
    course = course_q.scalar_one_or_none()
    if not course or course.teacher_id != teacher_id:
        raise PermissionError("Course not found or not owned by teacher")

    result = await session.execute(
        select(Assignment)
        .where(Assignment.course_id == course_id)
        .order_by(Assignment.deadline.asc())
    )
    return list(result.scalars().all())


async def list_assignments_for_student(
    session: AsyncSession,
    *,
    student_id: UUID,
    course_id: UUID,
    student_group_name: str | None = None,
) -> list[Assignment]:
    # Check if student is enrolled
    enrollment_q = await session.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id,
        )
    )
    enrollment = enrollment_q.scalar_one_or_none()
    
    if not enrollment:
        # Auto-enroll if student has access via target_groups
        course_q = await session.execute(
            select(Course).where(Course.id == course_id)
        )
        course = course_q.scalar_one_or_none()
        if not course:
            raise PermissionError("Course not found")
        
        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Auto-enroll check: course.target_groups={course.target_groups}, student_group={student_group_name}")
        
        # Check if course allows access (no target_groups or student's group in list)
        # Handle SQLAlchemy ARRAY properly - convert to Python list if needed
        target_groups = course.target_groups
        if target_groups is None or len(target_groups) == 0:
            can_access = True
        else:
            can_access = student_group_name is not None and student_group_name in list(target_groups)
        
        logger.info(f"can_access={can_access}")
        
        if not can_access:
            raise PermissionError("Not enrolled and no access")
        
        # Auto-enroll student (check if already enrolled first)
        existing_enrollment_q = await session.execute(
            select(CourseEnrollment).where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.student_id == student_id,
            )
        )
        existing_enrollment = existing_enrollment_q.scalar_one_or_none()
        
        if not existing_enrollment:
            enrollment = CourseEnrollment(course_id=course_id, student_id=student_id)
            session.add(enrollment)
            await session.flush()
        
        # Create repos for all existing assignments
        assignments_q = await session.execute(
            select(Assignment.id).where(Assignment.course_id == course_id)
        )
        assignment_ids = list(assignments_q.scalars().all())
        for assignment_id in assignment_ids:
            await ensure_student_repository(
                session,
                assignment_id=assignment_id,
                student_id=student_id,
            )
        
        if not existing_enrollment:
            await session.commit()

    result = await session.execute(
        select(Assignment)
        .where(Assignment.course_id == course_id)
        .order_by(Assignment.deadline.asc())
    )
    return list(result.scalars().all())


async def delete_assignment(
    session: AsyncSession,
    *,
    teacher_id: UUID,
    course_id: UUID,
    assignment_id: UUID,
) -> None:
    """Delete assignment if teacher owns the course."""
    from app.models.course import Course
    from app.models.student_repository import StudentRepository
    from app.models.submission import Submission
    from sqlalchemy import delete
    
    # Check course exists and teacher owns it
    course_q = await session.execute(
        select(Course).where(Course.id == course_id, Course.teacher_id == teacher_id)
    )
    course = course_q.scalar_one_or_none()
    if not course:
        raise PermissionError("Course not found or teacher access only")
    
    # Check assignment exists in this course
    assignment_q = await session.execute(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.course_id == course_id,
        )
    )
    assignment = assignment_q.scalar_one_or_none()
    if not assignment:
        raise ValueError("Assignment not found")
    
    # Delete related student repositories first
    await session.execute(
        delete(StudentRepository).where(StudentRepository.assignment_id == assignment_id)
    )
    
    # Delete related submissions
    await session.execute(
        delete(Submission).where(Submission.assignment_id == assignment_id)
    )
    
    # Delete the assignment
    await session.execute(delete(Assignment).where(Assignment.id == assignment_id))
    await session.commit()

