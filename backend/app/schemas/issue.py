from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# Label schemas
class IssueLabelBase(BaseModel):
    name: str = Field(..., max_length=120)
    color: str = Field(default="#cccccc", max_length=7)
    description: str | None = None


class IssueLabelCreate(IssueLabelBase):
    pass


class IssueLabelUpdate(BaseModel):
    name: str | None = Field(None, max_length=120)
    color: str | None = Field(None, max_length=7)
    description: str | None = None


class IssueLabelResponse(IssueLabelBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    created_at: datetime
    updated_at: datetime


# Milestone schemas
class IssueMilestoneBase(BaseModel):
    title: str = Field(..., max_length=200)
    description: str | None = None
    state: str = Field(default="open")
    due_date: datetime | None = None


class IssueMilestoneCreate(IssueMilestoneBase):
    pass


class IssueMilestoneUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = None
    state: str | None = None
    due_date: datetime | None = None


class IssueMilestoneResponse(IssueMilestoneBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None


# User minimal schema for assignees
class IssueUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    login: str
    full_name: str | None = None
    avatar_url: str | None = None


# Issue schemas
class IssueBase(BaseModel):
    title: str = Field(..., max_length=300)
    body: str | None = None


class IssueCreate(IssueBase):
    label_ids: list[UUID] = Field(default_factory=list)
    assignee_ids: list[UUID] = Field(default_factory=list)
    milestone_id: UUID | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(None, max_length=300)
    body: str | None = None
    state: str | None = None
    label_ids: list[UUID] | None = None
    assignee_ids: list[UUID] | None = None
    milestone_id: UUID | None = None
    locked: bool | None = None


class IssueResponse(IssueBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    number: int
    state: str
    author_id: UUID | None
    milestone_id: UUID | None
    locked: bool
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    labels: list[IssueLabelResponse] = Field(default_factory=list)
    assignees: list[IssueUserResponse] = Field(default_factory=list)


class IssueListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repository_id: UUID
    number: int
    title: str
    state: str
    author_id: UUID | None
    created_at: datetime
    updated_at: datetime
    labels: list[IssueLabelResponse] = Field(default_factory=list)
    assignees: list[IssueUserResponse] = Field(default_factory=list)


# Comment schemas
class IssueCommentBase(BaseModel):
    body: str


class IssueCommentCreate(IssueCommentBase):
    pass


class IssueCommentUpdate(BaseModel):
    body: str


class IssueCommentResponse(IssueCommentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    issue_id: UUID
    author_id: UUID | None
    created_at: datetime
    updated_at: datetime


# Reaction schemas
class IssueReactionCreate(BaseModel):
    reaction: str = Field(..., max_length=20)


class IssueReactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    issue_id: UUID | None
    comment_id: UUID | None
    user_id: UUID
    reaction: str
    created_at: datetime


class IssueTimelineEventResponse(BaseModel):
    id: str
    type: str = Field(description="created | comment | cross_reference | cross_reference_backlink")
    created_at: datetime
    author_id: UUID | None = None
    author_login: str | None = None
    body: str | None = None
    reference_type: str | None = Field(default=None, description="issue | pr | commit | issue_backlink | pr_backlink | commit_backlink")
    reference_value: str | None = None
    target_exists: bool | None = None
    target_url: str | None = None
