from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BranchProtectionUpsertBody(BaseModel):
    branch_pattern: str = Field(default="main", min_length=1, max_length=120)
    required_approvals: int = Field(default=1, ge=0, le=10)
    require_status_checks: bool = False
    status_check_contexts: list[str] = Field(default_factory=list)
    required_reviewer_logins: list[str] = Field(default_factory=list)
    dismiss_stale_approvals: bool = True
    block_on_rejected_reviews: bool = True


class BranchProtectionRead(BranchProtectionUpsertBody):
    id: UUID
    created_at: datetime
    updated_at: datetime


class RepoWebhookCreateBody(BaseModel):
    url: str = Field(min_length=8, max_length=500)
    events: list[str] = Field(default_factory=lambda: ["push"])
    secret: str | None = None
    is_active: bool = True


class RepoWebhookRead(BaseModel):
    id: UUID
    url: str
    events: list[str]
    is_active: bool
    last_delivery_status: str | None
    last_delivery_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RepoDeployKeyCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    public_key: str = Field(min_length=16)
    read_only: bool = True


class RepoDeployKeyRead(BaseModel):
    id: UUID
    title: str
    key_fingerprint: str | None
    key_type: str | None
    read_only: bool
    created_at: datetime


class RepoSecretUpsertBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1)


class RepoSecretRead(BaseModel):
    id: UUID
    name: str
    updated_at: datetime


class MergePolicyCheckBody(BaseModel):
    branch: str = Field(min_length=1, max_length=120)
    approvals: int = Field(default=0, ge=0, le=50)
    successful_checks: list[str] = Field(default_factory=list)
    approved_reviewer_logins: list[str] = Field(default_factory=list)
    has_rejected_review: bool = False


class MergePolicyCheckRead(BaseModel):
    allowed: bool
    reasons: list[str]
