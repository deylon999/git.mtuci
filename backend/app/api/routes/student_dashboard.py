from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.schemas.student_dashboard import (
    StudentActivityFeedItemRead,
    StudentActivitySummaryRead,
    StudentDashboardStatsRead,
    StudentDeadlineDetailRead,
    StudentGroupRankingRead,
    StudentRecentRepositoryRead,
)
from app.services.student_dashboard_service import (
    get_student_activity_feed,
    get_student_activity_summary,
    get_student_dashboard_stats,
    get_student_deadlines,
    get_student_group_ranking,
    get_student_recent_repositories,
)

router = APIRouter(prefix="/students/me", tags=["student-dashboard"])


def _require_student(user: User) -> None:
    if user.role != UserRole.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access only")


@router.get("/deadlines", response_model=list[StudentDeadlineDetailRead])
async def student_deadlines(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentDeadlineDetailRead]:
    _require_student(current_user)
    return await get_student_deadlines(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        limit=limit,
    )


@router.get("/dashboard-stats", response_model=StudentDashboardStatsRead)
async def student_dashboard_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentDashboardStatsRead:
    _require_student(current_user)
    return await get_student_dashboard_stats(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
    )


@router.get("/repositories/recent", response_model=list[StudentRecentRepositoryRead])
async def student_recent_repositories(
    limit: int = Query(default=5, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRecentRepositoryRead]:
    _require_student(current_user)
    return await get_student_recent_repositories(session, student_id=current_user.id, limit=limit)


@router.get("/activity-summary", response_model=StudentActivitySummaryRead)
async def student_activity_summary(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentActivitySummaryRead:
    _require_student(current_user)
    return await get_student_activity_summary(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
    )


@router.get("/activity-feed", response_model=list[StudentActivityFeedItemRead])
async def student_activity_feed(
    limit: int = Query(default=12, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentActivityFeedItemRead]:
    _require_student(current_user)
    return await get_student_activity_feed(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        limit=limit,
    )


@router.get("/group-ranking", response_model=StudentGroupRankingRead)
async def student_group_ranking(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentGroupRankingRead:
    _require_student(current_user)
    return await get_student_group_ranking(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        student_full_name=current_user.full_name,
    )
