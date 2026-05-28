from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import PullRequestReview, ReviewThread, ReviewComment
from app.schemas.review import (
    PullRequestReviewCreate,
    ReviewThreadCreate,
    ReviewThreadUpdate,
    ReviewCommentCreate,
    ReviewCommentUpdate,
)


class ReviewService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Reviews
    async def create_review(
        self,
        pull_request_id: UUID,
        reviewer_id: UUID,
        data: PullRequestReviewCreate,
        *,
        repository_id: UUID | None = None,
        pull_number: int | None = None,
    ) -> PullRequestReview:
        review = PullRequestReview(
            pull_request_id=pull_request_id,
            repository_id=repository_id,
            pull_number=pull_number,
            reviewer_id=reviewer_id,
            state=data.state,
            body=data.body,
            commit_sha=data.commit_sha,
        )
        self.db.add(review)
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def get_reviews(self, pull_request_id: UUID) -> list[PullRequestReview]:
        result = await self.db.execute(
            select(PullRequestReview)
            .where(PullRequestReview.pull_request_id == pull_request_id)
            .order_by(PullRequestReview.created_at)
        )
        return list(result.scalars().all())

    async def get_review(self, review_id: UUID) -> PullRequestReview | None:
        result = await self.db.execute(select(PullRequestReview).where(PullRequestReview.id == review_id))
        return result.scalar_one_or_none()

    # Threads
    async def create_thread(
        self,
        pull_request_id: UUID,
        data: ReviewThreadCreate,
        *,
        repository_id: UUID | None = None,
        pull_number: int | None = None,
    ) -> ReviewThread:
        thread = ReviewThread(
            pull_request_id=pull_request_id,
            repository_id=repository_id,
            pull_number=pull_number,
            review_id=data.review_id,
            file_path=data.file_path,
            line_number=data.line_number,
            diff_hunk=data.diff_hunk,
        )
        self.db.add(thread)
        await self.db.commit()
        await self.db.refresh(thread)
        return thread

    async def get_threads(self, pull_request_id: UUID, resolved: bool | None = None) -> list[ReviewThread]:
        query = select(ReviewThread).where(ReviewThread.pull_request_id == pull_request_id)
        if resolved is not None:
            query = query.where(ReviewThread.is_resolved == resolved)
        query = query.order_by(ReviewThread.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_threads_for_pull(
        self,
        *,
        repository_id: UUID,
        pull_number: int,
        resolved: bool | None = None,
    ) -> list[ReviewThread]:
        query = select(ReviewThread).where(
            ReviewThread.repository_id == repository_id,
            ReviewThread.pull_number == pull_number,
        )
        if resolved is not None:
            query = query.where(ReviewThread.is_resolved == resolved)
        query = query.order_by(ReviewThread.created_at)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_reviews_for_pull(
        self,
        *,
        repository_id: UUID,
        pull_number: int,
    ) -> list[PullRequestReview]:
        result = await self.db.execute(
            select(PullRequestReview)
            .where(
                PullRequestReview.repository_id == repository_id,
                PullRequestReview.pull_number == pull_number,
            )
            .order_by(PullRequestReview.created_at)
        )
        return list(result.scalars().all())

    async def get_thread(self, thread_id: UUID) -> ReviewThread | None:
        result = await self.db.execute(select(ReviewThread).where(ReviewThread.id == thread_id))
        return result.scalar_one_or_none()

    async def update_thread(
        self, thread_id: UUID, user_id: UUID, data: ReviewThreadUpdate
    ) -> ReviewThread | None:
        thread = await self.get_thread(thread_id)
        if not thread:
            return None

        thread.is_resolved = data.is_resolved
        if data.is_resolved:
            thread.resolved_by_id = user_id
            thread.resolved_at = datetime.now(timezone.utc)
        else:
            thread.resolved_by_id = None
            thread.resolved_at = None

        thread.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(thread)
        return thread

    async def delete_thread(self, thread_id: UUID) -> bool:
        thread = await self.get_thread(thread_id)
        if not thread:
            return False
        await self.db.delete(thread)
        await self.db.commit()
        return True

    # Comments
    async def create_comment(
        self, thread_id: UUID, author_id: UUID, data: ReviewCommentCreate
    ) -> ReviewComment:
        comment = ReviewComment(
            thread_id=thread_id,
            author_id=author_id,
            body=data.body,
        )
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        return comment

    async def get_comments(self, thread_id: UUID) -> list[ReviewComment]:
        result = await self.db.execute(
            select(ReviewComment)
            .where(ReviewComment.thread_id == thread_id)
            .order_by(ReviewComment.created_at)
        )
        return list(result.scalars().all())

    async def get_comment(self, comment_id: UUID) -> ReviewComment | None:
        result = await self.db.execute(select(ReviewComment).where(ReviewComment.id == comment_id))
        return result.scalar_one_or_none()

    async def update_comment(self, comment_id: UUID, data: ReviewCommentUpdate) -> ReviewComment | None:
        comment = await self.get_comment(comment_id)
        if not comment:
            return None

        comment.body = data.body
        comment.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(comment)
        return comment

    async def delete_comment(self, comment_id: UUID) -> bool:
        comment = await self.get_comment(comment_id)
        if not comment:
            return False
        await self.db.delete(comment)
        await self.db.commit()
        return True
