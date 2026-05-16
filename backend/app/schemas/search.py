from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class SearchHitRead(BaseModel):
    type: str = Field(description="course | assignment | user | repository")
    id: str
    title: str
    subtitle: str | None = None
    href: str


class SearchResponseRead(BaseModel):
    query: str
    hits: list[SearchHitRead] = Field(default_factory=list)
