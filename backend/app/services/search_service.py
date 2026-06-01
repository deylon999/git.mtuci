from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.activity_log import ActivityLog, ActivityType
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.repository import Repository
from app.models.student_repository import StudentRepository
from app.services.repository_access_service import repository_not_blocked_clause
from app.models.user import User, UserRole
from app.schemas.search import SearchHitRead, SearchResponseRead
from app.services.teacher_dashboard_service import _teacher_course_ids
from app.utils.gitea_user import resolve_gitea_username


async def search_for_user(
    session: AsyncSession,
    *,
    user: User,
    query: str,
    limit: int = 20,
    page: int = 1,
) -> SearchResponseRead:
    q = query.strip()
    if not q:
        return SearchResponseRead(query=q, total=0, page=1, pages=0, hits=[])

    pattern = f"%{q}%"
    role = user.role
    page_num = max(1, page)
    offset = (page_num - 1) * limit
    hits: list[SearchHitRead] = []
    total = 0

    if role == UserRole.student:
        total_courses = await _count_student_courses(session, user=user, pattern=pattern)
        total_assignments = await _count_student_assignments(session, user=user, pattern=pattern)
        total = total_courses + total_assignments
        hits = await _collect_student_hits(
            session,
            user=user,
            pattern=pattern,
            offset=offset,
            limit=limit,
            total_courses=total_courses,
        )
    elif role == UserRole.teacher:
        total_courses = await _count_teacher_courses(session, user=user, pattern=pattern)
        total_assignments = await _count_teacher_assignments(session, user=user, pattern=pattern)
        total = total_courses + total_assignments
        hits = await _collect_teacher_hits(
            session,
            user=user,
            pattern=pattern,
            offset=offset,
            limit=limit,
            total_courses=total_courses,
        )
    elif role == UserRole.laborant:
        course_ids = await _teacher_course_ids(session, user=user)
        if course_ids:
            total = await _count_courses_by_ids(session, course_ids=course_ids, pattern=pattern)
            hits = await _search_courses_by_ids(
                session,
                course_ids=course_ids,
                pattern=pattern,
                limit=limit,
                offset=offset,
            )
        else:
            total = 0
    elif role == UserRole.admin:
        hits, total = await _search_admin(session, pattern=pattern, limit=limit, offset=offset)

    pages = (total + limit - 1) // limit if total > 0 else 0
    return SearchResponseRead(query=q, total=total, page=page_num, pages=pages, hits=hits)


