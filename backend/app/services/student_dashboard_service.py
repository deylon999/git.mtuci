from __future__ import annotations

import asyncio
import base64
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog, ActivityType
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.repository import Repository, RepositoryType
from app.models.student_repository import StudentRepository
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.notification import NotificationRead
from app.schemas.system import SystemInfoRead, build_system_info_read
from app.schemas.user import UserRead
from app.schemas.user_settings import UserSettingsRead
from app.services.user_settings_service import read_user_settings
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
    StudentDashboardBundleRead,
    StudentProfileBundleRead,
    StudentRecentRepositoryRead,
    StudentRepositoriesRead,
    StudentRepositoriesStatsRead,
    StudentRepositoryItemRead,
    StudentSidebarCountsRead,
)
from app.services.activity_service import log_repo_deleted
from app.services.course_service import list_student_courses
from app.services.repository_access_service import (
    raise_if_repository_blocked,
    repository_not_blocked_clause,
)
from app.utils.gitea_user import resolve_gitea_username
from app.utils.repo_name import assignment_repo_display_name
from app.services.gitea_repo_cache import (
    RepoGiteaSnapshot,
    batch_repo_snapshots,
    invalidate_gitea_repo_cache,
)
from app.services.gitea_service import (
    GiteaAuthError,
    build_authenticated_clone_url,
    build_clone_url,
    build_repo_web_url,
    create_gitea_user_access_token,
    delete_repository as delete_gitea_repository,
    ensure_gitea_user,
    gitea_public_base_url,
    resolve_repo_owner,
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


def _positive_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, str):
        try:
            return max(0, int(value.strip()))
        except ValueError:
            return 0
    return 0


def _compare_has_head_commits(cmp: dict | None) -> bool:
    if not isinstance(cmp, dict):
        return False
    if _positive_int(cmp.get("ahead_by")) > 0:
        return True
    if _positive_int(cmp.get("total_commits")) > 0:
        return True
    commits = cmp.get("commits")
    if isinstance(commits, list) and len(commits) > 0:
        return True
    status_value = str(cmp.get("status") or "").strip().lower()
    return status_value in {"ahead", "diverged"}


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


def _assignments_for_deadline_list(
    assignments: list,
    submissions_map: dict,
    *,
    now: datetime,
    today_start: datetime,
) -> list:
    """Upcoming (from today) plus unsubmitted past-deadline work (assignments «overdue»)."""
    upcoming = [a for a in assignments if a.deadline >= today_start]
    overdue: list = []
    for a in assignments:
        if a.deadline >= now:
            continue
        sub = submissions_map.get(a.id)
        if sub and sub.submitted_at:
            continue
        overdue.append(a)
    upcoming_ids = {a.id for a in upcoming}
    merged = overdue + [a for a in upcoming if a.id not in upcoming_ids]
    return sorted(merged, key=lambda a: a.deadline)


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
        select(Repository).where(
            Repository.owner_id == student_id,
            repository_not_blocked_clause(),
        )
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
) -> int:
    """Commits in the last 7 days from platform activity_log (webhooks), no Gitea pagination."""
    return await _count_student_commits_week(session, student_id=student_id, week_ago=week_ago)


def _apply_repo_snapshot(
    item: StudentRepositoryItemRead,
    snap: RepoGiteaSnapshot,
    *,
    include_commit_totals: bool,
) -> StudentRepositoryItemRead:
    gitea_available = snap.exists
    parsed = snap.parsed_stats if snap.metadata else {}
    language = item.language or parsed.get("language")
    forks_count = parsed.get("forks_count")
    stars_count = parsed.get("stars_count")
    open_pr_count = parsed.get("open_pr_count")
    updated_at = item.updated_at
    if snap.metadata and snap.metadata.get("updated_at"):
        try:
            updated_at = datetime.fromisoformat(str(snap.metadata["updated_at"]).replace("Z", "+00:00"))
        except ValueError:
            pass

    if item.gitea_path and "/" in item.gitea_path:
        repo_name = item.gitea_path.split("/", 1)[1]
    else:
        repo_name = item.name
    resolved_owner = snap.resolved_owner
    commits_count = snap.commits_total if include_commit_totals and gitea_available else None
    commits_approx = snap.commits_total_approx if include_commit_totals else False
    can_delete = item.source == "personal" or (item.source == "assignment" and not gitea_available)

    return item.model_copy(
        update={
            "gitea_path": f"{resolved_owner}/{repo_name}" if gitea_available else None,
            "gitea_web_url": build_repo_web_url(resolved_owner, repo_name) if gitea_available else None,
            "clone_url": build_clone_url(resolved_owner, repo_name) if gitea_available else None,
            "commits_count": commits_count,
            "commits_count_approx": commits_approx,
            "language": language,
            "forks_count": forks_count,
            "stars_count": stars_count,
            "open_pr_count": open_pr_count,
            "updated_at": updated_at,
            "gitea_available": gitea_available,
            "can_delete": can_delete,
        }
    )


async def _student_repositories_stats_db(
    session: AsyncSession,
    *,
    student_id: UUID,
    week_ago: datetime,
) -> StudentRepositoriesStatsRead:
    """Repository counters for profile bundle — DB only, no Gitea HTTP."""
    personal_result = await session.execute(
        select(Repository).where(
            Repository.owner_id == student_id,
            repository_not_blocked_clause(),
        )
    )
    personal_repos = list(personal_result.scalars().all())

    ar_result = await session.execute(
        select(StudentRepository).where(StudentRepository.student_id == student_id)
    )
    assignment_repos = list(ar_result.scalars().all())

    public_count = 0
    private_count = 0
    course_count = 0
    repos_week_delta = 0
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
    course_count += len(assignment_repos)

    total = len(personal_repos) + len(assignment_repos)
    commits_week = await _commits_week_count(session, student_id=student_id, week_ago=week_ago)

    return StudentRepositoriesStatsRead(
        total=total,
        public_count=public_count,
        private_count=private_count,
        course_count=course_count,
        commits_week=commits_week,
        total_commits=0,
        repos_week_delta=repos_week_delta,
    )


@dataclass
class StudentRepoGiteaTarget:
    owner: str
    repo_name: str
    display_name: str
    source: str


def _normalize_repo_path(path: str) -> str:
    return path.strip().strip("/")


_GIT_REF_RE = re.compile(r"^[A-Za-z0-9._/\-]+$")


def _validate_git_ref(ref: str) -> str:
    cleaned = (ref or "").strip()
    if not cleaned:
        raise ValueError("Git ref is required")
    if ".." in cleaned or cleaned.startswith("-") or cleaned.endswith("/") or cleaned.startswith("/"):
        raise ValueError("Invalid git ref")
    if not _GIT_REF_RE.fullmatch(cleaned):
        raise ValueError("Invalid git ref")
    return cleaned


