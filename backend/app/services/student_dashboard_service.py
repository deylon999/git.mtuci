from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.repository import Repository, RepositoryType
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.student_dashboard import (
    StudentActivityFeedItemRead,
    StudentActivitySummaryRead,
    StudentDashboardCourseRead,
    StudentDashboardKpiRead,
    StudentDashboardStatsRead,
    StudentAssignmentListItemRead,
    StudentDeadlineDetailRead,
    StudentDeadlineRead,
    StudentForkItemRead,
    StudentGradeCourseRead,
    StudentGradeItemRead,
    StudentGradesSummaryRead,
    StudentGroupRankingEntryRead,
    StudentGroupRankingRead,
    StudentRecentRepositoryRead,
    StudentRepositoriesRead,
    StudentRepositoriesStatsRead,
    StudentRepositoryItemRead,
    StudentSidebarCountsRead,
)
from app.services.activity_service import log_repo_deleted
from app.services.course_service import list_student_courses
from app.utils.gitea_user import resolve_gitea_username
from app.services.gitea_service import (
    GiteaAuthError,
    build_authenticated_clone_url,
    build_clone_url,
    build_repo_web_url,
    create_gitea_user_access_token,
    delete_repository as delete_gitea_repository,
    ensure_gitea_user,
    enrich_repos_gitea_stats,
    gitea_public_base_url,
    get_repo_metadata,
    resolve_repo_owner,
    stats_from_repo_metadata,
    verify_gitea_access_token,
)

logger = logging.getLogger(__name__)


def _start_of_day(dt: datetime) -> datetime:
    local = dt.astimezone(timezone.utc)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _is_same_day(a: datetime, b: datetime) -> bool:
    return _start_of_day(a) == _start_of_day(b)


def _score_color(score: int | None, score_max: int) -> str:
    if score is None:
        return "muted"
    ratio = score / score_max if score_max > 0 else 0
    if ratio >= 0.85:
        return "success"
    if ratio >= 0.6:
        return "warning"
    return "danger"


def _deadline_urgency(deadline: datetime, now: datetime) -> str:
    today = _start_of_day(now)
    tomorrow = today + timedelta(days=1)
    d = _start_of_day(deadline)
    if d <= today:
        return "danger"
    if d == tomorrow:
        return "warning"
    diff_days = (d - today).days
    if diff_days <= 3:
        return "info"
    return "muted"


def _deadlines_today_sub(titles: list[str], next_title: str | None) -> str:
    if titles:
        return " и ".join(titles[:2])
    if next_title:
        return f"Ближайший: {next_title}"
    return "На сегодня нет"


def _submission_points(sub: Submission) -> int:
    if sub.final_grade is not None:
        return int(round(sub.final_grade))
    if sub.grade is not None:
        return sub.grade
    return 0


def _graded_points(sub: Submission | None) -> float | None:
    if sub is None:
        return None
    if sub.final_grade is not None:
        return float(sub.final_grade)
    if sub.grade is not None:
        return float(sub.grade)
    return None


def _weighted_percent(earned: float, maximum: float) -> float | None:
    if maximum <= 0:
        return None
    return round(earned / maximum * 100, 1)


def _percent_color(percent: float | None) -> str:
    if percent is None:
        return "muted"
    if percent >= 85:
        return "success"
    if percent >= 60:
        return "warning"
    return "danger"


async def _student_repo_specs(
    session: AsyncSession,
    *,
    student_id: UUID,
) -> list[tuple[str, str]]:
    student_user = await session.get(User, student_id)
    primary_owner = resolve_gitea_username(student_user) if student_user else "user"
    specs: list[tuple[str, str]] = []

    personal_result = await session.execute(
        select(Repository).where(Repository.owner_id == student_id)
    )
    for repo in personal_result.scalars().all():
        repo_name = (repo.gitea_repo_name or repo.name or "").strip()
        if repo_name:
            specs.append((primary_owner, repo_name))

    ar_result = await session.execute(
        select(StudentRepository).where(StudentRepository.student_id == student_id)
    )
    for student_repo in ar_result.scalars().all():
        repo_name = (student_repo.repo_name or "").strip()
        if repo_name:
            specs.append((primary_owner, repo_name))

    return specs


async def _count_student_commits_week(session: AsyncSession, *, student_id: UUID, week_ago: datetime) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.activity_type.in_([ActivityType.commit, ActivityType.push]),
            ActivityLog.created_at >= week_ago,
        )
    )
    return int(result.scalar() or 0)


async def _commits_week_count(
    session: AsyncSession,
    *,
    student_id: UUID,
    week_ago: datetime,
    repo_specs: list[tuple[str, str]],
) -> int:
    """Commits in the last 7 days: Gitea (primary) with activity_log fallback."""
    gitea_total = 0
    gitea_ok = False
    if repo_specs:
        week_stats = await enrich_repos_gitea_stats(repo_specs, since=week_ago)
        for count, _approx, _owner in week_stats:
            if count is not None:
                gitea_ok = True
                gitea_total += count
    if gitea_ok:
        return gitea_total
    return await _count_student_commits_week(session, student_id=student_id, week_ago=week_ago)


@dataclass
class StudentRepoGiteaTarget:
    owner: str
    repo_name: str
    display_name: str
    source: str


def _normalize_repo_path(path: str) -> str:
    return path.strip().strip("/")


async def ensure_student_gitea_clone_token(session: AsyncSession, user: User) -> str:
    """Personal access token for git clone without interactive login (stored in preferences)."""
    prefs: dict = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    existing = str(prefs.get("gitea_clone_token") or "").strip()
    if existing and await verify_gitea_access_token(existing):
        return existing

    username = resolve_gitea_username(user)
    await ensure_gitea_user(username)
    token = await create_gitea_user_access_token(username)
    prefs["gitea_clone_token"] = token
    user.preferences = prefs
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return token


def _mask_gitea_token(token: str) -> str:
    t = token.strip()
    if len(t) <= 4:
        return "****"
    return f"{'•' * 12}{t[-4:]}"


async def get_student_git_clone_token_status(user: User) -> dict:
    prefs: dict = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    existing = str(prefs.get("gitea_clone_token") or "").strip()
    configured = bool(existing) and await verify_gitea_access_token(existing)
    return {
        "configured": configured,
        "masked_token": _mask_gitea_token(existing) if configured else None,
        "gitea_username": resolve_gitea_username(user),
    }