async def _search_student_courses(
    session: AsyncSession, *, user: User, pattern: str, limit: int, offset: int = 0
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
        .offset(offset)
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


async def _count_student_courses(session: AsyncSession, *, user: User, pattern: str) -> int:
    enrolled = (
        select(Course.id)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(CourseEnrollment.student_id == user.id)
    )
    result = await session.execute(
        select(func.count(Course.id)).where(
            Course.id.in_(enrolled),
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        )
    )
    return int(result.scalar() or 0)


async def _search_student_assignments(
    session: AsyncSession, *, user: User, pattern: str, limit: int, offset: int = 0
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Assignment, Course)
        .join(Course, Course.id == Assignment.course_id)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(
            CourseEnrollment.student_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
        .offset(offset)
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


async def _count_student_assignments(session: AsyncSession, *, user: User, pattern: str) -> int:
    result = await session.execute(
        select(func.count(Assignment.id))
        .join(Course, Course.id == Assignment.course_id)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(
            CourseEnrollment.student_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
    )
    return int(result.scalar() or 0)


async def _collect_student_hits(
    session: AsyncSession,
    *,
    user: User,
    pattern: str,
    offset: int,
    limit: int,
    total_courses: int,
) -> list[SearchHitRead]:
    hits: list[SearchHitRead] = []
    if limit <= 0:
        return hits

    remaining = limit
    courses_offset = min(offset, total_courses)
    if offset < total_courses:
        course_hits = await _search_student_courses(
            session,
            user=user,
            pattern=pattern,
            limit=remaining,
            offset=courses_offset,
        )
        hits.extend(course_hits)
        remaining -= len(course_hits)

    assignments_offset = max(0, offset - total_courses)
    if remaining > 0:
        assignment_hits = await _search_student_assignments(
            session,
            user=user,
            pattern=pattern,
            limit=remaining,
            offset=assignments_offset,
        )
        hits.extend(assignment_hits)
    return hits


async def _search_teacher_courses(
    session: AsyncSession, *, user: User, pattern: str, limit: int, offset: int = 0
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Course).where(
            Course.teacher_id == user.id,
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        ).offset(offset).limit(limit)
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


async def _count_teacher_courses(session: AsyncSession, *, user: User, pattern: str) -> int:
    result = await session.execute(
        select(func.count(Course.id)).where(
            Course.teacher_id == user.id,
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        )
    )
    return int(result.scalar() or 0)


async def _search_teacher_assignments(
    session: AsyncSession, *, user: User, pattern: str, limit: int, offset: int = 0
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Assignment, Course)
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Course.teacher_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
        .offset(offset)
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


async def _count_teacher_assignments(session: AsyncSession, *, user: User, pattern: str) -> int:
    result = await session.execute(
        select(func.count(Assignment.id))
        .join(Course, Course.id == Assignment.course_id)
        .where(
            Course.teacher_id == user.id,
            or_(Assignment.title.ilike(pattern), Assignment.description.ilike(pattern)),
        )
    )
    return int(result.scalar() or 0)


async def _collect_teacher_hits(
    session: AsyncSession,
    *,
    user: User,
    pattern: str,
    offset: int,
    limit: int,
    total_courses: int,
) -> list[SearchHitRead]:
    hits: list[SearchHitRead] = []
    if limit <= 0:
        return hits

    remaining = limit
    courses_offset = min(offset, total_courses)
    if offset < total_courses:
        course_hits = await _search_teacher_courses(
            session,
            user=user,
            pattern=pattern,
            limit=remaining,
            offset=courses_offset,
        )
        hits.extend(course_hits)
        remaining -= len(course_hits)

    assignments_offset = max(0, offset - total_courses)
    if remaining > 0:
        assignment_hits = await _search_teacher_assignments(
            session,
            user=user,
            pattern=pattern,
            limit=remaining,
            offset=assignments_offset,
        )
        hits.extend(assignment_hits)
    return hits


async def _search_courses_by_ids(
    session: AsyncSession, *, course_ids: list[UUID], pattern: str, limit: int, offset: int = 0
) -> list[SearchHitRead]:
    result = await session.execute(
        select(Course).where(
            Course.id.in_(course_ids),
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        ).offset(offset).limit(limit)
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


async def _count_courses_by_ids(session: AsyncSession, *, course_ids: list[UUID], pattern: str) -> int:
    result = await session.execute(
        select(func.count(Course.id)).where(
            Course.id.in_(course_ids),
            or_(Course.title.ilike(pattern), Course.description.ilike(pattern)),
        )
    )
    return int(result.scalar() or 0)


async def _search_admin(session: AsyncSession, *, pattern: str, limit: int, offset: int) -> tuple[list[SearchHitRead], int]:
    hits: list[SearchHitRead] = []
    repo_name_match = or_(Repository.name.ilike(pattern), Repository.gitea_repo_name.ilike(pattern))
    owner_match = or_(
        User.full_name.ilike(pattern),
        User.email.ilike(pattern),
        User.mtuci_login.ilike(pattern),
    )
    users_match = or_(
        User.full_name.ilike(pattern),
        User.email.ilike(pattern),
        User.group_name.ilike(pattern),
    )
    courses_match = or_(Course.title.ilike(pattern), Course.description.ilike(pattern))

    users_count_q = await session.execute(select(func.count(User.id)).where(users_match))
    courses_count_q = await session.execute(select(func.count(Course.id)).where(courses_match))
    repos_count_q = await session.execute(
        select(func.count(Repository.id))
        .outerjoin(User, User.id == Repository.owner_id)
        .where(repository_not_blocked_clause(), or_(repo_name_match, owner_match))
    )
    users_total = int(users_count_q.scalar() or 0)
    courses_total = int(courses_count_q.scalar() or 0)
    repos_total = int(repos_count_q.scalar() or 0)
    total = users_total + courses_total + repos_total

    if total == 0 or limit <= 0:
        return [], total

    remaining = limit
    cursor = offset

    users_offset = min(cursor, users_total)
    if cursor < users_total and remaining > 0:
        users_q = await session.execute(
            select(User)
            .where(users_match)
            .offset(users_offset)
            .limit(remaining)
        )
        user_hits = [
            SearchHitRead(
                type="user",
                id=str(u.id),
                title=u.full_name,
                subtitle=u.email,
                href="/users",
            )
            for u in users_q.scalars().all()
        ]
        hits.extend(user_hits)
        remaining -= len(user_hits)
    cursor = max(0, cursor - users_total)

    courses_offset = min(cursor, courses_total)
    if cursor < courses_total and remaining > 0:
        now_utc = datetime.now(timezone.utc)
        assignments_count_sq = (
            select(func.count(Assignment.id))
            .where(Assignment.course_id == Course.id)
            .correlate(Course)
            .scalar_subquery()
        )
        students_count_sq = (
            select(func.count(CourseEnrollment.id))
            .where(CourseEnrollment.course_id == Course.id)
            .correlate(Course)
            .scalar_subquery()
        )
        nearest_deadline_sq = (
            select(func.min(Assignment.deadline))
            .where(and_(Assignment.course_id == Course.id, Assignment.deadline >= now_utc))
            .correlate(Course)
            .scalar_subquery()
        )
        repo_names_sq = (
            select(func.lower(StudentRepository.repo_name).label("repo_name"))
            .join(Assignment, Assignment.id == StudentRepository.assignment_id)
            .where(Assignment.course_id == Course.id)
            .union(
                select(func.lower(Assignment.gitea_repo_name).label("repo_name")).where(
                    and_(Assignment.course_id == Course.id, Assignment.gitea_repo_name.is_not(None))
                )
            )
            .subquery()
        )
        pr_count_sq = (
            select(func.count(ActivityLog.id))
            .where(
                and_(
                    ActivityLog.activity_type == ActivityType.pull_request,
                    ActivityLog.repo_name.is_not(None),
                    func.lower(ActivityLog.repo_name).in_(select(repo_names_sq.c.repo_name)),
                )
            )
            .correlate(Course)
            .scalar_subquery()
        )
        courses_q = await session.execute(
            select(
                Course,
                User,
                assignments_count_sq.label("assignments_count"),
                students_count_sq.label("students_count"),
                nearest_deadline_sq.label("nearest_deadline"),
                pr_count_sq.label("pr_count"),
            )
            .outerjoin(User, User.id == Course.teacher_id)
            .where(courses_match)
            .offset(courses_offset)
            .limit(remaining)
        )
        course_hits: list[SearchHitRead] = []
        for c, teacher, assignments_count, students_count, nearest_deadline, pr_count in courses_q.all():
            groups = [g.strip() for g in (c.target_groups or []) if isinstance(g, str) and g.strip()]
            teacher_name = teacher.full_name if teacher and teacher.full_name else None
            groups_text = ", ".join(groups) if groups else None
            subtitle_parts = [teacher_name, groups_text]
            status = "active" if int(assignments_count or 0) == 0 or nearest_deadline is not None else "archived"
            course_hits.append(
                SearchHitRead(
                    type="course",
                    id=str(c.id),
                    title=c.title,
                    subtitle=" · ".join(part for part in subtitle_parts if part) or c.description,
                    href=f"/courses/{c.id}",
                    course_teacher_name=teacher_name,
                    course_groups=groups or None,
                    course_status=status,
                    course_assignments_count=int(assignments_count or 0),
                    course_students_count=int(students_count or 0),
                    course_nearest_deadline=nearest_deadline,
                    course_pr_count=int(pr_count or 0),
                )
            )
        hits.extend(course_hits)
        remaining -= len(course_hits)
    cursor = max(0, cursor - courses_total)

    repo_lookup_key = func.lower(func.coalesce(Repository.gitea_repo_name, Repository.name))
    commit_count_sq = (
        select(func.count(ActivityLog.id))
        .where(
            and_(
                func.lower(ActivityLog.repo_name) == repo_lookup_key,
                ActivityLog.activity_type == ActivityType.commit,
            )
        )
        .correlate(Repository)
        .scalar_subquery()
    )
    fork_count_sq = (
        select(func.count(ActivityLog.id))
        .where(
            and_(
                func.lower(ActivityLog.repo_name) == repo_lookup_key,
                ActivityLog.activity_type == ActivityType.fork,
            )
        )
        .correlate(Repository)
        .scalar_subquery()
    )
    pushed_at_sq = (
        select(func.max(ActivityLog.created_at))
        .where(
            and_(
                func.lower(ActivityLog.repo_name) == repo_lookup_key,
                ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
            )
        )
        .correlate(Repository)
        .scalar_subquery()
    )
    # If no push is known yet, treat repository creation time as initial activity
    # so new repositories don't show an empty last-updated value.
    effective_pushed_at_sq = func.coalesce(Repository.last_pushed_at, pushed_at_sq, Repository.created_at)
    repos_offset = min(cursor, repos_total)
    if cursor < repos_total and remaining > 0:
        repos_q = await session.execute(
            select(
                Repository,
                User,
                commit_count_sq.label("commits_count"),
                fork_count_sq.label("forks_count"),
                effective_pushed_at_sq.label("pushed_at"),
            )
            .outerjoin(User, User.id == Repository.owner_id)
            .where(
                repository_not_blocked_clause(),
                or_(repo_name_match, owner_match),
            )
            .order_by(
                case(
                    (repo_name_match, 0),
                    else_=1,
                ),
                Repository.created_at.desc(),
                Repository.id.desc(),
            )
            .offset(repos_offset)
            .limit(remaining)
        )
        for r, owner, commits_count, forks_count, pushed_at in repos_q.all():
            owner_login = resolve_gitea_username(owner) if owner else None
            owner_display = (owner.full_name or "").strip() if owner and owner.full_name else None
            repo_name = (r.name or "").strip() or (r.gitea_repo_name or "").strip() or str(r.id)
            display_owner = owner_display or owner_login
            display_name = f"{display_owner}/{repo_name}" if display_owner else repo_name
            repo_description = (r.description or "").strip() or None
            hits.append(
                SearchHitRead(
                    type="repository",
                    id=str(r.id),
                    title=repo_name,
                    display_name=display_name,
                    subtitle=repo_description,
                    href="/repositories",
                    repo_description=repo_description,
                    repo_language=r.language,
                    repo_visibility=r.repo_type.value if r.repo_type else None,
                    repo_commits_count=int(commits_count or 0),
                    repo_forks_count=int(forks_count or 0),
                    repo_pushed_at=pushed_at,
                    repo_updated_at=r.updated_at,
                )
            )
        remaining = 0

    return hits, total