async def ensure_student_gitea_clone_token(session: AsyncSession, user: User) -> str:
    """Personal access token for git clone without interactive login (stored in preferences)."""
    prefs: dict = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    existing = str(prefs.get("gitea_clone_token") or "").strip()
    if existing and await verify_gitea_access_token(existing):
        return existing

    username = resolve_gitea_username(user)
    username = await ensure_gitea_user(username, email=user.email)
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
    # Block clone for blocked personal repositories (view-only allowed).
    personal_repo: Repository | None = None
    try:
        item_uuid = UUID(repo_item_id)
        repo_row = await session.execute(
            select(Repository).where(
                Repository.id == item_uuid,
                Repository.owner_id == student_id,
            )
        )
        personal_repo = repo_row.scalar_one_or_none()
        if personal_repo:
            raise_if_repository_blocked(personal_repo)
    except ValueError:
        pass

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
    if isinstance(meta, dict) and "private" in meta:
        is_private = bool(meta.get("private"))
    elif personal_repo is not None:
        is_private = personal_repo.repo_type == RepositoryType.private
    else:
        # If Gitea metadata is temporarily unavailable, prefer public clone UX
        # instead of forcing private-token flow.
        is_private = False

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
    owner = await ensure_gitea_user(owner, email=student_user.email)
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

    repo_type = repo.repo_type
    if isinstance(repo_type, RepositoryType):
        is_private = repo_type == RepositoryType.private
    else:
        is_private = str(repo_type) == "private"

    try:
        await create_personal_repository_in_gitea(
            owner_username=owner,
            owner_email=student_user.email,
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

    from app.services.repo_access_service import get_user_repo_access_role

    shared = await session.execute(select(Repository).where(Repository.id == item_uuid))
    shared_repo = shared.scalar_one_or_none()
    if shared_repo and shared_repo.owner_id and shared_repo.owner_id != student_id:
        access_role = await get_user_repo_access_role(
            session, user=student_user, repo=shared_repo
        )
        if access_role is not None:
            owner_user = await session.get(User, shared_repo.owner_id)
            if not owner_user:
                raise ValueError("Repository owner not found")
            repo_name = (shared_repo.gitea_repo_name or shared_repo.name or "").strip()
            if not repo_name:
                raise ValueError("У репозитория нет имени.")
            shared_owner = resolve_gitea_username(owner_user)
            gitea_owner = await resolve_repo_owner(primary_owner=shared_owner, repo_name=repo_name)
            return StudentRepoGiteaTarget(
                owner=gitea_owner,
                repo_name=repo_name,
                display_name=shared_repo.name,
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
        assign_row = await session.execute(
            select(Assignment.title, Course.title)
            .join(Course, Course.id == Assignment.course_id)
            .where(Assignment.id == student_repo.assignment_id)
        )
        assign_meta = assign_row.one_or_none()
        display_name = (
            assignment_repo_display_name(assign_meta[0], course_title=assign_meta[1])
            if assign_meta
            else student_repo.repo_name
        )
        return StudentRepoGiteaTarget(
            owner=owner,
            repo_name=repo_name,
            display_name=display_name,
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


def _parse_gitea_file_history_commit(item: dict) -> dict:
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else item
    if not isinstance(commit, dict):
        commit = item
    msg = str(commit.get("message") or "").strip()
    if "\n" in msg:
        msg = msg.split("\n", 1)[0].strip()
    author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
    user = item.get("author") if isinstance(item.get("author"), dict) else {}
    sha = str(item.get("sha") or commit.get("sha") or "").strip()
    return {
        "sha": sha,
        "message": msg or None,
        "author_name": str(author.get("name") or "").strip() or None,
        "author_login": str(user.get("login") or "").strip() or None,
        "authored_at": author.get("date"),
        "web_url": str(item.get("html_url") or "").strip() or None,
    }


def _parse_gitea_blame_chunk(item: dict, fallback_start_line: int) -> tuple[dict, int]:
    commit = item.get("commit") if isinstance(item.get("commit"), dict) else {}
    author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
    user = item.get("author") if isinstance(item.get("author"), dict) else {}
    msg = str(commit.get("message") or "").strip()
    if "\n" in msg:
        msg = msg.split("\n", 1)[0].strip()

    lines = item.get("lines")
    line_count = len(lines) if isinstance(lines, list) else 0
    if line_count <= 0:
        line_count = int(item.get("line_count") or 0)
    if line_count <= 0:
        line_count = 1

    raw_start = item.get("line_no")
    if not isinstance(raw_start, int) or raw_start < 1:
        raw_start = item.get("line_number")
    if not isinstance(raw_start, int) or raw_start < 1:
        raw_start = item.get("start_line")
    start_line = raw_start if isinstance(raw_start, int) and raw_start > 0 else fallback_start_line
    end_line = start_line + line_count - 1
    sha = str(item.get("sha") or commit.get("id") or commit.get("sha") or "").strip()

    parsed = {
        "sha": sha,
        "message": msg or None,
        "author_name": str(author.get("name") or user.get("full_name") or "").strip() or None,
        "author_login": str(user.get("login") or author.get("username") or "").strip() or None,
        "authored_at": author.get("date"),
        "web_url": str(item.get("html_url") or "").strip() or None,
        "start_line": start_line,
        "end_line": end_line,
        "line_count": line_count,
    }
    return parsed, end_line + 1


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

    # "Blocked" is a DB flag for personal repositories. For assignment repos it's always False.
    is_blocked = False
    try:
        item_uuid = UUID(repo_item_id)
        repo_row = await session.execute(
            select(Repository.is_blocked).where(
                Repository.id == item_uuid,
                Repository.owner_id == student_id,
            )
        )
        is_blocked = bool(repo_row.scalar_one_or_none() or False)
    except ValueError:
        is_blocked = False

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
        "is_blocked": is_blocked,
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


async def create_student_repository_branch(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    name: str,
    from_ref: str,
) -> None:
    """Create branch for personal repository (assignment repos are read-only here)."""
    from app.services.gitea_service import create_repo_branch

    try:
        item_uuid = UUID(repo_item_id)
    except ValueError as exc:
        raise ValueError("Cannot create branches for this repository") from exc

    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == item_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if not personal_repo:
        raise ValueError("Cannot create branches for this repository")
    raise_if_repository_blocked(personal_repo)

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    await create_repo_branch(owner=target.owner, repo=target.repo_name, name=name, from_ref=from_ref)


async def delete_student_repository_branch(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    name: str,
) -> None:
    """Delete branch for personal repository (assignment repos are read-only here)."""
    from app.services.gitea_service import delete_repo_branch

    try:
        item_uuid = UUID(repo_item_id)
    except ValueError as exc:
        raise ValueError("Cannot delete branches for this repository") from exc

    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == item_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if not personal_repo:
        raise ValueError("Cannot delete branches for this repository")
    raise_if_repository_blocked(personal_repo)

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    await delete_repo_branch(owner=target.owner, repo=target.repo_name, name=name)


def _parse_gitea_issue(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    labels = [
        str(lb.get("name") or "").strip()
        for lb in (item.get("labels") or [])
        if isinstance(lb, dict) and lb.get("name")
    ]
    assignees = [
        str(a.get("login") or "").strip()
        for a in (item.get("assignees") or [])
        if isinstance(a, dict) and (a.get("login") or "")
    ]
    milestone = item.get("milestone") if isinstance(item.get("milestone"), dict) else {}
    return {
        "number": int(item.get("number") or 0),
        "title": str(item.get("title") or "Без названия").strip(),
        "body": str(item.get("body") or "").strip() or None,
        "state": str(item.get("state") or "open"),
        "author_name": str(user.get("login") or user.get("full_name") or "").strip() or None,
        "labels": labels,
        "assignees": assignees,
        "milestone": str(milestone.get("title") or "").strip() or None,
        "comments_count": int(item.get("comments") or 0),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def _parse_gitea_pull(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    head = item.get("head") if isinstance(item.get("head"), dict) else {}
    base = item.get("base") if isinstance(item.get("base"), dict) else {}
    commits_count = item.get("commits") if item.get("commits") is not None else item.get("commits_count")
    return {
        "number": int(item.get("number") or 0),
        "title": str(item.get("title") or "Без названия").strip(),
        "state": str(item.get("state") or "open"),
        "author_name": str(user.get("login") or user.get("full_name") or "").strip() or None,
        "head_branch": str(head.get("ref") or "").strip() or None,
        "base_branch": str(base.get("ref") or "").strip() or None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "merged": item.get("merged") if item.get("merged") is not None else None,
        "commits_count": int(commits_count) if commits_count is not None else None,
    }


def _parse_gitea_pull_file(item: dict) -> dict:
    return {
        "filename": str(item.get("filename") or "").strip(),
        "status": str(item.get("status") or "").strip() or None,
        "additions": int(item.get("additions") or 0),
        "deletions": int(item.get("deletions") or 0),
        "changes": int(item.get("changes") or 0),
        "previous_filename": str(item.get("previous_filename") or "").strip() or None,
    }


def _parse_gitea_pull_review(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    return {
        "id": int(item.get("id") or 0),
        "state": str(item.get("state") or "").strip() or None,
        "body": str(item.get("body") or "").strip() or None,
        "dismissed": bool(item.get("dismissed") or False),
        "comments_count": int(item.get("comments_count") or 0),
        "user_login": str(user.get("login") or "").strip() or None,
        "user_name": str(user.get("full_name") or "").strip() or None,
        "submitted_at": item.get("submitted_at"),
        "updated_at": item.get("updated_at"),
    }


def _parse_gitea_pull_review_comment(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    review_id = item.get("pull_request_review_id")
    return {
        "id": int(item.get("id") or 0),
        "review_id": int(review_id) if review_id is not None else None,
        "body": str(item.get("body") or "").strip(),
        "path": str(item.get("path") or "").strip() or None,
        "position": int(item.get("position")) if item.get("position") is not None else None,
        "original_position": int(item.get("original_position"))
        if item.get("original_position") is not None
        else None,
        "user_login": str(user.get("login") or "").strip() or None,
        "user_name": str(user.get("full_name") or "").strip() or None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def _build_gitea_pull_threads(
    comments: list[dict],
) -> list[dict]:
    groups: dict[tuple[str, int | None, int | None], list[dict]] = {}
    for comment in comments:
        path = str(comment.get("path") or "").strip()
        if not path:
            continue
        pos = comment.get("position")
        orig = comment.get("original_position")
        key = (path, int(pos) if isinstance(pos, int) else None, int(orig) if isinstance(orig, int) else None)
        groups.setdefault(key, []).append(comment)

    threads: list[dict] = []
    for (path, pos, orig), rows in groups.items():
        ordered = sorted(rows, key=lambda row: str(row.get("created_at") or ""))
        threads.append(
            {
                "path": path,
                "position": pos,
                "original_position": orig,
                "comments": ordered,
            }
        )
    threads.sort(
        key=lambda row: (
            str(row.get("path") or ""),
            row.get("position") if isinstance(row.get("position"), int) else -1,
            row.get("original_position") if isinstance(row.get("original_position"), int) else -1,
        )
    )
    return threads


def _parse_gitea_pull_discussion_comment(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    return {
        "id": int(item.get("id") or 0),
        "body": str(item.get("body") or "").strip(),
        "user_login": str(user.get("login") or "").strip() or None,
        "user_name": str(user.get("full_name") or "").strip() or None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def _parse_gitea_pull_detail(item: dict) -> dict:
    user = item.get("user") if isinstance(item.get("user"), dict) else {}
    head = item.get("head") if isinstance(item.get("head"), dict) else {}
    base = item.get("base") if isinstance(item.get("base"), dict) else {}
    return {
        "number": int(item.get("number") or 0),
        "title": str(item.get("title") or "Без названия").strip(),
        "state": str(item.get("state") or "open"),
        "body": str(item.get("body") or "").strip() or None,
        "author_name": str(user.get("full_name") or user.get("login") or "").strip() or None,
        "author_login": str(user.get("login") or "").strip() or None,
        "head_branch": str(head.get("ref") or "").strip() or None,
        "base_branch": str(base.get("ref") or "").strip() or None,
        "head_sha": str(head.get("sha") or "").strip() or None,
        "base_sha": str(base.get("sha") or "").strip() or None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "merged": item.get("merged") if item.get("merged") is not None else None,
        "mergeable": item.get("mergeable") if item.get("mergeable") is not None else None,
        "draft": item.get("draft") if item.get("draft") is not None else None,
        "comments_count": int(item.get("comments") or 0),
        "review_comments_count": int(item.get("review_comments") or 0),
        "commits_count": int(item.get("commits")) if item.get("commits") is not None else None,
        "changed_files_count": int(item.get("changed_files")) if item.get("changed_files") is not None else None,
        "web_url": str(item.get("html_url") or "").strip() or None,
        "diff_url": str(item.get("diff_url") or "").strip() or None,
        "patch_url": str(item.get("patch_url") or "").strip() or None,
    }


def _check_id_for_status_context(context: str) -> str:
    raw = context.strip()
    token = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")
    return f"status:{token}"


def _decode_check_status_context(check_id: str) -> str | None:
    if not check_id.startswith("status:"):
        return None
    token = check_id.split(":", 1)[1]
    if not token:
        return None
    padded = token + "=" * (-len(token) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return None


def _check_id_for_action_run(run_id: int, job_id: int | None) -> str:
    return f"run:{run_id}:{job_id or 0}"


def _parse_action_run_check_id(check_id: str) -> tuple[int | None, int | None]:
    if not check_id.startswith("run:"):
        return None, None
    parts = check_id.split(":")
    if len(parts) != 3:
        return None, None
    try:
        run_id = int(parts[1])
    except ValueError:
        return None, None
    try:
        job_id = int(parts[2])
    except ValueError:
        job_id = 0
    return run_id if run_id > 0 else None, job_id if job_id > 0 else None


def _check_state_from_status(state: str) -> str:
    val = state.strip().lower()
    if val == "completed":
        return "success"
    if val in {"success", "skipped", "neutral"}:
        return "success"
    if val in {"queued", "waiting", "requested"}:
        return "queued"
    if val in {"pending", "in_progress", "running"}:
        return "running"
    if val in {"cancelled", "canceled"}:
        return "cancelled"
    if val in {"failure", "error", "timed_out", "action_required"}:
        return "failure"
    return "unknown"


def _build_pull_check_items(
    *,
    commit_statuses_raw: list[dict],
    action_runs_raw: list[dict],
) -> tuple[list[dict], list[str]]:
    latest_by_context: dict[str, tuple[str, dict]] = {}
    for row in commit_statuses_raw:
        if not isinstance(row, dict):
            continue
        context = str(row.get("context") or row.get("name") or "").strip()
        if not context:
            continue
        marker = str(row.get("updated_at") or row.get("created_at") or "")
        prev = latest_by_context.get(context)
        if prev is None or marker >= prev[0]:
            latest_by_context[context] = (marker, row)

    items: list[dict] = []
    successful_contexts: list[str] = []
    for context in sorted(latest_by_context.keys(), key=lambda v: v.lower()):
        row = latest_by_context[context][1]
        state = _check_state_from_status(str(row.get("state") or ""))
        if state == "success":
            successful_contexts.append(context)
        items.append(
            {
                "id": _check_id_for_status_context(context),
                "name": context,
                "source": "commit_status",
                "state": state,
                "description": str(row.get("description") or "").strip() or None,
                "details_url": str(row.get("target_url") or row.get("url") or "").strip() or None,
                "run_id": None,
                "job_id": None,
                "can_retry": False,
                "has_logs": False,
            }
        )

    for run in action_runs_raw:
        if not isinstance(run, dict):
            continue
        run_id_raw = run.get("id")
        run_id = int(run_id_raw) if isinstance(run_id_raw, int) and run_id_raw > 0 else None
        name = str(run.get("display_title") or run.get("name") or "").strip() or f"Run {run_id or '?'}"
        run_status = str(run.get("status") or "").strip().lower()
        run_conclusion = str(run.get("conclusion") or "").strip().lower()
        raw_state = run_conclusion or run_status
        state = _check_state_from_status(raw_state)
        items.append(
            {
                "id": _check_id_for_action_run(run_id or 0, None),
                "name": name,
                "source": "action_run",
                "state": state,
                "description": (
                    str(run.get("event") or "").strip()
                    or str(run.get("head_branch") or "").strip()
                    or None
                ),
                "details_url": str(run.get("html_url") or run.get("url") or "").strip() or None,
                "run_id": run_id,
                "job_id": None,
                "can_retry": bool(run_id),
                "has_logs": False,
            }
        )
    return items, sorted(dict.fromkeys(successful_contexts), key=lambda v: v.lower())


def _pull_checks_from_detail(
    detail: dict,
    *,
    required_contexts: list[str] | None = None,
    successful_contexts: list[str] | None = None,
    check_items: list[dict] | None = None,
    policy_reasons: list[str] | None = None,
    required_approvals: int = 0,
    approvals: int = 0,
    required_reviewer_logins: list[str] | None = None,
    approved_reviewer_logins: list[str] | None = None,
) -> dict:
    merged = bool(detail.get("merged"))
    state = str(detail.get("state") or "open")
    draft = bool(detail.get("draft"))
    mergeable_raw = detail.get("mergeable")
    mergeable = mergeable_raw if isinstance(mergeable_raw, bool) else None
    conflict_state = "unknown"
    if mergeable is True:
        conflict_state = "clean"
    elif mergeable is False:
        conflict_state = "conflicting"

    can_merge = state == "open" and not merged and not draft and mergeable is True
    blocked_reason: str | None = None
    if merged:
        blocked_reason = "already_merged"
    elif state != "open":
        blocked_reason = "not_open"
    elif draft:
        blocked_reason = "draft"
    elif mergeable is False:
        blocked_reason = "conflicts"
    elif mergeable is None:
        blocked_reason = "mergeability_unknown"

    required = [c for c in (required_contexts or []) if str(c).strip()]
    ok = {c.strip() for c in (successful_contexts or []) if c and c.strip()}
    missing = [c for c in required if c.strip() and c.strip() not in ok]
    reasons = [str(r).strip() for r in (policy_reasons or []) if str(r).strip()]
    if missing and blocked_reason is None:
        blocked_reason = "required_checks_missing"
    if missing or reasons:
        can_merge = False

    required_reviewers_norm = sorted(
        {str(x).strip().lower() for x in (required_reviewer_logins or []) if str(x).strip()}
    )
    approved_reviewers_norm = sorted(
        {str(x).strip().lower() for x in (approved_reviewer_logins or []) if str(x).strip()}
    )
    missing_required_reviewers = sorted(
        set(required_reviewers_norm) - set(approved_reviewers_norm)
    )
    if missing_required_reviewers and blocked_reason is None:
        blocked_reason = "required_reviewers_missing"
    if reasons and blocked_reason is None:
        blocked_reason = "branch_policy"

    return {
        "can_merge": can_merge,
        "mergeable": mergeable,
        "conflict_state": conflict_state,
        "blocked_reason": blocked_reason,
        "policy_reasons": reasons,
        "required_approvals": int(required_approvals),
        "approvals": int(approvals),
        "required_contexts": required,
        "successful_contexts": sorted(ok, key=lambda v: v.lower()),
        "missing_required_contexts": missing,
        "required_reviewer_logins": required_reviewers_norm,
        "approved_reviewer_logins": approved_reviewers_norm,
        "missing_required_reviewer_logins": missing_required_reviewers,
        "items": check_items or [],
    }


async def _ensure_repo_not_blocked_for_write(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
) -> None:
    try:
        item_uuid = UUID(repo_item_id)
    except ValueError:
        return
    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == item_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if personal_repo:
        raise_if_repository_blocked(personal_repo)


def _summarize_review_states_for_policy(reviews: list[dict]) -> tuple[int, bool, set[str]]:
    """
    Return (approvals_count, has_rejected_review) using latest state per reviewer.
    """
    latest_by_reviewer: dict[str, tuple[str, str]] = {}
    state_alias = {
        "APPROVED": "APPROVED",
        "LGTM": "APPROVED",
        "CHANGES_REQUESTED": "CHANGES_REQUESTED",
        "REQUEST_CHANGES": "CHANGES_REQUESTED",
        "COMMENTED": "COMMENTED",
        "PENDING": "PENDING",
    }
    for review in reviews:
        if not isinstance(review, dict):
            continue
        reviewer = str(review.get("user_login") or review.get("user_name") or "").strip().lower()
        if not reviewer:
            continue
        if bool(review.get("dismissed")):
            continue
        raw_state = str(review.get("state") or "").strip().upper()
        state = state_alias.get(raw_state, raw_state)
        if not state:
            continue
        marker = str(review.get("submitted_at") or review.get("updated_at") or review.get("created_at") or "")
        prev = latest_by_reviewer.get(reviewer)
        if prev is None or marker >= prev[1]:
            latest_by_reviewer[reviewer] = (state, marker)

    approvals = 0
    rejected = False
    for state, _marker in latest_by_reviewer.values():
        if state == "APPROVED":
            approvals += 1
        elif state in {"CHANGES_REQUESTED", "REQUEST_CHANGES"}:
            rejected = True
    # rebuild approved reviewer logins from latest map to avoid leaking marker value
    approved_logins = {
        reviewer
        for reviewer, (state, _ts) in latest_by_reviewer.items()
        if state == "APPROVED"
    }
    return approvals, rejected, approved_logins


async def _required_status_contexts_for_pull(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    base_branch: str,
) -> list[str]:
    from app.services.repo_settings_service import list_branch_protections, match_branch_protection_rule

    try:
        repo_uuid = UUID(repo_item_id)
    except ValueError:
        return []
    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == repo_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if not personal_repo:
        return []
    rules = await list_branch_protections(session, repo=personal_repo)
    rule = match_branch_protection_rule(rules, branch=base_branch)
    if rule is None or not rule.require_status_checks:
        return []
    return [c for c in (rule.status_check_contexts or []) if str(c).strip()]


async def _enforce_branch_policy_for_pull_merge(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
) -> None:
    """
    Enforce branch protection policy for personal repositories before merge.
    """
    from app.services.repo_settings_service import (
        evaluate_merge_policy,
        list_branch_protections,
        match_branch_protection_rule,
    )

    try:
        repo_uuid = UUID(repo_item_id)
    except ValueError:
        return

    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == repo_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if not personal_repo:
        # Assignment repositories currently don't have branch-protection config in local DB.
        return

    rules = await list_branch_protections(session, repo=personal_repo)
    if not rules:
        return

    bundle = await get_student_repository_pull_detail_bundle(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
        pull_number=pull_number,
    )
    pull = bundle.get("pull") if isinstance(bundle, dict) else {}
    base_branch = str((pull or {}).get("base_branch") or "").strip()
    if not base_branch:
        return
    rule = match_branch_protection_rule(rules, branch=base_branch)
    if rule is None:
        return

    approvals, has_rejected_review, approved_reviewers = _summarize_review_states_for_policy(
        bundle.get("reviews", []) if isinstance(bundle, dict) else []
    )
    checks = bundle.get("checks", {}) if isinstance(bundle, dict) else {}
    successful_checks = [
        str(c).strip()
        for c in (checks.get("successful_contexts") or [])
        if str(c).strip()
    ]
    decision = evaluate_merge_policy(
        required_approvals=rule.required_approvals,
        require_status_checks=rule.require_status_checks,
        required_status_contexts=rule.status_check_contexts,
        required_reviewer_logins=rule.required_reviewer_logins,
        block_on_rejected_reviews=rule.block_on_rejected_reviews,
        approvals=approvals,
        successful_checks=successful_checks,
        approved_reviewer_logins=sorted(approved_reviewers),
        has_rejected_review=has_rejected_review,
    )
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Merge blocked by branch policy: {'; '.join(decision.reasons)}",
        )


async def get_student_repository_issues(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    page: int = 1,
    limit: int = 20,
    state: str = "open",
    q: str | None = None,
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
    query = (q or "").strip().lower()
    if query:
        issues = [
            i
            for i in issues
            if query in (i.get("title") or "").lower()
            or query in (i.get("body") or "").lower()
            or any(query in lb.lower() for lb in (i.get("labels") or []))
            or any(query in a.lower() for a in (i.get("assignees") or []))
        ]
    return {"issues": issues, "page": page, "has_more": has_more}


async def create_student_repository_issue(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    title: str,
    body: str | None = None,
    labels: list[str] | None = None,
    assignees: list[str] | None = None,
    milestone: str | None = None,
) -> dict:
    from app.services.gitea_service import create_repo_issue

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    created = await create_repo_issue(
        owner=target.owner,
        repo=target.repo_name,
        title=title,
        body=body,
        labels=labels,
        assignees=assignees,
        milestone=milestone,
    )
    return _parse_gitea_issue(created)


async def update_student_repository_issue(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    issue_number: int,
    title: str | None = None,
    body: str | None = None,
    state: str | None = None,
    labels: list[str] | None = None,
    assignees: list[str] | None = None,
    milestone: str | None = None,
) -> dict:
    from app.services.gitea_service import update_repo_issue

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    updated = await update_repo_issue(
        owner=target.owner,
        repo=target.repo_name,
        index=issue_number,
        title=title,
        body=body,
        state=state,
        labels=labels,
        assignees=assignees,
        milestone=milestone,
    )
    return _parse_gitea_issue(updated)


async def react_student_repository_issue(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    issue_number: int,
    content: str,
) -> dict:
    from app.services.gitea_service import add_issue_reaction

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    return await add_issue_reaction(
        owner=target.owner,
        repo=target.repo_name,
        index=issue_number,
        content=content,
    )


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


async def create_student_repository_pull_request(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    title: str,
    head: str,
    base: str,
    body: str | None = None,
) -> dict:
    from app.services.gitea_service import create_pull_request

    # Only personal repos are writable; assignment repos are treated read-only in the app.
    try:
        item_uuid = UUID(repo_item_id)
    except ValueError as exc:
        raise ValueError("Cannot create pull requests for this repository") from exc

    repo_row = await session.execute(
        select(Repository).where(
            Repository.id == item_uuid,
            Repository.owner_id == student_id,
        )
    )
    personal_repo = repo_row.scalar_one_or_none()
    if not personal_repo:
        raise ValueError("Cannot create pull requests for this repository")
    raise_if_repository_blocked(personal_repo)

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    pr = await create_pull_request(
        owner=target.owner,
        repo=target.repo_name,
        title=title,
        head=head,
        base=base,
        body=body,
    )
    return _parse_gitea_pull(pr)


async def get_student_repository_pull_detail_bundle(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
) -> dict:
    from app.services.gitea_service import (
        list_commit_statuses,
        list_repo_action_runs,
        get_pull_request,
        get_pull_request_diff_text,
        list_issue_comments,
        list_pull_request_files,
        list_pull_review_comments,
        list_pull_reviews,
    )

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    pull_raw = await get_pull_request(
        owner=target.owner,
        repo=target.repo_name,
        index=pull_number,
    )
    if not pull_raw:
        raise ValueError("Pull request not found")

    head_sha = str((pull_raw.get("head") or {}).get("sha") or "").strip()
    files_raw, reviews_raw, discussion_raw, diff_text, commit_statuses_raw, action_runs_raw = await asyncio.gather(
        list_pull_request_files(owner=target.owner, repo=target.repo_name, index=pull_number),
        list_pull_reviews(owner=target.owner, repo=target.repo_name, index=pull_number),
        list_issue_comments(owner=target.owner, repo=target.repo_name, index=pull_number),
        get_pull_request_diff_text(owner=target.owner, repo=target.repo_name, index=pull_number),
        list_commit_statuses(owner=target.owner, repo=target.repo_name, sha=head_sha) if head_sha else asyncio.sleep(0, result=[]),
        list_repo_action_runs(owner=target.owner, repo=target.repo_name, head_sha=head_sha) if head_sha else asyncio.sleep(0, result=[]),
    )
    reviews = [_parse_gitea_pull_review(item) for item in reviews_raw if isinstance(item, dict)]
    discussion = [
        _parse_gitea_pull_discussion_comment(item)
        for item in discussion_raw
        if isinstance(item, dict)
    ]
    files = [_parse_gitea_pull_file(item) for item in files_raw if isinstance(item, dict)]

    async def _comments_for_review(review: dict) -> list[dict]:
        review_id = review.get("id")
        if not isinstance(review_id, int) or review_id <= 0:
            return []
        rows = await list_pull_review_comments(
            owner=target.owner,
            repo=target.repo_name,
            index=pull_number,
            review_id=review_id,
        )
        return [_parse_gitea_pull_review_comment(item) for item in rows if isinstance(item, dict)]

    comments_nested = await asyncio.gather(*[_comments_for_review(r) for r in reviews], return_exceptions=False)
    all_comments: list[dict] = []
    for chunk in comments_nested:
        all_comments.extend(chunk)

    detail = _parse_gitea_pull_detail(pull_raw)
    required_contexts = await _required_status_contexts_for_pull(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
        base_branch=str(detail.get("base_branch") or "").strip(),
    )
    required_approvals = 0
    required_reviewer_logins: list[str] = []
    approvals = 0
    approved_reviewers: list[str] = []
    policy_reasons: list[str] = []
    check_items, successful_contexts = _build_pull_check_items(
        commit_statuses_raw=[row for row in commit_statuses_raw if isinstance(row, dict)],
        action_runs_raw=[row for row in action_runs_raw if isinstance(row, dict)],
    )
    try:
        from app.services.repo_settings_service import (
            evaluate_merge_policy,
            list_branch_protections,
            match_branch_protection_rule,
        )

        try:
            repo_uuid = UUID(repo_item_id)
        except ValueError:
            repo_uuid = None
        personal_repo = None
        if repo_uuid:
            repo_row = await session.execute(
                select(Repository).where(
                    Repository.id == repo_uuid,
                    Repository.owner_id == student_id,
                )
            )
            personal_repo = repo_row.scalar_one_or_none()
        if personal_repo:
            rules = await list_branch_protections(session, repo=personal_repo)
            base_branch = str(detail.get("base_branch") or "").strip()
            rule = match_branch_protection_rule(rules, branch=base_branch)
            if rule:
                required_approvals = int(rule.required_approvals or 0)
                required_reviewer_logins = [
                    str(x).strip().lower()
                    for x in (rule.required_reviewer_logins or [])
                    if str(x).strip()
                ]
                approvals_int, has_rejected_review, approved_reviewers_set = _summarize_review_states_for_policy(
                    reviews
                )
                approvals = approvals_int
                approved_reviewers = sorted(approved_reviewers_set)
                decision = evaluate_merge_policy(
                    required_approvals=required_approvals,
                    require_status_checks=rule.require_status_checks,
                    required_status_contexts=rule.status_check_contexts,
                    required_reviewer_logins=required_reviewer_logins,
                    block_on_rejected_reviews=rule.block_on_rejected_reviews,
                    approvals=approvals,
                    successful_checks=successful_contexts,
                    approved_reviewer_logins=approved_reviewers,
                    has_rejected_review=has_rejected_review,
                )
                policy_reasons = [str(x).strip() for x in (decision.reasons or []) if str(x).strip()]
    except Exception:
        policy_reasons = []
    checks = _pull_checks_from_detail(
        detail,
        required_contexts=required_contexts,
        successful_contexts=successful_contexts,
        check_items=check_items,
        policy_reasons=policy_reasons,
        required_approvals=required_approvals,
        approvals=approvals,
        required_reviewer_logins=required_reviewer_logins,
        approved_reviewer_logins=approved_reviewers,
    )
    threads = _build_gitea_pull_threads(all_comments)
    return {
        "pull": detail,
        "diff": diff_text,
        "files": files,
        "reviews": reviews,
        "threads": threads,
        "discussion": discussion,
        "checks": checks,
    }


def _map_review_event_to_gitea(event: str) -> str:
    normalized = (event or "").strip().lower()
    if normalized == "approve":
        return "APPROVE"
    if normalized == "request_changes":
        return "CHANGES_REQUESTED"
    return "COMMENT"


async def create_student_repository_pull_review(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
    event: str,
    body: str | None = None,
    comments: list[dict] | None = None,
) -> dict:
    from app.services.gitea_service import create_pull_review

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    comment_rows: list[dict] = []
    for row in comments or []:
        if not isinstance(row, dict):
            continue
        path = str(row.get("path") or "").strip()
        text = str(row.get("body") or "").strip()
        if not path or not text:
            continue
        payload_row: dict = {"path": path, "body": text}
        new_pos = row.get("new_position")
        old_pos = row.get("old_position")
        if isinstance(new_pos, int) and new_pos > 0:
            payload_row["new_position"] = new_pos
        if isinstance(old_pos, int) and old_pos > 0:
            payload_row["old_position"] = old_pos
        comment_rows.append(payload_row)

    review_raw = await create_pull_review(
        owner=target.owner,
        repo=target.repo_name,
        index=pull_number,
        event=_map_review_event_to_gitea(event),
        body=(body or "").strip() or None,
        comments=comment_rows or None,
    )
    return _parse_gitea_pull_review(review_raw)


async def create_student_repository_pull_discussion_comment(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
    body: str,
) -> dict:
    from app.services.gitea_service import create_issue_comment

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    created = await create_issue_comment(
        owner=target.owner,
        repo=target.repo_name,
        index=pull_number,
        body=body.strip(),
    )
    return _parse_gitea_pull_discussion_comment(created)


async def merge_student_repository_pull(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
    method: str = "merge",
    commit_title: str | None = None,
    commit_message: str | None = None,
    delete_branch_after_merge: bool = True,
    force_merge: bool = False,
    head_commit_id: str | None = None,
) -> dict:
    from app.services.gitea_service import merge_pull_request

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    await _enforce_branch_policy_for_pull_merge(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
        pull_number=pull_number,
    )
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    return await merge_pull_request(
        owner=target.owner,
        repo=target.repo_name,
        index=pull_number,
        method=method,
        commit_title=(commit_title or "").strip() or None,
        commit_message=(commit_message or "").strip() or None,
        delete_branch_after_merge=delete_branch_after_merge,
        force_merge=force_merge,
        head_commit_id=(head_commit_id or "").strip() or None,
    )


async def get_student_repository_pull_check_log(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
    check_id: str,
) -> dict:
    from app.services.gitea_service import get_repo_action_job_logs

    bundle = await get_student_repository_pull_detail_bundle(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
        pull_number=pull_number,
    )
    checks = bundle.get("checks", {}) if isinstance(bundle, dict) else {}
    items = checks.get("items", []) if isinstance(checks, dict) else []
    item = next((row for row in items if isinstance(row, dict) and row.get("id") == check_id), None)
    if not item:
        raise ValueError("Check not found")

    source = str(item.get("source") or "")
    if source == "commit_status":
        lines = [
            f"Check: {item.get('name') or 'status'}",
            f"State: {item.get('state') or 'unknown'}",
        ]
        if item.get("description"):
            lines.append(f"Description: {item.get('description')}")
        if item.get("details_url"):
            lines.append(f"Details URL: {item.get('details_url')}")
        return {"id": check_id, "log": "\n".join(lines), "truncated": False}

    run_id, job_id = _parse_action_run_check_id(check_id)
    if not run_id:
        raise ValueError("Unsupported check id")
    if not job_id:
        details = str(item.get("details_url") or "").strip()
        msg = (
            "Logs are unavailable for this run via API. "
            f"Open details: {details}"
            if details
            else "Logs are unavailable for this run via API."
        )
        return {"id": check_id, "log": msg, "truncated": False}

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    raw_log = await get_repo_action_job_logs(owner=target.owner, repo=target.repo_name, job_id=job_id)
    if raw_log is None:
        return {"id": check_id, "log": "Logs are not available for this check.", "truncated": False}
    max_chars = 100_000
    truncated = len(raw_log) > max_chars
    return {"id": check_id, "log": raw_log[:max_chars], "truncated": truncated}


async def retry_student_repository_pull_check(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    pull_number: int,
    check_id: str,
) -> dict:
    from app.services.gitea_service import retry_repo_action_run

    await _ensure_repo_not_blocked_for_write(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    bundle = await get_student_repository_pull_detail_bundle(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
        pull_number=pull_number,
    )
    checks = bundle.get("checks", {}) if isinstance(bundle, dict) else {}
    items = checks.get("items", []) if isinstance(checks, dict) else []
    item = next((row for row in items if isinstance(row, dict) and row.get("id") == check_id), None)
    if not item:
        raise ValueError("Check not found")
    if str(item.get("source") or "") != "action_run":
        return {"id": check_id, "accepted": False, "message": "Only action runs can be retried"}

    run_id, _job_id = _parse_action_run_check_id(check_id)
    if not run_id:
        return {"id": check_id, "accepted": False, "message": "Invalid run id"}

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    accepted = await retry_repo_action_run(owner=target.owner, repo=target.repo_name, run_id=run_id)
    return {
        "id": check_id,
        "accepted": bool(accepted),
        "message": "Rerun triggered" if accepted else "Rerun endpoint unavailable",
    }


async def get_student_repository_commit_diff(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    sha: str,
) -> dict:
    from app.services.gitea_service import get_commit_diff_text

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    diff = await get_commit_diff_text(owner=target.owner, repo=target.repo_name, sha=sha)
    return {"sha": sha[:12], "diff": diff}


async def get_student_repository_file_history(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    filepath: str,
    branch: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    from app.services.gitea_service import get_repo_metadata, list_repo_commits_page

    cleaned = filepath.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid filepath")
    ref = _validate_git_ref(branch) if branch and branch.strip() else None
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    resolved_ref = ref
    if not resolved_ref:
        meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
        resolved_ref = str((meta or {}).get("default_branch") or "main").strip() or "main"
    resolved_ref = _validate_git_ref(resolved_ref)
    commits_raw, has_more = await list_repo_commits_page(
        owner=target.owner,
        repo=target.repo_name,
        limit=min(max(limit, 1), 50),
        page=max(page, 1),
        ref=resolved_ref,
        path=cleaned,
    )
    commits = [
        _parse_gitea_file_history_commit(row)
        for row in commits_raw
        if isinstance(row, dict)
    ]
    return {
        "path": cleaned,
        "branch": resolved_ref,
        "page": max(page, 1),
        "has_more": has_more,
        "commits": commits,
    }


async def get_student_repository_file_blame(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    filepath: str,
    branch: str | None = None,
) -> dict:
    from app.services.gitea_service import get_repo_file_blame, get_repo_metadata

    cleaned = filepath.strip().strip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid filepath")
    ref = _validate_git_ref(branch) if branch and branch.strip() else None
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    resolved_ref = ref
    if not resolved_ref:
        meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
        resolved_ref = str((meta or {}).get("default_branch") or "main").strip() or "main"
    resolved_ref = _validate_git_ref(resolved_ref)
    raw = await get_repo_file_blame(
        owner=target.owner,
        repo=target.repo_name,
        filepath=cleaned,
        ref=resolved_ref,
    )
    if raw is None:
        raise ValueError("Unable to load blame for file")

    chunks: list[dict] = []
    next_line = 1
    for row in raw:
        if not isinstance(row, dict):
            continue
        parsed, next_line = _parse_gitea_blame_chunk(row, next_line)
        if parsed["sha"] and not parsed["web_url"]:
            parsed["web_url"] = f"{build_repo_web_url(target.owner, target.repo_name).rstrip('/')}/commit/{parsed['sha']}"
        chunks.append(parsed)

    return {
        "path": cleaned,
        "branch": resolved_ref,
        "chunks": chunks,
    }


async def get_student_repository_compare_refs(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    base_ref: str,
    head_ref: str,
) -> dict:
    from app.services.gitea_service import compare_branches

    base = _validate_git_ref(base_ref)
    head = _validate_git_ref(head_ref)
    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    cmp = await compare_branches(owner=target.owner, repo=target.repo_name, base=base, head=head)
    if not cmp:
        raise ValueError("Unable to compare refs")
    files_raw = cmp.get("files")
    files: list[dict] = []
    if isinstance(files_raw, list):
        for row in files_raw:
            if not isinstance(row, dict):
                continue
            filename = str(row.get("filename") or "").strip()
            if not filename:
                continue
            files.append(
                {
                    "filename": filename,
                    "previous_filename": str(row.get("previous_filename") or "").strip() or None,
                    "status": str(row.get("status") or "").strip() or None,
                    "additions": max(0, int(row.get("additions") or 0)),
                    "deletions": max(0, int(row.get("deletions") or 0)),
                    "changes": max(0, int(row.get("changes") or 0)),
                    "is_binary": bool(row.get("is_binary") or False),
                    "too_large": bool(row.get("too_large") or False),
                    "truncated": bool(row.get("truncated") or False),
                }
            )
    return {
        "base": base,
        "head": head,
        "status": str(cmp.get("status") or "").strip() or None,
        "ahead_by": int(cmp.get("ahead_by") or 0),
        "behind_by": int(cmp.get("behind_by") or 0),
        "total_commits": int(cmp.get("total_commits") or 0),
        "files": files,
    }


async def list_student_repository_unmerged_branches(
    session: AsyncSession,
    *,
    student_id: UUID,
    repo_item_id: str,
    base_branch: str | None = None,
    limit: int = 50,
) -> list[str]:
    from app.services.gitea_service import compare_branches, get_repo_metadata, list_repo_branches

    target = await resolve_student_repo_gitea_target(
        session,
        student_id=student_id,
        repo_item_id=repo_item_id,
    )
    meta = await get_repo_metadata(owner=target.owner, repo=target.repo_name)
    base = (base_branch or str(meta.get("default_branch") if meta else "") or "main").strip() or "main"
    raw = await list_repo_branches(owner=target.owner, repo=target.repo_name)
    names = [str(b.get("name") or "").strip() for b in raw if isinstance(b, dict) and b.get("name")]
    out: list[str] = []
    for name in names:
        if not name or name == base:
            continue
        cmp = await compare_branches(owner=target.owner, repo=target.repo_name, base=base, head=name)
        if _compare_has_head_commits(cmp):
            out.append(name)
        if len(out) >= limit:
            break
    return out


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

    # Disallow writing to blocked personal repositories (view-only allowed).
    try:
        item_uuid = UUID(repo_item_id)
        repo_row = await session.execute(
            select(Repository).where(
                Repository.id == item_uuid,
                Repository.owner_id == student_id,
            )
        )
        personal_repo = repo_row.scalar_one_or_none()
        if personal_repo:
            raise_if_repository_blocked(personal_repo)
    except ValueError:
        pass

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
        raise_if_repository_blocked(repo)
        repo_name = repo.gitea_repo_name or repo.name
        owner = await resolve_repo_owner(primary_owner=primary_owner, repo_name=repo_name)
        await delete_gitea_repository(owner=owner, repo_name=repo_name)
        invalidate_gitea_repo_cache(primary_owner=primary_owner, repo_name=repo_name)
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
        invalidate_gitea_repo_cache(primary_owner=primary_owner, repo_name=repo_name)
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

    commits_week = await _commits_week_count(
        session,
        student_id=student_id,
        week_ago=week_ago,
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

    deadline_assignments = _assignments_for_deadline_list(
        ctx.all_assignments,
        ctx.submissions_map,
        now=now,
        today_start=today_start,
    )

    items: list[StudentDeadlineDetailRead] = []
    for a in deadline_assignments[:limit]:
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

        comment = None
        if sub and sub.comment and sub.comment.strip():
            comment = sub.comment.strip()

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
                comment=comment,
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
    gitea_mode: Literal["none", "lite", "full"] = "lite",
) -> StudentRepositoriesRead:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    personal_result = await session.execute(
        select(Repository)
        .where(
            Repository.owner_id == student_id,
            repository_not_blocked_clause(),
        )
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

    if student_user:
        from app.models.repo_access import RepositoryCollaborator, RepositoryTeamAccess

        owned_ids = {r.id for r in personal_repos}
        shared_ids: set[UUID] = set()
        collab_ids = await session.execute(
            select(RepositoryCollaborator.repository_id).where(
                RepositoryCollaborator.user_id == student_id
            )
        )
        shared_ids.update(row[0] for row in collab_ids.all())
        if student_user.group_name:
            team_ids = await session.execute(
                select(RepositoryTeamAccess.repository_id).where(
                    RepositoryTeamAccess.team_name == student_user.group_name
                )
            )
            shared_ids.update(row[0] for row in team_ids.all())
        extra_ids = shared_ids - owned_ids
        if extra_ids:
            shared_result = await session.execute(
                select(Repository, User)
                .join(User, User.id == Repository.owner_id)
                .where(
                    Repository.id.in_(extra_ids),
                    repository_not_blocked_clause(),
                )
            )
            for repo, owner_user in shared_result.all():
                visibility = (
                    repo.repo_type.value if hasattr(repo.repo_type, "value") else str(repo.repo_type)
                )
                if visibility == "public":
                    public_count += 1
                else:
                    private_count += 1
                repo_name = repo.gitea_repo_name or repo.name
                shared_owner = resolve_gitea_username(owner_user)
                repo_specs.append((shared_owner, repo_name))
                items.append(
                    StudentRepositoryItemRead(
                        id=str(repo.id),
                        name=repo.name,
                        description=repo.description,
                        gitea_path=f"{shared_owner}/{repo_name}",
                        gitea_web_url=build_repo_web_url(shared_owner, repo_name),
                        clone_url=build_clone_url(shared_owner, repo_name),
                        language=repo.language,
                        commits_count=None,
                        visibility=visibility,
                        source="personal",
                        repository_id=repo.id,
                        can_delete=False,
                        updated_at=repo.updated_at,
                    )
                )

    for student_repo, assignment, course in ar_result.all():
        course_count += 1
        repo_specs.append((primary_owner, student_repo.repo_name))
        assignment_title = (assignment.title or "").strip() or "Задание"
        items.append(
            StudentRepositoryItemRead(
                id=str(student_repo.id),
                name=assignment_title,
                description=assignment.description,
                gitea_path=f"{primary_owner}/{student_repo.repo_name}",
                gitea_web_url=build_repo_web_url(primary_owner, student_repo.repo_name),
                clone_url=build_clone_url(primary_owner, student_repo.repo_name),
                language=None,
                commits_count=None,
                visibility="course",
                source="assignment",
                assignment_label=(course.title or "").strip() or None,
                course_id=course.id,
                assignment_id=assignment.id,
                can_delete=False,
                updated_at=student_repo.created_at,
            )
        )

    if repo_specs and gitea_mode != "none":
        snapshots = await batch_repo_snapshots(repo_specs, since_week=week_ago, mode=gitea_mode)
        snap_by_repo = {s.repo_name: s for s in snapshots}
        include_totals = gitea_mode == "full"
        merged: list[StudentRepositoryItemRead] = []
        for item in items:
            gitea_repo = (
                item.gitea_path.split("/", 1)[1]
                if item.gitea_path and "/" in item.gitea_path
                else None
            )
            snap = snap_by_repo.get(gitea_repo) if gitea_repo else None
            if snap is None:
                merged.append(item)
            else:
                merged.append(
                    _apply_repo_snapshot(item, snap, include_commit_totals=include_totals)
                )
        items = merged

    items.sort(key=lambda x: x.updated_at, reverse=True)

    total_commits = sum(i.commits_count or 0 for i in items) if gitea_mode == "full" else 0
    commits_week = await _commits_week_count(session, student_id=student_id, week_ago=week_ago)

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
    personal_only: bool = False,
) -> list[StudentRecentRepositoryRead]:
    user_row = await session.get(User, student_id)
    primary_owner = resolve_gitea_username(user_row) if user_row else "user"
    rows: list[tuple[StudentRecentRepositoryRead, str | None]] = []

    p_result = await session.execute(
        select(Repository)
        .where(
            Repository.owner_id == student_id,
            repository_not_blocked_clause(),
        )
        .order_by(Repository.updated_at.desc())
        .limit(limit * 2)
    )
    for repo in p_result.scalars().all():
        visibility = repo.repo_type.value if hasattr(repo.repo_type, "value") else str(repo.repo_type)
        gitea_name = (repo.gitea_repo_name or repo.name or "").strip() or None
        rows.append(
            (
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
                ),
                gitea_name,
            )
        )

    if not personal_only:
        ar_result = await session.execute(
            select(StudentRepository, Assignment, Course)
            .join(Assignment, Assignment.id == StudentRepository.assignment_id)
            .join(Course, Course.id == Assignment.course_id)
            .where(StudentRepository.student_id == student_id)
            .order_by(StudentRepository.created_at.desc())
            .limit(limit * 2)
        )
        for student_repo, assignment, course in ar_result.all():
            gitea_name = (student_repo.repo_name or "").strip() or None
            rows.append(
                (
                    StudentRecentRepositoryRead(
                        id=str(student_repo.id),
                        name=(assignment.title or "").strip() or "Задание",
                        assignment_label=(course.title or "").strip() or None,
                        language=None,
                        commits_count=None,
                        updated_at=student_repo.created_at,
                        visibility="private",
                        source="assignment",
                        course_id=course.id,
                        assignment_id=assignment.id,
                    ),
                    gitea_name,
                )
            )

    rows.sort(key=lambda pair: pair[0].updated_at, reverse=True)
    trimmed_rows = rows[:limit]

    specs = [(primary_owner, gn) for _, gn in trimmed_rows if gn]
    if specs:
        snapshots = await batch_repo_snapshots(specs, mode="lite")
        snap_by_repo = {s.repo_name: s for s in snapshots}
        trimmed_rows = [
            (
                item.model_copy(
                    update={
                        "language": item.language
                        or (
                            snap_by_repo[gitea_name].parsed_stats.get("language")
                            if gitea_name and gitea_name in snap_by_repo
                            else None
                        ),
                        "commits_count": None,
                    }
                ),
                gitea_name,
            )
            for item, gitea_name in trimmed_rows
        ]

    return [item for item, _ in trimmed_rows]


async def _load_student_app_shell(
    session: AsyncSession,
    user: User,
) -> tuple[UserRead, UserSettingsRead, list[NotificationRead], SystemInfoRead]:
    from app.services.notification_service import list_notifications

    notifications = await list_notifications(
        session,
        user_id=user.id,
        group_name=user.group_name,
        role=user.role,
    )
    return (
        UserRead.model_validate(user),
        read_user_settings(user),
        [NotificationRead.model_validate(n) for n in notifications],
        build_system_info_read(),
    )


async def get_student_profile_bundle(
    session: AsyncSession,
    *,
    user: User,
    feed_limit: int = 8,
) -> StudentProfileBundleRead:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    student_id = user.id
    group_name = user.group_name
    student_full_name = user.full_name

    # One AsyncSession must not run concurrent operations (IllegalStateChangeError on close).
    shell = await _load_student_app_shell(session, user)
    summary = await get_student_activity_summary(
        session,
        student_id=student_id,
        group_name=group_name,
    )
    feed = await get_student_activity_feed(
        session,
        student_id=student_id,
        group_name=group_name,
        limit=feed_limit,
    )
    ranking = await get_student_group_ranking(
        session,
        student_id=student_id,
        group_name=group_name,
        student_full_name=student_full_name,
    )
    repo_stats = await _student_repositories_stats_db(session, student_id=student_id, week_ago=week_ago)
    user_read, settings, notifications, system_info = shell
    return StudentProfileBundleRead(
        user=user_read,
        settings=settings,
        notifications=notifications,
        system_info=system_info,
        activity_summary=summary,
        activity_feed=feed,
        group_ranking=ranking,
        repositories_stats=repo_stats,
    )


async def get_student_dashboard_bundle(
    session: AsyncSession,
    *,
    user: User,
    recent_limit: int = 5,
    feed_limit: int = 12,
) -> StudentDashboardBundleRead:
    student_id = user.id
    group_name = user.group_name
    student_full_name = user.full_name

    shell = await _load_student_app_shell(session, user)
    stats = await get_student_dashboard_stats(
        session,
        student_id=student_id,
        group_name=group_name,
    )
    recent_repositories = await get_student_recent_repositories(
        session,
        student_id=student_id,
        limit=recent_limit,
        personal_only=True,
    )
    activity_summary = await get_student_activity_summary(
        session,
        student_id=student_id,
        group_name=group_name,
    )
    activity_feed = await get_student_activity_feed(
        session,
        student_id=student_id,
        group_name=group_name,
        limit=feed_limit,
    )
    group_ranking = await get_student_group_ranking(
        session,
        student_id=student_id,
        group_name=group_name,
        student_full_name=student_full_name,
    )
    user_read, settings, notifications, system_info = shell
    return StudentDashboardBundleRead(
        user=user_read,
        settings=settings,
        notifications=notifications,
        system_info=system_info,
        stats=stats,
        recent_repositories=recent_repositories,
        activity_summary=activity_summary,
        activity_feed=activity_feed,
        group_ranking=group_ranking,
    )


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

    # Дедлайны не дублируем здесь — на дашборде отдельный блок «Дедлайны».

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
