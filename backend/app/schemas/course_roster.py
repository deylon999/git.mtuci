from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CourseStudentRead(BaseModel):
    student_id: UUID
    full_name: str
    email: str
    group_name: str | None = None
    student_number: str | None = None
    enrolled_at: datetime | None = None


class EnrollByGroupRequest(BaseModel):
    group_name: str = Field(min_length=1, max_length=50)


class EnrollByGroupResult(BaseModel):
    group_name: str
    enrolled: int
    skipped: int
    student_ids: list[UUID] = Field(default_factory=list)
