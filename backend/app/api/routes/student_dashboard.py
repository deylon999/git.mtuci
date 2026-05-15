from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
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
    StudentRepositoriesRead,
    StudentRepoBranchesRead,
    StudentRepoCommitsRead,
    StudentRepoSummaryRead,
    StudentRepoCreateFileBody,
    StudentRepoFileContentRead,
    StudentRepoFileRead,
    StudentRepoFileSearchItemRead,
)
from app.services.gitea_service import GiteaAuthError
from app.services.student_dashboard_service import (
    create_student_repository_file,
    delete_student_personal_repository,
    get_student_repository_branches,
    get_student_repository_commits,
    get_student_repository_summary,
    get_student_repository_file_content,
    get_student_activity_feed,
    get_student_activity_summary,
    get_student_dashboard_stats,
    get_student_deadlines,
    get_student_group_ranking,
    get_student_recent_repositories,
    get_student_repositories,
    list_student_repository_files,
    search_student_repository_files,
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


@router.get("/repositories", response_model=StudentRepositoriesRead)
async def student_repositories(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepositoriesRead:
    _require_student(current_user)
    return await get_student_repositories(
        session,
        student_id=current_user.id,
        gitea_login=current_user.mtuci_login,
    )


@router.get("/repositories/recent", response_model=list[StudentRecentRepositoryRead])
async def student_recent_repositories(
    limit: int = Query(default=5, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRecentRepositoryRead]:
    _require_student(current_user)
    return await get_student_recent_repositories(session, student_id=current_user.id, limit=limit)


@router.get("/repositories/{repo_item_id}/commits", response_model=StudentRepoCommitsRead)
async def student_repository_commits(
    repo_item_id: str,
    branch: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=30, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCommitsRead:
    _require_student(current_user)
    try:
        data = await get_student_repository_commits(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            branch=branch,
            page=page,
            limit=limit,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoCommitsRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/summary", response_model=StudentRepoSummaryRead)
async def student_repository_summary(
    repo_item_id: str,
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoSummaryRead:
    _require_student(current_user)
    try:
        data = await get_student_repository_summary(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            branch=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoSummaryRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/branches", response_model=StudentRepoBranchesRead)
async def student_repository_branches(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoBranchesRead:
    _require_student(current_user)
    try:
        data = await get_student_repository_branches(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoBranchesRead.model_validate(data)


@router.get(
    "/repositories/{repo_item_id}/files/search",
    response_model=list[StudentRepoFileSearchItemRead],
)
async def student_repository_files_search(
    repo_item_id: str,
    q: str = Query(min_length=1, max_length=200),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRepoFileSearchItemRead]:
    _require_student(current_user)
    try:
        paths = await search_student_repository_files(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            query=q,
            branch=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return [StudentRepoFileSearchItemRead(path=p) for p in paths]


@router.post("/repositories/{repo_item_id}/files", response_model=StudentRepoFileRead)
async def student_repository_create_file(
    repo_item_id: str,
    body: StudentRepoCreateFileBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoFileRead:
    _require_student(current_user)
    if ".." in body.path.split("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filepath")
    try:
        await create_student_repository_file(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            path=body.path,
            content=body.content,
            message=body.message,
            branch=body.branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    name = body.path.strip().split("/")[-1]
    return StudentRepoFileRead(
        sha="",
        name=name,
        path=body.path.strip().strip("/"),
        type="file",
        size=len(body.content.encode("utf-8")),
    )


@router.get("/repositories/{repo_item_id}/files", response_model=list[StudentRepoFileRead])
async def student_repository_files(
    repo_item_id: str,
    path: str = Query(default="", max_length=500),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRepoFileRead]:
    _require_student(current_user)
    try:
        rows = await list_student_repository_files(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            path=path,
            branch=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return [StudentRepoFileRead.model_validate(row) for row in rows]


@router.get("/repositories/{repo_item_id}/files/{filepath:path}", response_model=StudentRepoFileContentRead)
async def student_repository_file_content(
    repo_item_id: str,
    filepath: str = Path(..., description="Path inside repository"),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoFileContentRead:
    _require_student(current_user)
    if ".." in filepath.split("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filepath")
    try:
        content = await get_student_repository_file_content(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            filepath=filepath,
            branch=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoFileContentRead(filepath=filepath, content=content)


@router.delete("/repositories/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
async def student_delete_repository(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    _require_student(current_user)
    try:
        await delete_student_personal_repository(
            session,
            student_id=current_user.id,
            gitea_login=current_user.mtuci_login,
            repository_id=repository_id,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")


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
