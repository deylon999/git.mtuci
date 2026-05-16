from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminForkEventRead(BaseModel):
    id: UUID
    event_type: str = Field(description="fork | repo_created")
    user_id: UUID
    user_full_name: str
    user_login: str | None = None
    source_repo: str | None = None
    target_repo: str | None = None
    message: str | None = None
    created_at: datetime


class AdminForkStatsRead(BaseModel):
    total: int
    forks_count: int
    created_count: int
    today_count: int
    unique_users: int


class AdminForkEventsRead(BaseModel):
    stats: AdminForkStatsRead
    events: list[AdminForkEventRead] = Field(default_factory=list)