async def regenerate_student_git_clone_token(session: AsyncSession, user: User) -> dict:
    from app.services.gitea_service import delete_gitea_clone_tokens_for_user

    username = resolve_gitea_username(user)
    await delete_gitea_clone_tokens_for_user(username)
    prefs: dict = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    prefs.pop("gitea_clone_token", None)
    user.preferences = prefs
    session.add(user)
    await session.commit()
    await session.refresh(user)
    token = await ensure_student_gitea_clone_token(session, user)
    username = resolve_gitea_username(user)
    return {
        "token": token,
        "gitea_username": username,
    }


async def get_student_repository_clone_info(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
) -> dict:
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    student_user = await session.get(User, student_id)
    if not student_user:
        raise ValueError("User not found")

    gitea_username = resolve_gitea_username(student_user)
    clone_url = build_clone_url(target.owner, target.repo_name)
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    is_private = bool(meta.get("private")) if meta else True

    if not is_private:
        cmd = f"git clone {clone_url}"
        return {
            "clone_url": clone_url,
            "git_clone_command": cmd,
            "auth_required": False,
            "note": "Публичный репозиторий — логин в Gitea не нужен.",
        }

    token = await ensure_student_gitea_clone_token(session, student_user)
    auth_url = build_authenticated_clone_url(
        owner=target.owner,
        repo_name=target.repo_name,
        username=gitea_username,
        token=token,
    )
    cmd = f"git clone {auth_url}"
    return {
        "clone_url": clone_url,
        "git_clone_command": cmd,
        "auth_required": True,
        "note": (
            "Приватный репозиторий: в команду подставлен ваш токен Gitea. "
            "Не публикуйте её и не коммитьте в репозиторий."
        ),
    }


async def sync_personal_repository_to_gitea(
    session: AsyncSession,
    *,
    student_user: User,
    repo: Repository,
) -> None:
    """
    Если запись есть в БД, но репозитория нет в Gitea — создаём (как при первом создании).
    """
    from app.services.gitea_service import ensure_gitea_user, repo_exists_in_gitea
    from app.services.repo_init_service import create_personal_repository_in_gitea

    owner = resolve_gitea_username(student_user)
    repo_name = (repo.gitea_repo_name or repo.name or "").strip()
    if not repo_name:
        raise ValueError("У репозитория нет имени — пересоздайте его в разделе «Мои репозитории».")

    exists = await repo_exists_in_gitea(owner=owner, repo=repo_name)
    if exists is True:
        return
    if exists is None:
        raise GiteaAuthError(
            "Gitea недоступен. Проверьте настройки сервера или обратитесь к администратору."
        )

    await ensure_gitea_user(owner)
    repo_type = repo.repo_type
    if isinstance(repo_type, RepositoryType):
        is_private = repo_type == RepositoryType.private
    else:
        is_private = str(repo_type) == "private"

    try:
        await create_personal_repository_in_gitea(
            owner_username=owner,
            name=repo_name,
            description=repo.description,
            private=is_private,
            add_readme=True,
            gitignore_template=None,
            license_template=None,
        )
    except Exception as exc:
        logger.warning("sync_personal_repository_to_gitea %s/%s: %s", owner, repo_name, exc)
        raise ValueError(
            f"Не удалось создать репозиторий в Gitea ({owner}/{repo_name}). "
            "Проверьте логин Gitea (mtuci_login) в профиле и попробуйте снова."
        ) from exc

    repo.gitea_repo_name = repo_name
    repo.clone_url = build_clone_url(owner, repo_name)
    session.add(repo)
    await session.commit()


async def resolve_student_repo_gitea_target(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
) -> StudentRepoGiteaTarget:
    try:
        item_uuid = UUID(repo_item_id)
    except ValueError as exc:
        raise ValueError("Invalid repository id") from exc

    student_user = await session.get(User, student_id)
    if not student_user:
        raise ValueError("User not found")
    primary_owner = resolve_gitea_username(student_user)

    personal = await session.execute(
        select(Repository).where(
            Repository.id == item_uuid,
            Repository.owner_id == student_id,
        )
    )
    repo = personal.scalar_one_or_none()
    if repo:
        await sync_personal_repository_to_gitea(session, student_user=student_user, repo=repo)
        repo_name = (repo.gitea_repo_name or repo.name or "").strip()
        if not repo_name:
            raise ValueError("У репозитория нет имени — пересоздайте его в разделе «Мои репозитории».")
        owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=repo_name)
        return StudentRepoGiteaTarget(
            owner=owner,
            repo_name=repo_name,
            display_name=repo.name,
            source="personal",
        )

    ar_result = await session.execute(
        select(StudentRepository).where(
            StudentRepository.id == item_uuid,
            StudentRepository.student_id == student_id,
        )
    )
    student_repo = ar_result.scalar_one_or_none()
    if student_repo:
        repo_name = (student_repo.repo_name or "").strip()
        if not repo_name:
            raise ValueError("Репозиторий задания не настроен.")
        from app.services.student_repository_service import sync_assignment_repository_to_gitea

        try:
            owner, repo_name = await sync_assignment_repository_to_gitea(
                session,
                student=student_user,
                student_repo=student_repo,
            )
        except Exception as exc:
            raise ValueError(
                f"Не удалось открыть репозиторий задания ({repo_name}). "
                "Откройте задание в курсе или удалите запись и создайте заново."
            ) from exc
        return StudentRepoGiteaTarget(
            owner=owner,
            repo_name=repo_name,
            display_name=student_repo.repo_name,
            source="assignment",
        )

    raise ValueError("Repository not found")


