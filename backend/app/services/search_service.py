from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.repository import Repository
from app.models.user import User, UserRole
from app.schemas.search import SearchHitRead, SearchResponseRead
from app.services.teacher_dashboard_service import _teacher_course_ids


async def search_for_user(
    session: AsyncSession,
    *,
    user: User,
    query: str,
    limit: int = 20,
) -> SearchResponseRead:
    q = query.strip()
    if not q:
        return SearchResponseRead(query=q, hits=[])

    pattern = f"%{q}%"
    hits: list[SearchHitRead] = []
    role = user.role

    if role == UserRole.student:
        hits.extend(await _search_student_courses(session, user=user, pattern=pattern, limit=limit))
        if len(hits) < limit:
            hits.extend(
                await _search_student_assignments(
                    session, user=user, pattern=pattern, limit=limit - len(hits)
                )
            )
    elif role == UserRole.teacher:
        hits.extend(await _search_teacher_courses(session, user=user, pattern=pattern, limit=limit))
        if len(hits) < limit:
            hits.extend(
                await _search_teacher_assignments(
                    session, user=user, pattern=pattern, limit=limit - len(hits)
                )
            )
    elif role == UserRole.laborant:
        course_ids = await _teacher_course_ids(session, user=user)
        if course_ids:
            hits.extend(
                await _search_courses_by_ids(session, course_ids=course_ids, pattern=pattern, limit=limit)
            )
    elif role == UserRole.admin:
        hits.extend(await _search_admin(session, pattern=pattern, limit=limit))

    return SearchResponseRead(query=q, hits=hits[:limit])


async def _search_student_courses(
    session: AsyncSession, *, user: User, pattern: str, limit: int
) -> list[SearchHitRead]:
    enrolled = (
        select(Course.id)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(CourseEnrollment.student_id == user.id)
    )
    result = await session.execute(
        select(Course)
        .where(
            Course.id.in_(enrolled),
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        )
        .limit(limit)
    )
    return [
        SearchHitRead(
            type="course",
            id=str(c.id),
            title=c.title,
            subtitle=c.description,
            href=f"/courses/{c.id}",
        )
        for c in result.scalars().all()
    ]


async def _search_student_assignments(
    session: AsyncSession, *, user: User, pattern: str, limit: int
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Assignment, Course)
        .join(Course, Course.id == Assignment.course_id)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(
            CourseEnrollment.student_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
        .limit(limit)
    )
    return [
        SearchHitRead(
            type="assignment",
            id=str(a.id),
            title=a.title,
            subtitle=c.title,
            href=f"/courses/{c.id}/assignments/{a.id}",
        )
        for a, c in result.all()
    ]


async def _search_teacher_courses(
    session: AsyncSession, *, user: User, pattern: str, limit: int
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Course).where(
            Course.teacher_id == user.id,
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        ).limit(limit)
    )
    return [
        SearchHitRead(
            type="course",
            id=str(c.id),
            title=c.title,
            subtitle=c.description,
            href=f"/courses/{c.id}",
        )
        for c in result.scalars().all()
    ]


async def _search_teacher_assignments(
    session: AsyncSession, *, user: User, pattern: str, limit: int
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Assignment, Course)
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Course.teacher_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
        .limit(limit)
    )
    return [
        SearchHitRead(
            type="assignment",
            id=str(a.id),
            title=a.title,
            subtitle=c.title,
            href=f"/courses/{c.id}/assignments/{a.id}",
        )
        for a, c in result.all()
    ]


async def _search_courses_by_ids(
    session: AsyncSession, *, course_ids: list[UUID], pattern: str, limit: int
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Course).where(
            Course.id.in_(course_ids),
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        ).limit(limit)
    )
    return [
        SearchHitRead(
            type="course",
            id=str(c.id),
            title=c.title,
            subtitle=c.description,
            href=f"/courses/{c.id}",
        )
        for c in result.scalars().all()
    ]


async def _search_admin(session: AsyncSession, *, pattern: str, limit: int) -> list[SearchHitRead]:
    hits: list[SearchHitRead] = []
    per_type = max(3, limit // 4)

    users_q = await session.execute(
        select(User).where(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                User.group_name.ilike(pattern),
            )
        ).limit(per_type)
    )
    for u in users_q.scalars().all():
        hits.append(
            SearchHitRead(
                type="user",
                id=str(u.id),
                title=u.full_name,
                subtitle=u.email,
                href="/users",
            )
        )

    courses_q = await session.execute(
        select(Course).where(
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern))
        ).limit(per_type)
    )
    for c in courses_q.scalars().all():
        hits.append(
            SearchHitRead(
                type="course",
                id=str(c.id),
                title=c.title,
                subtitle=c.description,
                href=f"/courses/{c.id}",
            )
        )

    repos_q = await session.execute(
        select(Repository).where(
            or_(Repository.name.ilike(pattern), Repository.gitea_repo_name.ilike(pattern))
        ).limit(per_type)
    )
    for r in repos_q.scalars().all():
        hits.append(
            SearchHitRead(
                type="repository",
                id=str(r.id),
                title=r.name,
                subtitle=r.gitea_repo_name,
                href="/repositories",
            )
        )

    return hits[:limit]
