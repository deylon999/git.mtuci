from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# Review schemas
class PullRequestReviewBase(BaseModel):
    state: str = Field(..., max_length=20)  # approved, changes_requested, commented
    body: str | None = None
    commit_sha: str | None = None


class PullRequestReviewCreate(PullRequestReviewBase):
    pass


class PullRequestReviewResponse(PullRequestReviewBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pull_request_id: UUID
    repository_id: UUID | None = None
    pull_number: int | None = None
    reviewer_id: UUID | None
    created_at: datetime
    updated_at: datetime


# Review thread schemas
class ReviewThreadBase(BaseModel):
    file_path: str = Field(..., max_length=500)
    line_number: int | None = None
    diff_hunk: str | None = None


class ReviewThreadCreate(ReviewThreadBase):
    review_id: UUID | None = None


class ReviewThreadUpdate(BaseModel):
    is_resolved: bool


class ReviewThreadResponse(ReviewThreadBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    pull_request_id: UUID
    repository_id: UUID | None = None
    pull_number: int | None = None
    review_id: UUID | None
    is_resolved: bool
    resolved_by_id: UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


# Review comment schemas
class ReviewCommentBase(BaseModel):
    body: str


class ReviewCommentCreate(ReviewCommentBase):
    pass


class ReviewCommentUpdate(BaseModel):
    body: str


class ReviewCommentResponse(ReviewCommentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    author_id: UUID | None
    created_at: datetime
    updated_at: datetime
