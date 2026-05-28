from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CodeSearchHitRead(BaseModel):
    repository_id: str
    repository_name: str
    path: str
    branch: str
    score: float
    snippet: str | None = None
    highlights: list[str] = Field(default_factory=list)


class CodeSearchResponseRead(BaseModel):
    query: str
    total: int
    facets: dict = Field(default_factory=dict)
    hits: list[CodeSearchHitRead] = Field(default_factory=list)


class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    query: str = Field(min_length=1, max_length=500)
    search_type: str = Field(default="code", max_length=32)
    filters: dict = Field(default_factory=dict)


class SavedSearchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    query: str | None = Field(default=None, min_length=1, max_length=500)
    filters: dict | None = None


class SavedSearchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    name: str
    query: str
    search_type: str
    filters: dict = Field(default_factory=dict, alias="filters_json")
    created_at: datetime
    updated_at: datetime
