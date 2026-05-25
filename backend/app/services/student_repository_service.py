from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.student_repository import StudentRepository
from app.models.user import User
from app.services.gitea_service import (
    create_repository_for_owner,
    ensure_repo_webhook,
    get_repo_metadata,
    resolve_repo_owner,
)
from app.utils.gitea_user import resolve_gitea_username
from app.utils.repo_name import build_student_assignment_repo_name


def build_student_repo_name(
    *,
    course_title: str,
    assignment_title: str,
    assignment_id: UUID,
    student_login: str,
) -> str:
    return build_student_assignment_repo_name(
        course_title=course_title,
        assignment_title=assignment_title,
        assignment_id=assignment_id,
        student_login=student_login,
    )


async def ensure_student_repository(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
) -> StudentRepository:
    existing_q = await session.execute(
        select(StudentRepository).where(
            StudentRepository.assignment_id == assignment_id,
            StudentRepository.student_id == student_id,
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing:
        return existing

    student = await session.get(User, student_id)
    if not student:
        raise ValueError("Student not found")

    row = await session.execute(
        select(Assignment.title, Course.title)
        .join(Course, Course.id == Assignment.course_id)
        .where(Assignment.id == assignment_id)
    )
    meta = row.one_or_none()
    if not meta:
        raise ValueError("Assignment not found")
    assignment_title, course_title = meta[0], meta[1]

    owner = resolve_gitea_username(student)
    repo_name = build_student_repo_name(
        course_title=course_title,
        assignment_title=assignment_title,
        assignment_id=assignment_id,
        student_login=owner,
    )

    await create_repository_for_owner(
        owner_username=owner,
        name=repo_name,
        description=f"{course_title} · {assignment_title}",
        private=True,
        auto_init=True,
    )
    await ensure_repo_webhook(owner=owner, repo_name=repo_name)

    record = StudentRepository(
        assignment_id=assignment_id,
        student_id=student_id,
        repo_name=repo_name,
    )
    session.add(record)
    await session.flush()
    return record


async def sync_assignment_repository_to_gitea(
    session: AsyncSession,
    *,
    student: User,
    student_repo: StudentRepository,
) -> tuple[str, str]:
    """Create assignment repo in Gitea under the student if it exists only in DB."""
    owner = resolve_gitea_username(student)
    repo_name = (student_repo.repo_name or "").strip()
    if not repo_name:
        raise ValueError("Репозиторий задания не настроен.")

    resolved = await resolve_repo_owner(primary_owner=owner, repo_name=repo_name)
    if await get_repo_metadata(owner=resolved, repo=repo_name):
        return resolved, repo_name

    await create_repository_for_owner(
        owner_username=owner,
        name=repo_name,
        description="Assignment repository",
        private=True,
        auto_init=True,
    )
    await ensure_repo_webhook(owner=owner, repo_name=repo_name)
    return owner, repo_name


async def resolve_assignment_repo_owner_and_name(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
) -> tuple[str, str]:
    """Gitea owner + repo name for a student's assignment repo (creates in Gitea if only in DB)."""
    student = await session.get(User, student_id)
    if not student:
        raise ValueError("Student not found")

    repo_q = await session.execute(
        select(StudentRepository).where(
            StudentRepository.assignment_id == assignment_id,
            StudentRepository.student_id == student_id,
        )
    )
    student_repo = repo_q.scalar_one_or_none()
    if not student_repo:
        raise ValueError("Student repository not found")

    primary = resolve_gitea_username(student)
    repo_name = (student_repo.repo_name or "").strip()
    if not repo_name:
        raise ValueError("Student repository not found")

    if not await get_repo_metadata(owner=primary, repo=repo_name):
        await sync_assignment_repository_to_gitea(
            session,
            student=student,
            student_repo=student_repo,
        )

    owner = await resolve_repo_owner(primary_owner=primary, repo_name=repo_name)
    return owner, repo_name


async def get_student_repo_name(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    student_id: UUID,
) -> str:
    repo_q = await session.execute(
        select(StudentRepository).where(
            StudentRepository.assignment_id == assignment_id,
            StudentRepository.student_id == student_id,
        )
    )
    repo = repo_q.scalar_one_or_none()
    if not repo:
        raise ValueError("Student repository not found")
    return repo.repo_name
