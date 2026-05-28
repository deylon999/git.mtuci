from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.core.permission_checks import ensure_repo_content_access
from app.models.repository import Repository
from app.models.student_repository import StudentRepository
from app.models.user import User
from app.schemas.student_dashboard import (
    StudentRepoBranchesRead,
    StudentRepoCommitDiffRead,
    StudentRepoBlameRead,
    StudentRepoCompareRead,
    StudentRepoCommitsRead,
    StudentRepoCreatePullDiscussionCommentBody,
    StudentRepoCreatePullReviewBody,
    StudentRepoFileContentRead,
    StudentRepoFileRead,
    StudentRepoIssuePatchBody,
    StudentRepoIssueRead,
    StudentRepoIssueUpsertBody,
    StudentRepoIssuesRead,
    StudentRepoFileHistoryRead,
    StudentRepoMergePullBody,
    StudentRepoMergeResultRead,
    StudentRepoPullDetailBundleRead,
    StudentRepoPullDiscussionCommentRead,
    StudentRepoPullReviewRead,
    StudentRepoPullsRead,
    StudentRepoPullCheckLogRead,
    StudentRepoPullCheckRetryRead,
    StudentRepoSummaryRead,
    StudentRepoWikiContentRead,
    StudentRepoWikiPagesRead,
    StudentRepoReactionBody,
)
from app.services.gitea_service import GiteaAuthError
from app.services.repository_access_service import RepositoryBlockedError
from app.services.student_dashboard_service import (
    create_student_repository_pull_discussion_comment,
    create_student_repository_pull_review,
    create_student_repository_issue,
    get_student_repository_branches,
    get_student_repository_commit_diff,
    get_student_repository_file_blame,
    get_student_repository_compare_refs,
    get_student_repository_commits,
    get_student_repository_file_history,
    get_student_repository_file_content,
    get_student_repository_issues,
    get_student_repository_pull_detail_bundle,
    get_student_repository_pull_check_log,
    get_student_repository_pulls,
    get_student_repository_summary,
    get_student_repository_wiki_content,
    get_student_repository_wiki_pages,
    list_student_repository_files,
    list_student_repository_unmerged_branches,
    merge_student_repository_pull,
    retry_student_repository_pull_check,
    react_student_repository_issue,
    search_student_repository_files,
    update_student_repository_issue,
)

router = APIRouter(prefix="/teacher/repositories", tags=["teacher-repositories"])


