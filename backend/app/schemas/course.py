from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field


class CourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    grade_max: int = 100
    target_groups: Optional[List[str]] = None
    teacher_id: Optional[UUID] = None


class CourseUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    grade_max: Optional[int] = None
    target_groups: Optional[List[str]] = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: Optional[str]
    grade_max: int
    target_groups: Optional[List[str]] = None
    teacher_id: UUID
    created_at: datetime

    @computed_field
    @property
    def enrolled_count(self) -> int:
        # Get from instance attribute if set by service layer
        return getattr(self, '_enrolled_count', 0)


class CourseEnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    student_id: UUID
    enrolled_at: datetime

