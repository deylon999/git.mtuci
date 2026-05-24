"""
Stats API routes - для дашборда и аналитики
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permissions import require_permission
from app.core.config import settings
from app.models.repository import Repository, RepositoryType
from app.models.user import User, UserRole
from app.models.activity_log import ActivityLog, ActivityType
from app.services.gitea_service import list_repo_commits, GITEA_ADMIN_USERNAME

router = APIRouter(prefix="/stats", tags=["stats"])


class FacultyCommitsStat(BaseModel):
    faculty: str
    short_name: str
    commits: int
    color: str


# Цвета для факультетов (соответствуют фронтенду)
FACULTY_COLORS = {
    "ИТ": "bg-blue-500",
    "КИБ": "bg-green-500",
    "РТ": "bg-purple-500",
    "СИ": "bg-orange-500",
    "ЦЭМК": "bg-pink-500",
}


class OverviewStats(BaseModel):
    total_users: int
    total_students: int
    total_repositories: int
    total_commits: int
    repositories_by_type: Dict[str, int]


@router.get("/overview", response_model=OverviewStats)
@require_permission("settings_view")
async def get_overview_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OverviewStats:
    """Get overview statistics with repository breakdown by type."""
    # Total users
    users_result = await session.execute(select(func.count(User.id)))
    total_users = users_result.scalar() or 0

    # Active students
    students_result = await session.execute(
        select(func.count(User.id)).where(User.role == UserRole.student)
    )
    total_students = students_result.scalar() or 0

    # Total repositories
    repos_result = await session.execute(select(func.count(Repository.id)))
    total_repos = repos_result.scalar() or 0

    # Repository counts by type
    repos_by_type = {}
    for repo_type in RepositoryType:
        count_result = await session.execute(
            select(func.count(Repository.id)).where(Repository.repo_type == repo_type)
        )
        repos_by_type[repo_type.value] = count_result.scalar() or 0

    return OverviewStats(
        total_users=total_users,
        total_students=total_students,
        total_repositories=total_repos,
        total_commits=981,  # Mock - will be real from Gitea later
        repositories_by_type=repos_by_type,
    )


@router.get("/commits-by-faculty", response_model=list[FacultyCommitsStat])
@require_permission("logs_view")
async def get_commits_by_faculty(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[FacultyCommitsStat]:
    """
    Get commit statistics grouped by faculty.
    
    Note: Faculty grouping is disabled as faculties table has been removed.
    Returns empty list.
    """
    # Faculties table removed - return empty list
    return []


@router.get("/dashboard-summary")
@require_permission("settings_view")
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Get summary statistics for admin dashboard.
    """
    # Total users
    users_result = await session.execute(select(func.count(User.id)))
    total_users = users_result.scalar() or 0
    
    # Active students
    students_result = await session.execute(
        select(func.count(User.id)).where(User.role == UserRole.student)
    )
    total_students = students_result.scalar() or 0
    
    # Total repositories
    repos_result = await session.execute(select(func.count(Repository.id)))
    total_repos = repos_result.scalar() or 0
    
    return {
        "total_users": total_users,
        "total_students": total_students,
        "total_repositories": total_repos,
        "total_commits": 981,  # Mock - will be real from Gitea later
    }


class ActiveRepositoryStat(BaseModel):
    id: UUID
    name: str
    author: str
    commits: int
    is_public: bool
    initials: str


class HotRepoStat(BaseModel):
    """Hot repository statistics (last 24 hours)."""
    name: str
    url: str
    events: int
    language: str | None = None


class TopUserStat(BaseModel):
    """Top user statistics (by commits today)."""
    user_id: str
    user_name: str
    name: str
    initials: str
    color: str
    count: int
    percent: int  # Percent relative to top user (for bar width)


