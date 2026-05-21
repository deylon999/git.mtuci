from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student_repository import StudentRepository
from app.models.user import User
from app.services.gitea_service import (
    create_repository_for_owner,
    ensure_repo_webhook,
    get_repo_metadata,
    resolve_repo_owner,
)
from app.utils.gitea_user import resolve_gitea_username


def build_student_repo_name(*, assignment_id: UUID, student_id: UUID) -> str:
    return f"assignment_{assignment_id}_student_{student_id}"


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

    owner = resolve_gitea_username(student)
    repo_name = build_student_repo_name(assignment_id=assignment_id, student_id=student_id)

    await create_repository_for_owner(
        owner_username=owner,
        name=repo_name,
        description="Assignment repository",
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
