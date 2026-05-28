from __future__ import annotations

from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.repo_access import RepoAccessRole
from app.models.repository import Repository
from app.models.user import User
from app.schemas.review import (
    PullRequestReviewCreate,
    PullRequestReviewResponse,
    ReviewCommentCreate,
    ReviewCommentResponse,
    ReviewCommentUpdate,
    ReviewThreadCreate,
    ReviewThreadResponse,
    ReviewThreadUpdate,
)
from app.services.repo_access_service import ensure_min_repo_role
from app.services.repository_access_service import ensure_repository_accessible
from app.services.review_service import ReviewService

router = APIRouter()
_PR_SCOPE_NAMESPACE = UUID("2b473f66-b860-4e8d-86e3-6dbe2f166fef")


async def _repo_or_404(db: AsyncSession, repository_id: UUID) -> Repository:
    repo = await db.get(Repository, repository_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo


async def _require_repo_access(
    db: AsyncSession,
    *,
    user: User,
    repository_id: UUID,
    min_role: RepoAccessRole,
) -> None:
    repo = await _repo_or_404(db, repository_id)
    await ensure_repository_accessible(repo, user, db)
    await ensure_min_repo_role(db, user=user, repo=repo, min_role=min_role)


def _pr_scope_id(repository_id: UUID, pull_number: int) -> UUID:
    return uuid5(_PR_SCOPE_NAMESPACE, f"{repository_id}:{pull_number}")


async def _thread_or_404(service: ReviewService, thread_id: UUID):
    thread = await service.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return thread


async def _comment_with_thread_or_404(service: ReviewService, comment_id: UUID):
    comment = await service.get_comment(comment_id)
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    thread = await service.get_thread(comment.thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return comment, thread


# Reviews
@router.post(
    "/repositories/{repository_id}/pulls/{pull_number}/reviews",
    response_model=PullRequestReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review_scoped(
    repository_id: UUID,
    pull_number: int,
    data: PullRequestReviewCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if pull_number <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pull number")
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.write)
    service = ReviewService(db)
    return await service.create_review(
        _pr_scope_id(repository_id, pull_number),
        current_user.id,
        data,
        repository_id=repository_id,
        pull_number=pull_number,
    )


@router.get("/repositories/{repository_id}/pulls/{pull_number}/reviews", response_model=list[PullRequestReviewResponse])
async def get_reviews_scoped(
    repository_id: UUID,
    pull_number: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if pull_number <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pull number")
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = ReviewService(db)
    return await service.get_reviews_for_pull(repository_id=repository_id, pull_number=pull_number)


@router.post(
    "/repositories/{repository_id}/pulls/{pull_number}/threads",
    response_model=ReviewThreadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_thread_scoped(
    repository_id: UUID,
    pull_number: int,
    data: ReviewThreadCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if pull_number <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pull number")
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.write)
    service = ReviewService(db)
    return await service.create_thread(
        _pr_scope_id(repository_id, pull_number),
        data,
        repository_id=repository_id,
        pull_number=pull_number,
    )


@router.get("/repositories/{repository_id}/pulls/{pull_number}/threads", response_model=list[ReviewThreadResponse])
async def get_threads_scoped(
    repository_id: UUID,
    pull_number: int,
    resolved: bool | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if pull_number <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pull number")
    await _require_repo_access(db, user=current_user, repository_id=repository_id, min_role=RepoAccessRole.read)
    service = ReviewService(db)
    return await service.get_threads_for_pull(
        repository_id=repository_id,
        pull_number=pull_number,
        resolved=resolved,
    )


@router.post("/pull-requests/{pull_request_id}/reviews", response_model=PullRequestReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    pull_request_id: UUID,
    data: PullRequestReviewCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=pull_request_id, min_role=RepoAccessRole.write)
    service = ReviewService(db)
    return await service.create_review(pull_request_id, current_user.id, data)


@router.get("/pull-requests/{pull_request_id}/reviews", response_model=list[PullRequestReviewResponse])
async def get_reviews(
    pull_request_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=pull_request_id, min_role=RepoAccessRole.read)
    service = ReviewService(db)
    return await service.get_reviews(pull_request_id)


@router.get("/reviews/{review_id}", response_model=PullRequestReviewResponse)
async def get_review(
    review_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    review = await service.get_review(review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(review.repository_id or review.pull_request_id),
        min_role=RepoAccessRole.read,
    )
    return review


# Threads
@router.post("/pull-requests/{pull_request_id}/threads", response_model=ReviewThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    pull_request_id: UUID,
    data: ReviewThreadCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=pull_request_id, min_role=RepoAccessRole.write)
    service = ReviewService(db)
    return await service.create_thread(pull_request_id, data)


@router.get("/pull-requests/{pull_request_id}/threads", response_model=list[ReviewThreadResponse])
async def get_threads(
    pull_request_id: UUID,
    resolved: bool | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _require_repo_access(db, user=current_user, repository_id=pull_request_id, min_role=RepoAccessRole.read)
    service = ReviewService(db)
    return await service.get_threads(pull_request_id, resolved)


@router.get("/threads/{thread_id}", response_model=ReviewThreadResponse)
async def get_thread(
    thread_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    thread = await _thread_or_404(service, thread_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.read,
    )
    return thread


@router.patch("/threads/{thread_id}", response_model=ReviewThreadResponse)
async def update_thread(
    thread_id: UUID,
    data: ReviewThreadUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    thread = await _thread_or_404(service, thread_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.write,
    )
    updated = await service.update_thread(thread_id, current_user.id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return updated


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    thread = await _thread_or_404(service, thread_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.write,
    )
    ok = await service.delete_thread(thread_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")


# Comments
@router.post("/threads/{thread_id}/comments", response_model=ReviewCommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    thread_id: UUID,
    data: ReviewCommentCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    thread = await _thread_or_404(service, thread_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.write,
    )
    return await service.create_comment(thread_id, current_user.id, data)


@router.get("/threads/{thread_id}/comments", response_model=list[ReviewCommentResponse])
async def get_comments(
    thread_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    thread = await _thread_or_404(service, thread_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.read,
    )
    return await service.get_comments(thread_id)


@router.patch("/comments/{comment_id}", response_model=ReviewCommentResponse)
async def update_comment(
    comment_id: UUID,
    data: ReviewCommentUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    _comment, thread = await _comment_with_thread_or_404(service, comment_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.write,
    )
    updated = await service.update_comment(comment_id, data)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return updated


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service = ReviewService(db)
    _comment, thread = await _comment_with_thread_or_404(service, comment_id)
    await _require_repo_access(
        db,
        user=current_user,
        repository_id=(thread.repository_id or thread.pull_request_id),
        min_role=RepoAccessRole.write,
    )
    ok = await service.delete_comment(comment_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