@router.get("/top-users", response_model=list[TopUserStat])
async def get_top_users(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TopUserStat]:
    """
    Get top 5 users by commits for today.

    Note: Uses activity_log table for real statistics. Includes users from Gitea via user_login.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Get top users by commit count for today (including users without user_id)
    # Use UNION to combine users from DB and users from Gitea (user_login)
    result = await session.execute(
        text("""
            SELECT
                COALESCE(u.id::text, al.user_login) as user_id,
                COALESCE(u.full_name, al.user_login) as user_name,
                COUNT(*) as commit_count
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.activity_type = 'commit'
              AND al.created_at >= :today_start
              AND (al.user_id IS NOT NULL OR al.user_login IS NOT NULL)
            GROUP BY COALESCE(u.id::text, al.user_login), COALESCE(u.full_name, al.user_login)
            ORDER BY commit_count DESC
            LIMIT 5
        """),
        {"today_start": today_start}
    )

    users = result.all()

    # If no data, return empty list
    if not users:
        return []

    # Calculate max count for percent calculation
    max_count = max(user.commit_count for user in users) if users else 1

    def get_initials(full_name: str) -> str:
        parts = full_name.strip().split()
        if len(parts) >= 2:
            return f"{parts[0][0]}{parts[1][0]}".upper()
        return full_name[:2].upper() if full_name else "??"

    # Colors for top users (matching frontend)
    colors = ["#60a5fa", "#fbbf24", "#a78bfa", "#4caf50", "#e24b4a"]

    return [
        TopUserStat(
            user_id=str(user.user_id),
            user_name=user.user_name,
            name=user.user_name,
            initials=get_initials(user.user_name),
            color=colors[i % len(colors)],
            count=user.commit_count,
            percent=int((user.commit_count / max_count) * 100)
        )
        for i, user in enumerate(users)
    ]


@router.get("/hot-repos", response_model=list[HotRepoStat])
async def get_hot_repos(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[HotRepoStat]:
    """
    Get top repositories by activity (events) for last 24 hours.
    
    Returns up to 5 repositories with the most events.
    """
    # Get current time and 24 hours ago
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)
    
    # Query for repository activity in last 24 hours
    query = (
        select(
            ActivityLog.repo_name,
            func.count(ActivityLog.id).label("event_count")
        )
        .where(
            ActivityLog.created_at >= yesterday,
            ActivityLog.created_at <= now,
            ActivityLog.repo_name.isnot(None)
        )
        .group_by(ActivityLog.repo_name)
        .order_by(desc("event_count"))
        .limit(5)
    )
    
    result = await session.execute(query)
    repos = result.all()
    
    if not repos:
        return []
    
    # Build Gitea URL for each repo and detect language
    base_url = settings.GITEA_URL.rstrip("/")
    
    return [
        HotRepoStat(
            name=repo_name,
            url=f"{base_url}/{repo_name}",
            events=count,
            language=detect_language(repo_name)  # Helper function to detect language
        )
        for repo_name, count in repos
    ]


# Color palette for repository cards (matching frontend mock)
REPO_COLORS = [
    "bg-blue-500/20 text-blue-400",
    "bg-purple-500/20 text-purple-400",
    "bg-green-500/20 text-green-400",
    "bg-orange-500/20 text-orange-400",
    "bg-pink-500/20 text-pink-400",
]


def get_initials(full_name: str) -> str:
    """Extract initials from full name (e.g., 'Иван Петров' -> 'ИП')."""
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[1][0]}".upper()
    return full_name[:2].upper() if full_name else "??"


def detect_language(repo_name: str) -> str | None:
    """Detect programming language from repository name or return None."""
    repo_lower = repo_name.lower()
    
    # Common language indicators in repo names
    language_hints = {
        "python": "Python",
        "django": "Python",
        "flask": "Python",
        "fastapi": "Python",
        "js": "JavaScript",
        "javascript": "JavaScript",
        "react": "JavaScript",
        "vue": "JavaScript",
        "angular": "JavaScript",
        "ts": "TypeScript",
        "typescript": "TypeScript",
        "java": "Java",
        "spring": "Java",
        "kotlin": "Kotlin",
        "android": "Kotlin",
        "cpp": "C++",
        "c++": "C++",
        "c": "C",
        "go": "Go",
        "golang": "Go",
        "rust": "Rust",
        "rs": "Rust",
        "ruby": "Ruby",
        "rails": "Ruby",
        "php": "PHP",
        "laravel": "PHP",
        "swift": "Swift",
        "ios": "Swift",
        "csharp": "C#",
        "c#": "C#",
        "dotnet": "C#",
        "scala": "Scala",
        "r": "R",
        "matlab": "MATLAB",
        "bash": "Shell",
        "shell": "Shell",
        "docker": "Docker",
        "kubernetes": "Kubernetes",
        "terraform": "Terraform",
        "ansible": "Ansible",
    }
    
    for hint, language in language_hints.items():
        if hint in repo_lower:
            return language
    
    return None


class TodayStats(BaseModel):
    """Statistics for today (and comparison with yesterday)."""
    total_events: int
    total_events_delta: int  # +N to yesterday
    commits: int
    commits_delta: int
    active_users: int
    active_users_delta: int
    new_repositories: int
    new_repositories_delta: int


class HourlyActivity(BaseModel):
    """Activity count by hour (24 hours)."""
    hour: int  # 0-23
    count: int
    is_current: bool  # Highlight current hour


@router.get("/hourly-activity", response_model=list[HourlyActivity])
async def get_hourly_activity(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[HourlyActivity]:
    """
    Get activity count by hour for today (24 hour bars).

    Note: Uses activity_log table for real statistics. Time is in Moscow timezone (UTC+3).
    """
    from datetime import datetime, timedelta, timezone

    # Moscow timezone (UTC+3)
    moscow_tz = timezone(timedelta(hours=3))
    now_moscow = datetime.now(timezone.utc).astimezone(moscow_tz)
    today_start_moscow = now_moscow.replace(hour=0, minute=0, second=0, microsecond=0)
    current_hour_moscow = now_moscow.hour

    # Convert today_start back to UTC for database query
    today_start_utc = today_start_moscow.astimezone(timezone.utc)

    # Get activity count by hour for today (convert to Moscow time)
    # Use subquery to handle timezone conversion before grouping
    from sqlalchemy import text

    result = await session.execute(
        text("""
            SELECT EXTRACT(HOUR FROM (created_at + INTERVAL '3 hours')) as hour,
                   COUNT(*) as event_count
            FROM activity_log
            WHERE created_at >= :today_start
            GROUP BY EXTRACT(HOUR FROM (created_at + INTERVAL '3 hours'))
            ORDER BY hour
        """),
        {"today_start": today_start_utc}
    )

    hourly_data = {int(row.hour): row.event_count for row in result.all()}

    # Fill in missing hours with 0
    return [
        HourlyActivity(
            hour=i,
            count=hourly_data.get(i, 0),
            is_current=(i == current_hour_moscow)
        )
        for i in range(24)
    ]


@router.get("/today", response_model=TodayStats)
async def get_today_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TodayStats:
    """
    Get activity statistics for today with comparison to yesterday.
    
    Note: Uses activity_log table for real-time statistics.
    """
    from datetime import datetime, timedelta, timezone
    
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start
    
    # Today stats
    today_result = await session.execute(
        select(func.count(ActivityLog.id)).where(ActivityLog.created_at >= today_start)
    )
    total_events = today_result.scalar() or 0
    
    # Yesterday stats for delta
    yesterday_result = await session.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.created_at >= yesterday_start,
            ActivityLog.created_at < yesterday_end
        )
    )
    yesterday_events = yesterday_result.scalar() or 0
    total_events_delta = total_events - yesterday_events
    
    # Commits today
    commits_result = await session.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.activity_type == ActivityType.commit,
            ActivityLog.created_at >= today_start
        )
    )
    commits = commits_result.scalar() or 0
    
    # Commits yesterday
    commits_yesterday_result = await session.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.activity_type == ActivityType.commit,
            ActivityLog.created_at >= yesterday_start,
            ActivityLog.created_at < yesterday_end
        )
    )
    commits_yesterday = commits_yesterday_result.scalar() or 0
    commits_delta = commits - commits_yesterday
    
    # Active users today (unique users with activity)
    users_result = await session.execute(
        select(func.count(func.distinct(ActivityLog.user_id))).where(
            ActivityLog.created_at >= today_start
        )
    )
    active_users = users_result.scalar() or 0
    
    # Active users yesterday
    users_yesterday_result = await session.execute(
        select(func.count(func.distinct(ActivityLog.user_id))).where(
            ActivityLog.created_at >= yesterday_start,
            ActivityLog.created_at < yesterday_end
        )
    )
    active_users_yesterday = users_yesterday_result.scalar() or 0
    active_users_delta = active_users - active_users_yesterday
    
    # New repositories today
    new_repos_result = await session.execute(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.activity_type == ActivityType.repo_created,
            ActivityLog.created_at >= today_start
        )
    )
    new_repositories = new_repos_result.scalar() or 0
    
    return TodayStats(
        total_events=total_events,
        total_events_delta=total_events_delta,
        commits=commits,
        commits_delta=commits_delta,
        active_users=active_users,
        active_users_delta=active_users_delta,
        new_repositories=new_repositories,
        new_repositories_delta=0,  # Not tracking delta for repos
    )


@router.get("/total-users")
async def get_total_users(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get total count of registered users."""
    # Debug: check if users exist
    result = await session.execute(select(func.count()).select_from(User))
    raw_count = result.scalar()
    
    # Also fetch actual users to debug
    users_result = await session.execute(select(User.id, User.email).limit(5))
    users_sample = users_result.all()
    
    print(f"[DEBUG] Total users count (raw): {raw_count}")
    print(f"[DEBUG] Sample users: {users_sample}")
    
    total = raw_count or 0
    return {"total_users": total, "debug_sample": len(users_sample)}


