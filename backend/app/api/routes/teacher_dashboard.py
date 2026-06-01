from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permission_checks import (
    ensure_assignment_read,
    ensure_grade_view,
    ensure_lab_workflow,
    ensure_permission,
    ensure_repo_content_access,
)
from app.models.user import User, UserRole
from app.schemas.teacher_dashboard import (
    TeacherActivityItemRead,
    TeacherCourseDetailRead,
    TeacherCourseListItemRead,
    TeacherDashboardFullRead,
    TeacherDashboardRead,
    TeacherGradingQueueItemRead,
    TeacherGradingQueueStatsRead,
    TeacherStudentsSummaryRead,
    TeacherTemplateRepoRead,
)
from app.services.teacher_dashboard_service import (
    build_teacher_students_csv,
    get_teacher_course_detail,
    get_teacher_dashboard,
    get_teacher_dashboard_full,
    get_teacher_grading_queue,
    get_teacher_grading_queue_stats,
    list_teacher_activity,
    list_teacher_courses_enriched,
    list_teacher_students,
    list_teacher_templates,
)

router = APIRouter(prefix="/teachers/me", tags=["teacher-dashboard"])


def _require_teacher_or_laborant(user: User) -> None:
    if user.role not in {UserRole.teacher, UserRole.laborant, UserRole.admin}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access only")


async def _ensure_dashboard_read(user: User, session: AsyncSession) -> None:
    _require_teacher_or_laborant(user)
    await ensure_assignment_read(user, session)


@router.get("/dashboard", response_model=TeacherDashboardRead)
async def teacher_dashboard(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherDashboardRead:
    await _ensure_dashboard_read(current_user, session)
    return await get_teacher_dashboard(session, user=current_user)


@router.get("/dashboard/full", response_model=TeacherDashboardFullRead)
async def teacher_dashboard_full(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherDashboardFullRead:
    await _ensure_dashboard_read(current_user, session)
    return await get_teacher_dashboard_full(session, user=current_user)


@router.get("/grading-queue/stats", response_model=TeacherGradingQueueStatsRead)
async def teacher_grading_queue_stats(
    course_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherGradingQueueStatsRead:
    _require_teacher_or_laborant(current_user)
    await ensure_lab_workflow(current_user, session)
    await ensure_permission(current_user, session, "grade_edit")
    return await get_teacher_grading_queue_stats(
        session, user=current_user, course_id=course_id
    )


@router.get("/grading-queue", response_model=list[TeacherGradingQueueItemRead])
async def teacher_grading_queue(
    limit: int = Query(default=100, ge=1, le=200),
    course_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherGradingQueueItemRead]:
    _require_teacher_or_laborant(current_user)
    await ensure_lab_workflow(current_user, session)
    await ensure_permission(current_user, session, "grade_edit")
    return await get_teacher_grading_queue(
        session, user=current_user, limit=limit, course_id=course_id
    )


@router.get("/courses", response_model=list[TeacherCourseListItemRead])
async def teacher_courses_list(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherCourseListItemRead]:
    await _ensure_dashboard_read(current_user, session)
    return await list_teacher_courses_enriched(session, user=current_user)


@router.get("/students", response_model=TeacherStudentsSummaryRead)
async def teacher_students_list(
    limit: int = Query(default=500, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherStudentsSummaryRead:
    _require_teacher_or_laborant(current_user)
    await ensure_permission(current_user, session, "user_view")
    await ensure_grade_view(current_user, session)
    return await list_teacher_students(session, user=current_user, limit=limit)


@router.get("/activity", response_model=list[TeacherActivityItemRead])
async def teacher_activity_feed(
    limit: int = Query(default=80, ge=1, le=200),
    course_id: UUID | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherActivityItemRead]:
    _require_teacher_or_laborant(current_user)
    await ensure_permission(current_user, session, "repo_view_students")
    return await list_teacher_activity(
        session, user=current_user, limit=limit, course_id=course_id
    )


@router.get("/courses/{course_id}/detail", response_model=TeacherCourseDetailRead)
async def teacher_course_detail(
    course_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TeacherCourseDetailRead:
    await _ensure_dashboard_read(current_user, session)
    try:
        return await get_teacher_course_detail(session, user=current_user, course_id=course_id)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.get("/templates", response_model=list[TeacherTemplateRepoRead])
async def teacher_templates(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[TeacherTemplateRepoRead]:
    _require_teacher_or_laborant(current_user)
    await ensure_repo_content_access(current_user, session, target_student_id=current_user.id)
    return await list_teacher_templates(session, user=current_user)


@router.get("/students/export")
async def teacher_students_export(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PlainTextResponse:
    _require_teacher_or_laborant(current_user)
    await ensure_permission(current_user, session, "user_view")
    await ensure_grade_view(current_user, session)
    csv_body = await build_teacher_students_csv(session, user=current_user)
    return PlainTextResponse(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="students.csv"'},
    )
