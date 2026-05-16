from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User, UserRole
from app.schemas.course import CourseRead
from app.schemas.teacher_dashboard import TeacherGradingQueueItemRead
from app.services.teacher_dashboard_service import (
    get_teacher_grading_queue,
    list_assistant_courses,
)

router = APIRouter(prefix="/assistants/me", tags=["assistants"])


def _require_laborant(user: User) -> None:
    if user.role != UserRole.laborant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Laborant access only")


@router.get("/courses", response_model=list[CourseRead])
async def assistant_courses(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CourseRead]:
    _require_laborant(current_user)
    courses = await list_assistant_courses(session, user=current_user)
    return [CourseRead.model_validate(c) for c in courses]


@router.get("/grading-queue", response_model=list[TeacherGradingQueueItemRead])
async def assistant_grading_queue(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherGradingQueueItemRead]:
    _require_laborant(current_user)
    return await get_teacher_grading_queue(session, user=current_user, limit=limit)
