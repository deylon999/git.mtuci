from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permission_checks import ensure_assignment_read, ensure_permission, ensure_repo_content_access
from app.models.user import User, UserRole
from app.schemas.student_dashboard import (
    StudentActivityFeedItemRead,
    StudentActivitySummaryRead,
    StudentDashboardStatsRead,
    StudentAssignmentListItemRead,
    StudentDeadlineDetailRead,
    StudentForkItemRead,
    StudentGradesSummaryRead,
    StudentGitCloneTokenRegenerateRead,
    StudentGitCloneTokenStatusRead,
    StudentGroupRankingRead,
    StudentDashboardBundleRead,
    StudentProfileBundleRead,
    StudentMergedCoursesRead,
    StudentRecentRepositoryRead,
    StudentRepositoriesRead,
    StudentRepoBranchesRead,
    StudentRepoCreateBranchBody,
    StudentRepoCloneInfoRead,
    StudentRepoLintBody,
    StudentRepoLintRead,
    StudentRepoCommitsRead,
    StudentRepoIssuesRead,
    StudentRepoPullsRead,
    StudentRepoPullRead,
    StudentRepoSummaryRead,
    StudentRepoWikiContentRead,
    StudentRepoWikiPagesRead,
    StudentRepoCreateFileBody,
    StudentRepoFileContentRead,
    StudentRepoFileRead,
    StudentRepoFileSearchItemRead,
    StudentRepoCreatePullBody,
    StudentRepoCommitDiffRead,
)
from app.services.code_lint_service import lint_file_content
from app.services.repository_access_service import RepositoryBlockedError
from app.services.gitea_service import GiteaAuthError
from app.services.student_lk_courses_service import get_student_merged_courses
from app.services.student_dashboard_service import (
    create_student_repository_file,
    create_student_repository_branch,
    delete_student_repository_branch,
    delete_student_personal_repository,
    get_student_repository_branches,
    get_student_repository_clone_info,
    get_student_repository_commits,
    get_student_repository_issues,
    get_student_repository_pulls,
    create_student_repository_pull_request,
    get_student_repository_summary,
    get_student_repository_commit_diff,
    get_student_repository_wiki_content,
    get_student_repository_wiki_pages,
    get_student_repository_file_content,
    get_student_activity_feed,
    get_student_activity_summary,
    get_student_dashboard_stats,
    get_student_assignments,
    get_student_deadlines,
    get_student_forks,
    get_student_grades,
    get_student_git_clone_token_status,
    get_student_group_ranking,
    get_student_profile_bundle,
    get_student_dashboard_bundle,
    regenerate_student_git_clone_token,
    get_student_recent_repositories,
    get_student_repositories,
    list_student_repository_files,
    search_student_repository_files,
    resolve_student_repo_gitea_target,
    list_student_repository_unmerged_branches,
)

router = APIRouter(prefix="/students/me", tags=["student-dashboard"])


def _require_student(user: User) -> None:
    if user.role != UserRole.student:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access only")


async def _ensure_student_perm(user: User, session: AsyncSession, permission_id: str) -> None:
    _require_student(user)
    await ensure_permission(user, session, permission_id)


@router.get("/deadlines", response_model=list[StudentDeadlineDetailRead])
async def student_deadlines(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentDeadlineDetailRead]:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_deadlines(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        limit=limit,
    )