@router.get("/my-commits")
async def get_my_commits(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Get total commit count for current user across all their repositories.
    """
    # Get user's repositories
    result = await session.execute(
        select(Repository)
        .where(Repository.owner_id == current_user.id)
        .where(Repository.gitea_repo_name.is_not(None))
        .where(Repository.is_blocked.is_(False))
    )
    repos = result.scalars().all()
    
    total_commits = 0
    for repo in repos:
        if repo.gitea_repo_name:
            try:
                commits_raw, _ = await list_repo_commits(
                    owner=GITEA_ADMIN_USERNAME,
                    repo=repo.gitea_repo_name,
                    limit=100,
                    max_pages=10,
                )
                total_commits += len(commits_raw)
            except Exception:
                # Gitea unavailable or repo doesn't exist
                pass
    
    return {
        "commits": total_commits,
        "repositories": len(repos),
    }


@router.get("/active-repositories", response_model=list[ActiveRepositoryStat])
@require_permission("logs_view")
async def get_active_repositories(
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ActiveRepositoryStat]:
    """
    Get most recently updated active repositories with author info.
    
    Fetches real commit counts from Gitea API.
    """
    # Get recent repositories with owner info using join
    result = await session.execute(
        select(Repository, User.full_name)
        .join(User, Repository.owner_id == User.id)
        .where(
            Repository.gitea_repo_name.is_not(None),
            Repository.is_blocked.is_(False),
        )
        .order_by(Repository.updated_at.desc())
        .limit(limit)
    )
    
    repos_with_owners = result.all()
    
    stats = []
    for idx, (repo, owner_name) in enumerate(repos_with_owners):
        # Fetch real commit count from Gitea
        commits = 0
        if repo.gitea_repo_name:
            try:
                commits_raw, _ = await list_repo_commits(
                    owner=GITEA_ADMIN_USERNAME,
                    repo=repo.gitea_repo_name,
                    limit=100,
                    max_pages=5,  # Limit to prevent timeouts
                )
                commits = len(commits_raw)
            except Exception:
                # Gitea unavailable or repo doesn't exist
                commits = 0
        
        stats.append(ActiveRepositoryStat(
            id=repo.id,
            name=repo.name,
            author=owner_name or "Unknown",
            commits=commits,
            is_public=True,  # Default to public for now
            initials=get_initials(owner_name or "??"),
            color=REPO_COLORS[idx % len(REPO_COLORS)],
        ))
    
    return stats