async def list_student_repository_files(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    path: str = "",
    branch: str | None = None,
) -> list[dict]:
    from app.services.gitea_service import get_last_commit_for_path, get_repo_contents

    normalized = _normalize_repo_path(path)
    if normalized and ".." in normalized.split("/"):
        raise ValueError("Invalid path")

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    try:
        contents = await get_repo_contents(
            owner=target.owner,
            repo=target.repo_name,
            filepath=normalized,
            ref=branch,
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc

    if not isinstance(contents, list):
        raise ValueError("Unexpected Gitea response")

    result: list[dict] = []
    for item in contents:
        item_type = item.get("type")
        if item_type not in ("file", "dir"):
            continue
        name = str(item.get("name") or "")
        rel_path = f"{normalized}/{name}".strip("/") if normalized else name
        result.append(
            {
                "sha": str(item.get("sha") or ""),
                "name": name,
                "path": rel_path,
                "type": item_type,
                "size": item.get("size"),
                "last_commit_message": None,
                "last_commit_at": None,
            }
        )

    if not result:
        return result

    sem = asyncio.Semaphore(8)

    async def attach_commit(row: dict) -> dict:
        async with sem:
            info = await get_last_commit_for_path(
                owner=target.owner,
                repo=target.repo_name,
                filepath=row["path"],
                ref=branch,
            )
        if info:
            row["last_commit_message"] = info.get("message")
            row["last_commit_at"] = info.get("committed_at")
        return row

    enriched = await asyncio.gather(*[attach_commit(r) for r in result[:40]])
    if len(result) > 40:
        enriched.extend(result[40:])
    return list(enriched)


async def get_student_repository_file_content(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    filepath: str,
    branch: str | None = None,
) -> str:
    from app.services.gitea_service import get_repo_file_content

    cleaned = filepath.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid filepath")

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    try:
        return await get_repo_file_content(
            owner=target.owner,
            repo=target.repo_name,
            filepath=cleaned,
            ref=branch,
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc


def _parse_gitea_commit(item: dict) -> dict:
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else item
    if not isinstance(commit, dict):
        commit = item
    msg = str(commit.get("message") or "").strip()
    if "\n" in msg:
        msg = msg.split("\n", 1)[0].strip()
    author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
    return {
        "sha": str(item.get("sha") or commit.get("sha") or "")[:12],
        "message": msg or "Commit",
        "author_name": str(author.get("name") or "").strip() or None,
        "committed_at": author.get("date"),
    }


async def get_student_repository_summary(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    branch: str | None = None,
) -> dict:
    from app.services.gitea_service import (
        build_repo_gitea_links,
        count_repo_commits,
        get_repo_metadata,
        list_repo_branches,
        list_repo_commits_page,
    )

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    default_branch = "main"
    forks = stars = open_pr = open_issues = watchers = size_kb = None
    created_at = updated_at = None
    language = None
    description = target.display_name

    if meta:
        default_branch = str(meta.get("default_branch") or "main").strip() or "main"
        language = meta.get("language")
        if isinstance(language, str):
            language = language.strip() or None
        description = str(meta.get("description") or "").strip() or description
        forks = meta.get("forks_count")
        stars = meta.get("stars_count")
        open_pr = meta.get("open_pr_counter") or meta.get("open_pr_count")
        open_issues = meta.get("open_issues_count")
        watchers = meta.get("watchers_count")
        size_kb = meta.get("size")
        created_at = meta.get("created_at")
        updated_at = meta.get("updated_at")

    ref = branch or default_branch
    raw_branches = await list_repo_branches(owner=target.owner, repo=target.repo_name)
    branch_names = [
        str(b.get("name") or "").strip()
        for b in raw_branches
        if isinstance(b, dict) and b.get("name")
    ]

    count, approx = await count_repo_commits(
        owner=target.owner,
        repo=target.repo_name,
    )

    recent: list[dict] = []
    try:
        commits, _ = await list_repo_commits_page(
            owner=target.owner,
            repo=target.repo_name,
            limit=5,
            page=1,
            ref=ref,
        )
        for c in commits[:5]:
            if isinstance(c, dict):
                recent.append(_parse_gitea_commit(c))
    except Exception:
        recent = []

    readme_path = None
    license_name = None
    license_path = None
    try:
        root_files = await list_student_repository_files(
            session,
            student_id=student_id,
            repo_item_id=repo_item_id,
            path="",
            branch=ref,
        )
        for f in root_files:
            name_lower = f["name"].lower()
            if f["type"] == "file" and name_lower.startswith("readme"):
                readme_path = f["path"]
            if f["type"] == "file" and name_lower.startswith("license"):
                license_path = f["path"]
                license_name = f["name"]
    except ValueError:
        pass

    links = build_repo_gitea_links(target.owner, target.repo_name)

    return {
        "description": description or None,
        "language": language,
        "default_branch": default_branch,
        "commits_count": count,
        "commits_count_approx": approx,
        "branches_count": len(branch_names) or 1,
        "tags_count": 0,
        "forks_count": int(forks) if forks is not None else None,
        "stars_count": int(stars) if stars is not None else None,
        "open_pr_count": int(open_pr) if open_pr is not None else None,
        "open_issues_count": int(open_issues) if open_issues is not None else None,
        "watchers_count": int(watchers) if watchers is not None else None,
        "size_kb": int(size_kb) if size_kb is not None else None,
        "created_at": created_at,
        "updated_at": updated_at,
        "has_readme": bool(readme_path),
        "readme_path": readme_path,
        "license_name": license_name,
        "license_path": license_path,
        "recent_commits": recent,
        "gitea_links": links,
    }


async def get_student_repository_commits(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    branch: str | None = None,
    page: int = 1,
    limit: int = 30,
) -> dict:
    from app.services.gitea_service import get_repo_metadata, list_repo_commits_page

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    ref = branch or (str(meta.get("default_branch") if meta else "") or "main")

    commits, has_more = await list_repo_commits_page(
        owner=target.owner,
        repo=target.repo_name,
        limit=min(limit, 50),
        page=max(page, 1),
        ref=ref,
    )
    parsed = []
    for c in commits:
        if isinstance(c, dict):
            parsed.append(_parse_gitea_commit(c))
    return {"commits": parsed, "page": page, "has_more": has_more}


async def get_student_repository_branches(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
) -> dict:
    from app.services.gitea_service import get_repo_metadata, list_repo_branches

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    default_branch = "main"
    if meta:
        default_branch = str(meta.get("default_branch") or "main").strip() or "main"

    raw = await list_repo_branches(owner=target.owner, repo=target.repo_name)
    names: list[str] = []
    for item in raw:
        name = str(item.get("name") or "").strip()
        if name and name not in names:
            names.append(name)
    if default_branch not in names:
        names.insert(0, default_branch)
    elif names and names[0] != default_branch:
        names = [default_branch] + [n for n in names if n != default_branch]

    return {
        "default_branch": default_branch,
        "branches": [{"name": n, "is_default": n == default_branch} for n in names],
    }


def _parse_gitea_issue(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    labels = [
        str(lb.get("name") or "").strip()
        for lb in (item.get("labels") or [])
        if isinstance(lb, dict) and lb.get("name")
    ]
    return {
        "number": int(item.get("number") or 0),
        "title": str(item.get("title") or "Без названия").strip(),
        "state": str(item.get("state") or "open"),
        "author_name": str(user.get("login") or user.get("full_name") or "").strip() or None,
        "labels": labels,
        "comments_count": int(item.get("comments") or 0),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def _parse_gitea_pull(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    head = item.get("head") if isinstance(item.get("head"), dict) else {}
    base = item.get("base") if isinstance(item.get("base"), dict) else {}
    return {
        "number": int(item.get("number") or 0),
        "title": str(item.get("title") or "Без названия").strip(),
        "state": str(item.get("state") or "open"),
        "author_name": str(user.get("login") or user.get("full_name") or "").strip() or None,
        "head_branch": str(head.get("ref") or "").strip() or None,
        "base_branch": str(base.get("ref") or "").strip() or None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


async def get_student_repository_issues(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    page: int = 1,
    limit: int = 20,
    state: str = "open",
) -> dict:
    from app.services.gitea_service import list_repo_issues_page

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    raw, has_more = await list_repo_issues_page(
        owner=target.owner,
        repo=target.repo_name,
        page=max(page, 1),
        limit=min(limit, 50),
        state=state,
    )
    issues = [_parse_gitea_issue(i) for i in raw if isinstance(i, dict)]
    return {"issues": issues, "page": page, "has_more": has_more}


async def get_student_repository_pulls(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    page: int = 1,
    limit: int = 20,
    state: str = "open",
) -> dict:
    from app.services.gitea_service import list_repo_pulls_page

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    raw, has_more = await list_repo_pulls_page(
        owner=target.owner,
        repo=target.repo_name,
        page=max(page, 1),
        limit=min(limit, 50),
        state=state,
    )
    pulls = [_parse_gitea_pull(p) for p in raw if isinstance(p, dict)]
    return {"pulls": pulls, "page": page, "has_more": has_more}


async def get_student_repository_wiki_pages(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
) -> dict:
    from app.services.gitea_service import list_repo_wiki_pages

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    raw = await list_repo_wiki_pages(owner=target.owner, repo=target.repo_name)
    pages = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("pageName") or "").strip()
        slug = str(item.get("slug") or item.get("sub_url") or title).strip().strip("/")
        if not title and not slug:
            continue
        pages.append(
            {
                "title": title or slug,
                "slug": slug or title,
                "subtitle": str(item.get("subtitle") or "").strip() or None,
            }
        )
    return {"pages": pages, "enabled": True}


async def get_student_repository_wiki_content(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    page: str,
) -> dict:
    from app.services.gitea_service import get_repo_wiki_page

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    data = await get_repo_wiki_page(
        owner=target.owner,
        repo=target.repo_name,
        page_name=page,
    )
    if not data:
        raise ValueError("Wiki page not found")
    title = str(data.get("title") or page).strip()
    slug = str(data.get("sub_url") or data.get("slug") or page).strip().strip("/")
    content = str(data.get("content") or "")
    return {"title": title, "slug": slug, "content": content}


async def search_student_repository_files(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    query: str,
    branch: str | None = None,
    limit: int = 40,
) -> list[str]:
    from app.services.gitea_service import list_repo_file_paths

    q = query.strip().lower()
    if not q:
        return []

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    ref = branch or "main"
    paths = await list_repo_file_paths(
        owner=target.owner,
        repo=target.repo_name,
        ref=ref,
    )
    scored: list[tuple[int, str]] = []
    for path in paths:
        lower = path.lower()
        if q in lower:
            idx = lower.index(q)
            scored.append((idx, path))
    scored.sort(key=lambda x: (x[0], len(x[1]), x[1]))
    return [p for _, p in scored[:limit]]


async def create_student_repository_file(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    path: str,
    content: str,
    message: str,
    branch: str | None = None,
) -> None:
    from app.services.gitea_service import create_repo_file, get_repo_metadata

    cleaned = path.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid filepath")

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    ref = branch or (str(meta.get("default_branch") if meta else "") or "main")
    try:
        await create_repo_file(
            owner=target.owner,
            repo=target.repo_name,
            filepath=cleaned,
            content=content,
            branch=ref,
            message=message,
        )
    except RuntimeError as exc:
        raise ValueError(str(exc)) from exc


async def delete_student_personal_repository(
    session: AsyncSession,
    *,
    student_id: UUID,
    gitea_login: str | None,
    repository_id: UUID,
) -> None:
    """Delete a personal Repository or an assignment StudentRepository (DB + Gitea if present)."""
    student_user = await session.get(User, student_id)
    primary_owner = resolve_gitea_username(student_user) if student_user else (gitea_login or "user")

    result = await session.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == student_id,
        )
    )
    repo = result.scalar_one_or_none()
    if repo:
        repo_name = repo.gitea_repo_name or repo.name
        owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=repo_name)
        await delete_gitea_repository(owner=owner, repo_name=repo_name)
        await log_repo_deleted(
            session=session,
            user_id=student_id,
            repo_name=repo.name,
            ip_address=None,
        )
        await session.delete(repo)
        await session.commit()
        return

    ar_result = await session.execute(
        select(StudentRepository).where(
            StudentRepository.id == repository_id,
            StudentRepository.student_id == student_id,
        )
    )
    student_repo = ar_result.scalar_one_or_none()
    if not student_repo:
        raise ValueError("Repository not found")

    repo_name = (student_repo.repo_name or "").strip()
    if repo_name:
        owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=repo_name)
        await delete_gitea_repository(owner=owner, repo_name=repo_name)
    await log_repo_deleted(
        session=session,
        user_id=student_id,
        repo_name=repo_name or "assignment-repo",
        ip_address=None,
    )
    await session.delete(student_repo)
    await session.commit()


@dataclass
class _StudentAssignmentContext:
    courses: list[Course]
    all_assignments: list[Assignment]
    submissions_map: dict[UUID, Submission]
    course_title_by_id: dict[UUID, str]


async def _load_student_assignment_context(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> _StudentAssignmentContext:
    courses = await list_student_courses(session, student_id=student_id, group_name=group_name)
    course_ids = [c.id for c in courses]
    all_assignments: list[Assignment] = []
    if course_ids:
        a_result = await session.execute(select(Assignment).where(Assignment.course_id.in_(course_ids)))
        all_assignments = list(a_result.scalars().all())

    assignment_ids = [a.id for a in all_assignments]
    submissions_map: dict[UUID, Submission] = {}
    if assignment_ids:
        s_result = await session.execute(
            select(Submission).where(
                Submission.student_id == student_id,
                Submission.assignment_id.in_(assignment_ids),
            )
        )
        submissions_map = {s.assignment_id: s for s in s_result.scalars().all()}

    return _StudentAssignmentContext(
        courses=courses,
        all_assignments=all_assignments,
        submissions_map=submissions_map,
        course_title_by_id={c.id: c.title for c in courses},
    )


async def get_student_dashboard_stats(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> StudentDashboardStatsRead:
    now = datetime.now(timezone.utc)
    today_start = _start_of_day(now)
    week_ago = now - timedelta(days=7)

    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    courses = ctx.courses
    all_assignments = ctx.all_assignments
    submissions_map = ctx.submissions_map
    course_title_by_id = ctx.course_title_by_id

    teachers: dict[UUID, str] = {}
    if courses:
        teacher_ids = list({c.teacher_id for c in courses})
        t_result = await session.execute(select(User.id, User.full_name).where(User.id.in_(teacher_ids)))
        teachers = {row[0]: row[1] for row in t_result.all()}

    upcoming = sorted(
        [a for a in all_assignments if a.deadline >= today_start],
        key=lambda a: a.deadline,
    )
    deadlines_today_titles = [a.title for a in upcoming if _is_same_day(a.deadline, now)]
    next_title = upcoming[0].title if upcoming and not deadlines_today_titles else (
        upcoming[0].title if upcoming else None
    )

    pending_assignments = 0
    for a in upcoming:
        sub = submissions_map.get(a.id)
        if sub is None or sub.submitted_at is None:
            pending_assignments += 1

    personal_count = (
        await session.execute(
            select(func.count()).select_from(Repository).where(Repository.owner_id == student_id)
        )
    ).scalar() or 0
    assignment_repo_count = (
        await session.execute(
            select(func.count()).select_from(StudentRepository).where(StudentRepository.student_id == student_id)
        )
    ).scalar() or 0
    repos_total = int(personal_count) + int(assignment_repo_count)

    repos_week_delta = (
        await session.execute(
            select(func.count()).select_from(Repository).where(
                Repository.owner_id == student_id,
                Repository.created_at >= week_ago,
            )
        )
    ).scalar() or 0

    course_items: list[StudentDashboardCourseRead] = []
    for course in courses:
        course_assignments = [a for a in all_assignments if a.course_id == course.id]
        course_earned = 0.0
        course_max = 0.0
        for a in course_assignments:
            pts = _graded_points(ctx.submissions_map.get(a.id))
            if pts is not None:
                course_earned += pts
                course_max += float(course.grade_max)
        course_percent = _weighted_percent(course_earned, course_max)
        score_int = int(round(course_percent)) if course_percent is not None else None
        score_label = (
            f"{int(course_earned)} / {int(course_max)}"
            if course_max > 0
            else None
        )
        course_items.append(
            StudentDashboardCourseRead(
                id=str(course.id),
                platform_course_id=course.id,
                title=course.title,
                teacher_name=teachers.get(course.teacher_id),
                assignments_count=len(course_assignments),
                score=score_int,
                score_label=score_label,
                score_max=course.grade_max,
                score_color=_score_color(score_int, course.grade_max),
                source="platform",
                has_platform=True,
            )
        )

    repo_specs = await _student_repo_specs(session, student_id=student_id)
    commits_week = await _commits_week_count(
        session,
        student_id=student_id,
        week_ago=week_ago,
        repo_specs=repo_specs,
    )
    commits_week_avg = round(commits_week / 7, 1) if commits_week > 0 else None

    kpi = StudentDashboardKpiRead(
        repos_total=repos_total,
        repos_week_delta=int(repos_week_delta),
        commits_week=commits_week,
        commits_week_avg=commits_week_avg,
        courses_active=len(courses),
        assignments_total=len(all_assignments),
        deadlines_today=len(deadlines_today_titles),
        deadlines_today_sub=_deadlines_today_sub(deadlines_today_titles, next_title),
    )
    sidebar = StudentSidebarCountsRead(
        courses_count=len(courses),
        assignments_pending=pending_assignments,
    )

    deadline_items = [
        StudentDeadlineRead(
            id=f"{a.course_id}-{a.id}",
            assignment_id=a.id,
            course_id=a.course_id,
            name=a.title,
            course=course_title_by_id.get(a.course_id, "—"),
            deadline=a.deadline,
            urgency=_deadline_urgency(a.deadline, now),
        )
        for a in upcoming[:20]
    ]

    return StudentDashboardStatsRead(
        kpi=kpi,
        sidebar=sidebar,
        courses=course_items,
        deadlines=deadline_items,
    )


async def get_student_deadlines(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 100,
) -> list[StudentDeadlineDetailRead]:
    now = datetime.now(timezone.utc)
    today_start = _start_of_day(now)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)

    upcoming = sorted(
        [a for a in ctx.all_assignments if a.deadline >= today_start],
        key=lambda a: a.deadline,
    )

    items: list[StudentDeadlineDetailRead] = []
    for a in upcoming[:limit]:
        sub = ctx.submissions_map.get(a.id)
        submitted = bool(sub and sub.submitted_at)
        items.append(
            StudentDeadlineDetailRead(
                id=f"{a.course_id}-{a.id}",
                assignment_id=a.id,
                course_id=a.course_id,
                name=a.title,
                course=ctx.course_title_by_id.get(a.course_id, "—"),
                deadline=a.deadline,
                urgency=_deadline_urgency(a.deadline, now),
                submitted=submitted,
            )
        )
    return items


def _parse_fork_target(message: str | None) -> str | None:
    if not message:
        return None
    text = message.strip()
    if text.startswith("→"):
        return text[1:].strip() or None
    return text or None


async def get_student_forks(
    session: AsyncSession,
    *,
    student_id: UUID,
    limit: int = 100,
) -> list[StudentForkItemRead]:
    from app.services.student_forks_service import get_student_gitea_forks

    user = await session.get(User, student_id)
    if not user:
        return []
    rows = await get_student_gitea_forks(student_user=user)
    parsed: list[StudentForkItemRead] = []
    for row in rows[:limit]:
        updated = row.get("updated_at")
        if isinstance(updated, str):
            try:
                updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            except ValueError:
                updated_dt = None
        else:
            updated_dt = None
        parsed.append(StudentForkItemRead.model_validate({**row, "updated_at": updated_dt}))
    return parsed


async def get_student_grades(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 200,
) -> StudentGradesSummaryRead:
    now = datetime.now(timezone.utc)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    course_grade_max = {c.id: c.grade_max for c in ctx.courses}

    teachers: dict[UUID, str] = {}
    if ctx.courses:
        teacher_ids = list({c.teacher_id for c in ctx.courses})
        t_result = await session.execute(select(User.id, User.full_name).where(User.id.in_(teacher_ids)))
        teachers = {row[0]: row[1] for row in t_result.all()}

    course_summaries: list[StudentGradeCourseRead] = []
    items: list[StudentGradeItemRead] = []
    pending_review = 0
    graded_count = 0
    overall_earned = 0.0
    overall_max = 0.0
    course_percents: list[float] = []

    for course in ctx.courses:
        course_assignments = [a for a in ctx.all_assignments if a.course_id == course.id]
        assignments_graded = 0
        assignments_submitted = 0
        course_earned = 0.0
        course_max = 0.0

        for a in course_assignments:
            sub = ctx.submissions_map.get(a.id)
            submitted = bool(sub and sub.submitted_at)
            if submitted:
                assignments_submitted += 1
            points = _graded_points(sub)
            if points is not None:
                assignments_graded += 1
                course_earned += points
                course_max += float(course.grade_max)

        course_percent = _weighted_percent(course_earned, course_max)
        if course_percent is not None:
            course_percents.append(course_percent)
            overall_earned += course_earned
            overall_max += course_max

        course_summaries.append(
            StudentGradeCourseRead(
                course_id=course.id,
                title=course.title,
                teacher_name=teachers.get(course.teacher_id, "—"),
                grade_max=course.grade_max,
                average_score=int(round(course_percent)) if course_percent is not None else None,
                earned_points=course_earned,
                max_points=course_max,
                percent=course_percent,
                assignments_total=len(course_assignments),
                assignments_graded=assignments_graded,
                assignments_submitted=assignments_submitted,
            )
        )

    sorted_assignments = sorted(ctx.all_assignments, key=lambda a: a.deadline, reverse=True)
    for a in sorted_assignments[:limit]:
        sub = ctx.submissions_map.get(a.id)
        submitted = bool(sub and sub.submitted_at)
        grade = sub.grade if sub else None
        final_grade = sub.final_grade if sub else None
        grade_max = course_grade_max.get(a.course_id, 100)
        points = _graded_points(sub)
        item_percent = _weighted_percent(points, float(grade_max)) if points is not None else None

        if grade is not None or final_grade is not None:
            status = "graded"
            graded_count += 1
        elif submitted:
            status = "submitted"
            pending_review += 1
        elif a.deadline < now:
            status = "overdue"
        else:
            status = "pending"

        items.append(
            StudentGradeItemRead(
                assignment_id=a.id,
                course_id=a.course_id,
                course_title=ctx.course_title_by_id.get(a.course_id, "—"),
                title=a.title,
                grade=grade,
                final_grade=final_grade,
                grade_max=grade_max,
                percent=item_percent,
                status=status,
                graded_at=sub.graded_at if sub else None,
                submitted_at=sub.submitted_at if sub else None,
            )
        )

    overall_percent = _weighted_percent(overall_earned, overall_max)
    semester_average = (
        round(sum(course_percents) / len(course_percents), 1) if course_percents else None
    )

    return StudentGradesSummaryRead(
        overall_average=semester_average,
        overall_earned=overall_earned,
        overall_max=overall_max,
        overall_percent=overall_percent,
        graded_count=graded_count,
        pending_review=pending_review,
        courses=course_summaries,
        items=items,
    )


async def get_student_assignments(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 200,
) -> list[StudentAssignmentListItemRead]:
    now = datetime.now(timezone.utc)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    course_grade_max = {c.id: c.grade_max for c in ctx.courses}

    sorted_assignments = sorted(ctx.all_assignments, key=lambda a: a.deadline)

    items: list[StudentAssignmentListItemRead] = []
    for a in sorted_assignments[:limit]:
        sub = ctx.submissions_map.get(a.id)
        submitted = bool(sub and sub.submitted_at)
        grade = sub.grade if sub else None
        final_grade = sub.final_grade if sub else None
        grade_max = course_grade_max.get(a.course_id, 100)

        if grade is not None:
            status = "graded"
        elif submitted:
            status = "submitted"
        elif a.deadline < now:
            status = "overdue"
        else:
            status = "pending"

        items.append(
            StudentAssignmentListItemRead(
                id=a.id,
                course_id=a.course_id,
                course_title=ctx.course_title_by_id.get(a.course_id, "—"),
                title=a.title,
                description=a.description,
                deadline=a.deadline,
                start_date=a.start_date,
                submitted=submitted,
                grade=grade,
                final_grade=final_grade,
                grade_max=grade_max,
                status=status,
                urgency=_deadline_urgency(a.deadline, now),
            )
        )
    return items


async def get_student_repositories(
    session: AsyncSession,
    *,
    student_id: UUID,
    gitea_login: str | None,
) -> StudentRepositoriesRead:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    personal_result = await session.execute(
        select(Repository)
        .where(Repository.owner_id == student_id)
        .order_by(Repository.updated_at.desc())
    )
    personal_repos = list(personal_result.scalars().all())

    ar_result = await session.execute(
        select(StudentRepository, Assignment, Course)
        .join(Assignment, Assignment.id == StudentRepository.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(StudentRepository.student_id == student_id)
        .order_by(StudentRepository.created_at.desc())
    )

    items: list[StudentRepositoryItemRead] = []
    public_count = 0
    private_count = 0
    course_count = 0
    repos_week_delta = 0
    repo_specs: list[tuple[str, str]] = []

    student_user = await session.get(User, student_id)
    primary_owner = resolve_gitea_username(student_user) if student_user else (gitea_login or "user")

    for repo in personal_repos:
        visibility = repo.repo_type.value if hasattr(repo.repo_type, "value") else str(repo.repo_type)
        if visibility == "public":
            public_count += 1
        elif visibility == "course":
            course_count += 1
        else:
            private_count += 1
        if repo.created_at >= week_ago:
            repos_week_delta += 1

        repo_name = repo.gitea_repo_name or repo.name
        repo_specs.append((primary_owner, repo_name))
        items.append(
            StudentRepositoryItemRead(
                id=str(repo.id),
                name=repo.name,
                description=repo.description,
                gitea_path=f"{primary_owner}/{repo_name}",
                gitea_web_url=build_repo_web_url(primary_owner, repo_name),
                clone_url=build_clone_url(primary_owner, repo_name),
                language=repo.language,
                commits_count=None,
                visibility=visibility,
                source="personal",
                repository_id=repo.id,
                can_delete=True,
                updated_at=repo.updated_at,
            )
        )

    for student_repo, assignment, course in ar_result.all():
        course_count += 1
        repo_specs.append((primary_owner, student_repo.repo_name))
        items.append(
            StudentRepositoryItemRead(
                id=str(student_repo.id),
                name=student_repo.repo_name,
                description=assignment.description,
                gitea_path=f"{primary_owner}/{student_repo.repo_name}",
                gitea_web_url=build_repo_web_url(primary_owner, student_repo.repo_name),
                clone_url=build_clone_url(primary_owner, student_repo.repo_name),
                language=None,
                commits_count=None,
                visibility="course",
                source="assignment",
                assignment_label=f"{course.title} · {assignment.title}",
                course_id=course.id,
                assignment_id=assignment.id,
                can_delete=False,
                updated_at=student_repo.created_at,
            )
        )

    if repo_specs:
        gitea_stats = await enrich_repos_gitea_stats(repo_specs)

        async def _apply_gitea_row(
            item: StudentRepositoryItemRead,
            row: tuple[int | None, bool, str],
        ) -> StudentRepositoryItemRead:
            count, approx, resolved_owner = row
            repo_name = item.name
            language = item.language
            updated_at = item.updated_at
            forks_count: int | None = None
            stars_count: int | None = None
            open_pr_count: int | None = None

            meta = await get_repo_metadata(owner=resolved_owner, repo=repo_name)
            gitea_available = meta is not None
            if meta:
                parsed = stats_from_repo_metadata(meta)
                if not language:
                    language = parsed.get("language")
                forks_count = parsed.get("forks_count")
                stars_count = parsed.get("stars_count")
                open_pr_count = parsed.get("open_pr_count")
                if meta.get("updated_at"):
                    try:
                        updated_at = datetime.fromisoformat(
                            str(meta["updated_at"]).replace("Z", "+00:00")
                        )
                    except ValueError:
                        pass

            can_delete = item.source == "personal" or (
                item.source == "assignment" and not gitea_available
            )
            return item.model_copy(
                update={
                    "gitea_path": f"{resolved_owner}/{repo_name}" if gitea_available else None,
                    "gitea_web_url": build_repo_web_url(resolved_owner, repo_name)
                    if gitea_available
                    else None,
                    "clone_url": build_clone_url(resolved_owner, repo_name) if gitea_available else None,
                    "commits_count": count if gitea_available else None,
                    "commits_count_approx": approx,
                    "language": language,
                    "forks_count": forks_count,
                    "stars_count": stars_count,
                    "open_pr_count": open_pr_count,
                    "updated_at": updated_at,
                    "gitea_available": gitea_available,
                    "can_delete": can_delete,
                }
            )

        items = await asyncio.gather(
            *[_apply_gitea_row(item, row) for item, row in zip(items, gitea_stats, strict=True)]
        )

    items.sort(key=lambda x: x.updated_at, reverse=True)

    total_commits = sum(i.commits_count or 0 for i in items)
    commits_week = await _commits_week_count(
        session,
        student_id=student_id,
        week_ago=week_ago,
        repo_specs=repo_specs,
    )

    stats = StudentRepositoriesStatsRead(
        total=len(items),
        public_count=public_count,
        private_count=private_count,
        course_count=course_count,
        commits_week=commits_week,
        total_commits=total_commits,
        repos_week_delta=repos_week_delta,
    )
    return StudentRepositoriesRead(
        gitea_web_base=gitea_public_base_url(),
        stats=stats,
        repositories=items,
    )


async def get_student_recent_repositories(
    session: AsyncSession,
    *,
    student_id: UUID,
    limit: int = 5,
) -> list[StudentRecentRepositoryRead]:
    items: list[StudentRecentRepositoryRead] = []

    p_result = await session.execute(
        select(Repository)
        .where(Repository.owner_id == student_id)
        .order_by(Repository.updated_at.desc())
        .limit(limit * 2)
    )
    for repo in p_result.scalars().all():
        visibility = repo.repo_type.value if hasattr(repo.repo_type, "value") else str(repo.repo_type)
        items.append(
            StudentRecentRepositoryRead(
                id=str(repo.id),
                name=repo.name,
                assignment_label=None,
                language=repo.language,
                commits_count=None,
                updated_at=repo.updated_at,
                visibility=visibility,
                source="personal",
                repository_id=repo.id,
            )
        )

    ar_result = await session.execute(
        select(StudentRepository, Assignment, Course)
        .join(Assignment, Assignment.id == StudentRepository.assignment_id)
        .join(Course, Course.id == Assignment.course_id)
        .where(StudentRepository.student_id == student_id)
        .order_by(StudentRepository.created_at.desc())
        .limit(limit * 2)
    )
    for student_repo, assignment, course in ar_result.all():
        items.append(
            StudentRecentRepositoryRead(
                id=str(student_repo.id),
                name=student_repo.repo_name,
                assignment_label=f"{course.title} · {assignment.title}",
                language=None,
                commits_count=None,
                updated_at=student_repo.created_at,
                visibility="private",
                source="assignment",
                course_id=course.id,
                assignment_id=assignment.id,
            )
        )

    items.sort(key=lambda x: x.updated_at, reverse=True)
    trimmed = items[:limit]

    if trimmed:
        user_row = await session.get(User, student_id)
        primary_owner = resolve_gitea_username(user_row) if user_row else "user"
        specs = [(primary_owner, item.name) for item in trimmed]
        stats = await enrich_repos_gitea_stats(specs)
        trimmed = [
            item.model_copy(update={"commits_count": row[0]})
            for item, row in zip(trimmed, stats, strict=True)
        ]

    return trimmed


async def get_student_activity_summary(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
) -> StudentActivitySummaryRead:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)

    commits_week = await _count_student_commits_week(session, student_id=student_id, week_ago=week_ago)

    pr_result = await session.execute(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.activity_type == ActivityType.pull_request,
            ActivityLog.created_at >= week_ago,
        )
    )
    prs_open = int(pr_result.scalar() or 0)

    submitted = 0
    in_review = 0
    for sub in ctx.submissions_map.values():
        if sub.submitted_at and sub.submitted_at >= week_ago:
            submitted += 1
        if sub.submitted_at and sub.grade is None and sub.final_grade is None:
            in_review += 1

    pending = sum(
        1
        for a in ctx.all_assignments
        if a.deadline >= _start_of_day(now)
        and (
            (sub := ctx.submissions_map.get(a.id)) is None or sub.submitted_at is None
        )
    )
    submit_target = max(pending + submitted, 1)
    commits_part = min(commits_week / 20, 1.0) * 50
    submit_part = min(submitted / submit_target, 1.0) * 50
    week_progress_percent = min(100, int(commits_part + submit_part))

    return StudentActivitySummaryRead(
        week_progress_percent=week_progress_percent,
        commits=commits_week,
        prs_open=prs_open,
        submitted=submitted,
        in_review=in_review,
    )


def _feed_time_label(dt: datetime, now: datetime) -> str:
    diff = now - dt.astimezone(timezone.utc)
    minutes = int(diff.total_seconds() // 60)
    if minutes < 1:
        return "Только что"
    if minutes < 60:
        return f"{minutes} мин назад"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} ч назад"
    days = hours // 24
    if days == 1:
        return "Вчера"
    if days < 7:
        return f"{days} дн назад"
    return dt.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M")


async def get_student_activity_feed(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    limit: int = 12,
) -> list[StudentActivityFeedItemRead]:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=14)
    ctx = await _load_student_assignment_context(session, student_id=student_id, group_name=group_name)
    grade_max_by_course = {c.id: c.grade_max for c in ctx.courses}
    items: list[StudentActivityFeedItemRead] = []

    for assignment in ctx.all_assignments:
        sub = ctx.submissions_map.get(assignment.id)
        if sub and sub.graded_at and sub.graded_at >= since:
            score = _submission_points(sub)
            course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
            items.append(
                StudentActivityFeedItemRead(
                    id=f"grade-{sub.id}",
                    type="success",
                    text=f"{assignment.title} — ",
                    bold=f"оценка {score}",
                    text_after=f" · {course_title}",
                    time_label=_feed_time_label(sub.graded_at, now),
                    created_at=sub.graded_at,
                    badge=f"{score} / {grade_max_by_course.get(assignment.course_id, 100)}",
                    badge_variant="ok",
                    href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
                )
            )
        if sub and sub.comment and sub.comment.strip():
            updated_at = sub.graded_at or sub.submitted_at
            if updated_at and updated_at >= since:
                items.append(
                    StudentActivityFeedItemRead(
                        id=f"comment-{sub.id}",
                        type="comment",
                        text="Комментарий преподавателя к ",
                        bold=assignment.title,
                        text_after=f": «{sub.comment.strip()[:80]}{'…' if len(sub.comment.strip()) > 80 else ''}»",
                        time_label=_feed_time_label(updated_at, now),
                        created_at=updated_at,
                        badge="Новое",
                        badge_variant="warn",
                        href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
                    )
                )

    deadline_horizon = now + timedelta(days=3)
    for assignment in ctx.all_assignments:
        if assignment.deadline < now or assignment.deadline > deadline_horizon:
            continue
        sub = ctx.submissions_map.get(assignment.id)
        if sub and sub.submitted_at:
            continue
        days_left = (_start_of_day(assignment.deadline) - _start_of_day(now)).days
        days_label = "сегодня" if days_left <= 0 else f"{days_left} дн"
        course_title = ctx.course_title_by_id.get(assignment.course_id, "—")
        items.append(
            StudentActivityFeedItemRead(
                id=f"deadline-{assignment.id}",
                type="deadline",
                text="Дедлайн ",
                bold=days_label,
                text_after=f" — {assignment.title} · {course_title}",
                time_label="Напоминание",
                created_at=assignment.deadline,
                badge=days_label,
                badge_variant="err" if days_left <= 1 else "warn",
                href=f"/courses/{assignment.course_id}/assignments/{assignment.id}",
            )
        )

    log_result = await session.execute(
        select(ActivityLog)
        .where(
            ActivityLog.user_id == student_id,
            ActivityLog.created_at >= since,
            ActivityLog.activity_type.in_(
                [
                    ActivityType.commit,
                    ActivityType.push,
                    ActivityType.pull_request,
                    ActivityType.pr_comment,
                    ActivityType.repo_created,
                ]
            ),
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(30)
    )
    for log in log_result.scalars().all():
        if log.activity_type in (ActivityType.commit, ActivityType.push):
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="commit",
                    text="Коммит в ",
                    bold=log.repo_name or "репозиторий",
                    text_after=f" — {log.message[:60] if log.message else ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.pull_request:
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="pr",
                    text="Pull Request в ",
                    bold=log.repo_name or "репозиторий",
                    text_after=f" — {log.message[:60] if log.message else ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.pr_comment:
            pr_match = re.search(r"PR #(\d+)", log.message or "")
            pr_label = f"#{pr_match.group(1)}" if pr_match else ""
            comment_tail = log.message or ""
            if ": " in comment_tail:
                comment_tail = comment_tail.split(": ", 1)[-1][:80]
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="comment",
                    text="Комментарий к Pull Request ",
                    bold=pr_label or "в репозитории",
                    text_after=f" {log.repo_name or ''} — «{comment_tail}»" if comment_tail else f" {log.repo_name or ''}",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    badge="PR",
                    badge_variant="warn",
                    href="/repositories",
                )
            )
        elif log.activity_type == ActivityType.repo_created:
            items.append(
                StudentActivityFeedItemRead(
                    id=f"log-{log.id}",
                    type="repo",
                    text="Создан репозиторий ",
                    bold=log.repo_name or "",
                    time_label=_feed_time_label(log.created_at, now),
                    created_at=log.created_at,
                    href="/repositories",
                )
            )

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items[:limit]