@router.get("/grades", response_model=StudentGradesSummaryRead)
async def student_grades(
    limit: int = Query(default=200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentGradesSummaryRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_grades(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        limit=limit,
    )


@router.get("/forks", response_model=list[StudentForkItemRead])
async def student_forks(
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentForkItemRead]:
    await _ensure_student_perm(current_user, session, "repo_view")
    return await get_student_forks(session, student_id=current_user.id, limit=limit)


@router.post("/forks/sync")
async def student_fork_sync(
    repo_path: str = Query(..., min_length=3, max_length=300),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    await _ensure_student_perm(current_user, session, "repo_view")
    from app.services.student_forks_service import merge_fork_upstream
    from app.utils.gitea_user import resolve_gitea_username

    owner = resolve_gitea_username(current_user)
    if not repo_path.startswith(f"{owner}/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your fork")
    repo_name = repo_path.split("/", 1)[1]
    try:
        await merge_fork_upstream(owner, repo_name)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"status": "ok"}


@router.get("/assignments", response_model=list[StudentAssignmentListItemRead])
async def student_assignments(
    limit: int = Query(default=200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentAssignmentListItemRead]:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_assignments(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        limit=limit,
    )


@router.get("/dashboard-bundle", response_model=StudentDashboardBundleRead)
async def student_dashboard_bundle(
    recent_limit: int = Query(default=5, ge=1, le=20),
    feed_limit: int = Query(default=12, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentDashboardBundleRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_dashboard_bundle(
        session,
        user=current_user,
        recent_limit=recent_limit,
        feed_limit=feed_limit,
    )


@router.get("/dashboard-stats", response_model=StudentDashboardStatsRead)
async def student_dashboard_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentDashboardStatsRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_dashboard_stats(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
    )


@router.get("/courses-merged", response_model=StudentMergedCoursesRead)
async def student_merged_courses(
    refresh: bool = Query(default=False, description="Force refresh from MTUCI LK"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentMergedCoursesRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
    courses, lk_warning = await get_student_merged_courses(
        session,
        user=current_user,
        force_lk_refresh=refresh,
    )
    return StudentMergedCoursesRead(courses=courses, lk_warning=lk_warning)


@router.get("/profile-bundle", response_model=StudentProfileBundleRead)
async def student_profile_bundle(
    feed_limit: int = Query(default=8, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentProfileBundleRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_profile_bundle(
        session,
        user=current_user,
        feed_limit=feed_limit,
    )


@router.get("/repositories", response_model=StudentRepositoriesRead)
async def student_repositories(
    gitea: str = Query(
        default="lite",
        pattern="^(none|lite|full)$",
        description="Gitea enrichment: none (DB only), lite (metadata), full (+ commit counts)",
    ),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepositoriesRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    mode = gitea if gitea in ("none", "lite", "full") else "lite"
    return await get_student_repositories(
        session,
        student_id=current_user.id,
        gitea_login=current_user.mtuci_login,
        gitea_mode=mode,  # type: ignore[arg-type]
    )


@router.get("/repositories/recent", response_model=list[StudentRecentRepositoryRead])
async def student_recent_repositories(
    limit: int = Query(default=5, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRecentRepositoryRead]:
    await _ensure_student_perm(current_user, session, "repo_view")
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
    await _ensure_student_perm(current_user, session, "repo_view")
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
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoCommitsRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/clone", response_model=StudentRepoCloneInfoRead)
async def student_repository_clone_info(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCloneInfoRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_clone_info(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoCloneInfoRead.model_validate(data)


@router.post("/repositories/{repo_item_id}/lint", response_model=StudentRepoLintRead)
async def student_repository_lint_file(
    repo_item_id: str,
    body: StudentRepoLintBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoLintRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        await resolve_student_repo_gitea_target(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
        )
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    result = lint_file_content(body.path, body.content)
    return StudentRepoLintRead.model_validate(result)


@router.get("/repositories/{repo_item_id}/summary", response_model=StudentRepoSummaryRead)
async def student_repository_summary(
    repo_item_id: str,
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoSummaryRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_summary(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            branch=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoSummaryRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/issues", response_model=StudentRepoIssuesRead)
async def student_repository_issues(
    repo_item_id: str,
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    state: str = Query(default="open", pattern="^(open|closed|all)$"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoIssuesRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_issues(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            page=page,
            limit=limit,
            state=state,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoIssuesRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/pulls", response_model=StudentRepoPullsRead)
async def student_repository_pulls(
    repo_item_id: str,
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    state: str = Query(default="open", pattern="^(open|closed|all)$"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullsRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    await _ensure_student_perm(current_user, session, "repo_comment")
    try:
        data = await get_student_repository_pulls(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            page=page,
            limit=limit,
            state=state,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoPullsRead.model_validate(data)


@router.post("/repositories/{repo_item_id}/pulls", response_model=StudentRepoPullRead)
async def student_repository_create_pull(
    repo_item_id: str,
    body: StudentRepoCreatePullBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullRead:
    await _ensure_student_perm(current_user, session, "repo_create")
    try:
        data = await create_student_repository_pull_request(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            title=body.title,
            head=body.head,
            base=body.base,
            body=body.body,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return StudentRepoPullRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/unmerged-branches", response_model=list[str])
async def student_repository_unmerged_branches(
    repo_item_id: str,
    base: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[str]:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        return await list_student_repository_unmerged_branches(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            base_branch=base,
            limit=limit,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/repositories/{repo_item_id}/commits/{sha}/diff", response_model=StudentRepoCommitDiffRead)
async def student_repository_commit_diff(
    repo_item_id: str,
    sha: str = Path(..., min_length=4, max_length=80),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCommitDiffRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_commit_diff(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            sha=sha,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoCommitDiffRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/wiki/pages", response_model=StudentRepoWikiPagesRead)
async def student_repository_wiki_pages(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoWikiPagesRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_wiki_pages(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoWikiPagesRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/wiki/page", response_model=StudentRepoWikiContentRead)
async def student_repository_wiki_page(
    repo_item_id: str,
    name: str = Query(min_length=1, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoWikiContentRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_wiki_content(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            page=name,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoWikiContentRead.model_validate(data)


@router.get("/repositories/{repo_item_id}/branches", response_model=StudentRepoBranchesRead)
async def student_repository_branches(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoBranchesRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await get_student_repository_branches(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoBranchesRead.model_validate(data)


@router.post("/repositories/{repo_item_id}/branches", status_code=status.HTTP_204_NO_CONTENT)
async def student_repository_create_branch(
    repo_item_id: str,
    body: StudentRepoCreateBranchBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await _ensure_student_perm(current_user, session, "repo_create")
    try:
        await create_student_repository_branch(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            name=body.name,
            from_ref=body.from_ref,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/repositories/{repo_item_id}/branches/{branch}", status_code=status.HTTP_204_NO_CONTENT)
async def student_repository_delete_branch(
    repo_item_id: str,
    branch: str = Path(..., min_length=1, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await _ensure_student_perm(current_user, session, "repo_create")
    try:
        await delete_student_repository_branch(
            session,
            student_id=current_user.id,
            repo_item_id=repo_item_id,
            name=branch,
        )
    except GiteaAuthError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


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
    await _ensure_student_perm(current_user, session, "repo_view")
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
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
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
    await _ensure_student_perm(current_user, session, "repo_create")
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
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
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
    await _ensure_student_perm(current_user, session, "repo_view")
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
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
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
    await _ensure_student_perm(current_user, session, "repo_view")
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
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return StudentRepoFileContentRead(filepath=filepath, content=content)


@router.delete("/repositories/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
async def student_delete_repository(
    repository_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    await _ensure_student_perm(current_user, session, "repo_delete")
    try:
        await delete_student_personal_repository(
            session,
            student_id=current_user.id,
            gitea_login=current_user.mtuci_login,
            repository_id=repository_id,
        )
    except RepositoryBlockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")


@router.get("/activity-summary", response_model=StudentActivitySummaryRead)
async def student_activity_summary(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentActivitySummaryRead:
    await _ensure_student_perm(current_user, session, "assignment_view")
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
    await _ensure_student_perm(current_user, session, "assignment_view")
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
    await _ensure_student_perm(current_user, session, "assignment_view")
    return await get_student_group_ranking(
        session,
        student_id=current_user.id,
        group_name=current_user.group_name,
        student_full_name=current_user.full_name,
    )


@router.get("/git-clone-token", response_model=StudentGitCloneTokenStatusRead)
async def student_git_clone_token_status(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentGitCloneTokenStatusRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    data = await get_student_git_clone_token_status(current_user)
    return StudentGitCloneTokenStatusRead.model_validate(data)


@router.post("/git-clone-token/regenerate", response_model=StudentGitCloneTokenRegenerateRead)
async def student_git_clone_token_regenerate(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentGitCloneTokenRegenerateRead:
    await _ensure_student_perm(current_user, session, "repo_view")
    try:
        data = await regenerate_student_git_clone_token(session, current_user)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return StudentGitCloneTokenRegenerateRead.model_validate(data)
