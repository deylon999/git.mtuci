from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GitTokenCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


class GitTokenRotateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    scopes: list[str] | None = None
    expires_at: datetime | None = None


class GitTokenRead(BaseModel):
    id: UUID
    name: str
    scopes: list[str]
    token_preview: str | None
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime
    is_active: bool


class GitTokenCreateRead(GitTokenRead):
    token: str


class UserSshKeyCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    public_key: str = Field(min_length=16)
    read_only: bool = False


class UserSshKeyRead(BaseModel):
    id: UUID
    title: str
    key_fingerprint: str | None
    key_type: str | None
    public_key_preview: str | None
    read_only: bool
    created_at: datetime