async def get_student_group_ranking(
    session: AsyncSession,
    *,
    student_id: UUID,
    group_name: str | None,
    student_full_name: str,
) -> StudentGroupRankingRead:
    if not group_name:
        return StudentGroupRankingRead(
            group_name=None,
            your_name=student_full_name,
            entries=[],
        )

    students_result = await session.execute(
        select(User.id, User.full_name).where(
            User.role == UserRole.student,
            User.group_name == group_name,
        )
    )
    students = list(students_result.all())
    if not students:
        return StudentGroupRankingRead(group_name=group_name, your_name=student_full_name, entries=[])

    student_ids = [row[0] for row in students]
    points_by_student: dict[UUID, int] = {sid: 0 for sid in student_ids}

    subs_result = await session.execute(
        select(Submission.student_id, Submission.grade, Submission.final_grade).where(
            Submission.student_id.in_(student_ids),
            or_(Submission.grade.is_not(None), Submission.final_grade.is_not(None)),
        )
    )
    for sid, grade, final_grade in subs_result.all():
        if final_grade is not None:
            points_by_student[sid] = points_by_student.get(sid, 0) + int(round(final_grade))
        elif grade is not None:
            points_by_student[sid] = points_by_student.get(sid, 0) + grade

    names = {row[0]: row[1] for row in students}
    ranked = sorted(
        [(sid, names.get(sid, "—"), points_by_student.get(sid, 0)) for sid in student_ids],
        key=lambda x: x[2],
        reverse=True,
    )

    your_place: int | None = None
    your_points: int | None = None
    entries: list[StudentGroupRankingEntryRead] = []
    for place, (sid, name, pts) in enumerate(ranked, start=1):
        is_you = sid == student_id
        if is_you:
            your_place = place
            your_points = pts
        if place <= 3 or is_you:
            display_name = f"{name} (Вы)" if is_you else name
            entries.append(
                StudentGroupRankingEntryRead(
                    place=place,
                    student_id=sid,
                    name=display_name,
                    points=pts,
                    is_you=is_you,
                )
            )

    total = len(ranked)
    top_percent_label: str | None = None
    if your_place is not None and total > 0:
        percentile = (your_place / total) * 100
        if percentile <= 10:
            top_percent_label = "Топ 10%"
        elif percentile <= 25:
            top_percent_label = "Топ 25%"

    return StudentGroupRankingRead(
        group_name=group_name,
        your_place=your_place,
        your_points=your_points,
        your_name=student_full_name,
        top_percent_label=top_percent_label,
        entries=entries,
    )
