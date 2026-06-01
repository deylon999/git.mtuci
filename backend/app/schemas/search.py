from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SearchHitRead(BaseModel):
    type: str = Field(description="course | assignment | user | repository")
    id: str
    title: str
    display_name: str | None = None
    subtitle: str | None = None
    href: str
    repo_description: str | None = None
    repo_language: str | None = None
    repo_visibility: str | None = None
    repo_commits_count: int | None = None
    repo_forks_count: int | None = None
    repo_pushed_at: datetime | None = None
    repo_updated_at: datetime | None = None
    course_teacher_name: str | None = None
    course_groups: list[str] | None = None
    course_status: str | None = None
    course_assignments_count: int | None = None
    course_students_count: int | None = None
    course_nearest_deadline: datetime | None = None
    course_pr_count: int | None = None


class SearchResponseRead(BaseModel):
    query: str
    total: int = 0
    page: int = 1
    pages: int = 0
    hits: list[SearchHitRead] = Field(default_factory=list)