async def _resolve_repo_owner_id(session: AsyncSession, repo_item_id: str) -> UUID:
    try:
        item_uuid = UUID(repo_item_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found") from exc

    r = await session.execute(select(Repository.owner_id).where(Repository.id == item_uuid))
    owner = r.scalar_one_or_none()
    if owner:
        return owner

    sr = await session.execute(select(StudentRepository.student_id).where(StudentRepository.id == item_uuid))
    owner2 = sr.scalar_one_or_none()
    if owner2:
        return owner2

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")


def _http_from_exc(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, GiteaAuthError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    if isinstance(exc, RepositoryBlockedError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/{repo_item_id}/summary", response_model=StudentRepoSummaryRead)
async def teacher_repo_summary(
    repo_item_id: str,
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoSummaryRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_summary(session, student_id=owner_id, repo_item_id=repo_item_id, branch=branch)
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoSummaryRead.model_validate(data)


@router.get("/{repo_item_id}/branches", response_model=StudentRepoBranchesRead)
async def teacher_repo_branches(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoBranchesRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_branches(session, student_id=owner_id, repo_item_id=repo_item_id)
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoBranchesRead.model_validate(data)


@router.get("/{repo_item_id}/files", response_model=list[StudentRepoFileRead])
async def teacher_repo_files(
    repo_item_id: str,
    path: str = Query(default="", max_length=500),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[StudentRepoFileRead]:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        rows = await list_student_repository_files(
            session, student_id=owner_id, repo_item_id=repo_item_id, path=path, branch=branch
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return [StudentRepoFileRead.model_validate(r) for r in rows]


@router.get("/{repo_item_id}/files/search", response_model=list[dict])
async def teacher_repo_files_search(
    repo_item_id: str,
    q: str = Query(min_length=1, max_length=200),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        paths = await search_student_repository_files(session, student_id=owner_id, repo_item_id=repo_item_id, query=q, branch=branch)
    except Exception as exc:
        raise _http_from_exc(exc)
    return [{"path": p} for p in paths]


@router.get("/{repo_item_id}/files/{filepath:path}", response_model=StudentRepoFileContentRead)
async def teacher_repo_file_content(
    repo_item_id: str,
    filepath: str = Path(..., description="Path inside repository"),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoFileContentRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    if ".." in filepath.split("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filepath")
    try:
        content = await get_student_repository_file_content(
            session, student_id=owner_id, repo_item_id=repo_item_id, filepath=filepath, branch=branch
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoFileContentRead(filepath=filepath, content=content)


@router.get("/{repo_item_id}/commits", response_model=StudentRepoCommitsRead)
async def teacher_repo_commits(
    repo_item_id: str,
    branch: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=30, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCommitsRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_commits(
            session, student_id=owner_id, repo_item_id=repo_item_id, branch=branch, page=page, limit=limit
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoCommitsRead.model_validate(data)


@router.get("/{repo_item_id}/commits/{sha}/diff", response_model=StudentRepoCommitDiffRead)
async def teacher_repo_commit_diff(
    repo_item_id: str,
    sha: str = Path(..., min_length=4, max_length=80),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCommitDiffRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_commit_diff(session, student_id=owner_id, repo_item_id=repo_item_id, sha=sha)
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoCommitDiffRead.model_validate(data)


@router.get("/{repo_item_id}/history/file", response_model=StudentRepoFileHistoryRead)
async def teacher_repo_file_history(
    repo_item_id: str,
    path: str = Query(min_length=1, max_length=500),
    branch: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoFileHistoryRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_file_history(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            filepath=path,
            branch=branch,
            page=page,
            limit=limit,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoFileHistoryRead.model_validate(data)


@router.get("/{repo_item_id}/blame/file", response_model=StudentRepoBlameRead)
async def teacher_repo_file_blame(
    repo_item_id: str,
    path: str = Query(min_length=1, max_length=500),
    branch: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoBlameRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_file_blame(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            filepath=path,
            branch=branch,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoBlameRead.model_validate(data)


@router.get("/{repo_item_id}/compare", response_model=StudentRepoCompareRead)
async def teacher_repo_compare(
    repo_item_id: str,
    base: str = Query(min_length=1, max_length=200),
    head: str = Query(min_length=1, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoCompareRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_compare_refs(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            base_ref=base,
            head_ref=head,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoCompareRead.model_validate(data)


@router.get("/{repo_item_id}/issues", response_model=StudentRepoIssuesRead)
async def teacher_repo_issues(
    repo_item_id: str,
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    state: str = Query(default="open", pattern="^(open|closed|all)$"),
    q: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoIssuesRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_issues(
            session, student_id=owner_id, repo_item_id=repo_item_id, page=page, limit=limit, state=state, q=q
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoIssuesRead.model_validate(data)


@router.post("/{repo_item_id}/issues", response_model=StudentRepoIssueRead)
async def teacher_repo_issue_create(
    repo_item_id: str,
    body: StudentRepoIssueUpsertBody,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoIssueRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await create_student_repository_issue(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            title=body.title,
            body=body.body,
            labels=body.labels,
            assignees=body.assignees,
            milestone=body.milestone,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoIssueRead.model_validate(data)


@router.patch("/{repo_item_id}/issues/{issue_number}", response_model=StudentRepoIssueRead)
async def teacher_repo_issue_patch(
    repo_item_id: str,
    issue_number: int = Path(..., ge=1),
    body: StudentRepoIssuePatchBody = ...,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoIssueRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await update_student_repository_issue(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            issue_number=issue_number,
            title=body.title,
            body=body.body,
            state=body.state,
            labels=body.labels,
            assignees=body.assignees,
            milestone=body.milestone,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoIssueRead.model_validate(data)


@router.post("/{repo_item_id}/issues/{issue_number}/reactions")
async def teacher_repo_issue_react(
    repo_item_id: str,
    issue_number: int = Path(..., ge=1),
    body: StudentRepoReactionBody = ...,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        return await react_student_repository_issue(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            issue_number=issue_number,
            content=body.content,
        )
    except Exception as exc:
        raise _http_from_exc(exc)


@router.get("/{repo_item_id}/pulls", response_model=StudentRepoPullsRead)
async def teacher_repo_pulls(
    repo_item_id: str,
    page: int = Query(default=1, ge=1, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    state: str = Query(default="open", pattern="^(open|closed|all)$"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullsRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_pulls(
            session, student_id=owner_id, repo_item_id=repo_item_id, page=page, limit=limit, state=state
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullsRead.model_validate(data)


@router.get("/{repo_item_id}/pulls/{pull_number}", response_model=StudentRepoPullDetailBundleRead)
async def teacher_repo_pull_detail(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullDetailBundleRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_pull_detail_bundle(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullDetailBundleRead.model_validate(data)


@router.get(
    "/{repo_item_id}/pulls/{pull_number}/checks/{check_id}/log",
    response_model=StudentRepoPullCheckLogRead,
)
async def teacher_repo_pull_check_log(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    check_id: str = Path(..., min_length=3, max_length=300),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullCheckLogRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_pull_check_log(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
            check_id=check_id,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullCheckLogRead.model_validate(data)


@router.post(
    "/{repo_item_id}/pulls/{pull_number}/checks/{check_id}/retry",
    response_model=StudentRepoPullCheckRetryRead,
)
async def teacher_repo_pull_check_retry(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    check_id: str = Path(..., min_length=3, max_length=300),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullCheckRetryRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await retry_student_repository_pull_check(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
            check_id=check_id,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullCheckRetryRead.model_validate(data)


@router.post("/{repo_item_id}/pulls/{pull_number}/reviews", response_model=StudentRepoPullReviewRead)
async def teacher_repo_pull_review_create(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    body: StudentRepoCreatePullReviewBody = ...,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullReviewRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await create_student_repository_pull_review(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
            event=body.event,
            body=body.body,
            comments=[row.model_dump() for row in body.comments],
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullReviewRead.model_validate(data)


@router.post("/{repo_item_id}/pulls/{pull_number}/comments", response_model=StudentRepoPullDiscussionCommentRead)
async def teacher_repo_pull_comment_create(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    body: StudentRepoCreatePullDiscussionCommentBody = ...,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoPullDiscussionCommentRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await create_student_repository_pull_discussion_comment(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
            body=body.body,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoPullDiscussionCommentRead.model_validate(data)


@router.post("/{repo_item_id}/pulls/{pull_number}/merge", response_model=StudentRepoMergeResultRead)
async def teacher_repo_pull_merge(
    repo_item_id: str,
    pull_number: int = Path(..., ge=1),
    body: StudentRepoMergePullBody = ...,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoMergeResultRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await merge_student_repository_pull(
            session,
            student_id=owner_id,
            repo_item_id=repo_item_id,
            pull_number=pull_number,
            method=body.method,
            commit_title=body.commit_title,
            commit_message=body.commit_message,
            delete_branch_after_merge=body.delete_branch_after_merge,
            force_merge=body.force_merge,
            head_commit_id=body.head_commit_id,
        )
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoMergeResultRead.model_validate(data)


@router.get("/{repo_item_id}/wiki/pages", response_model=StudentRepoWikiPagesRead)
async def teacher_repo_wiki_pages(
    repo_item_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoWikiPagesRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_wiki_pages(session, student_id=owner_id, repo_item_id=repo_item_id)
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoWikiPagesRead.model_validate(data)


@router.get("/{repo_item_id}/wiki/page", response_model=StudentRepoWikiContentRead)
async def teacher_repo_wiki_page(
    repo_item_id: str,
    name: str = Query(min_length=1, max_length=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StudentRepoWikiContentRead:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        data = await get_student_repository_wiki_content(session, student_id=owner_id, repo_item_id=repo_item_id, page=name)
    except Exception as exc:
        raise _http_from_exc(exc)
    return StudentRepoWikiContentRead.model_validate(data)


@router.get("/{repo_item_id}/unmerged-branches", response_model=list[str])
async def teacher_repo_unmerged_branches(
    repo_item_id: str,
    base: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[str]:
    owner_id = await _resolve_repo_owner_id(session, repo_item_id)
    await ensure_repo_content_access(current_user, session, target_student_id=owner_id)
    try:
        return await list_student_repository_unmerged_branches(
            session, student_id=owner_id, repo_item_id=repo_item_id, base_branch=base, limit=limit
        )
    except Exception as exc:
        raise _http_from_exc(exc)

