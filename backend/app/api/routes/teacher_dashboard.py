from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.schemas.teacher_dashboard import TeacherDashboardRead, TeacherGradingQueueItemRead
from app.services.teacher_dashboard_service import get_teacher_dashboard, get_teacher_grading_queue

router = APIRouter(prefix="/teachers/me", tags=["teacher-dashboard"])


def _require_teacher_or_laborant(user: User) -> None:
    if user.role not in {UserRole.teacher, UserRole.laborant}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access only")


@router.get("/dashboard", response_model=TeacherDashboardRead)
async def teacher_dashboard(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherDashboardRead:
    _require_teacher_or_laborant(current_user)
    return await get_teacher_dashboard(session, user=current_user)


@router.get("/grading-queue", response_model=list[TeacherGradingQueueItemRead])
async def teacher_grading_queue(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherGradingQueueItemRead]:
    _require_teacher_or_laborant(current_user)
    return await get_teacher_grading_queue(session, user=current_user, limit=limit)
