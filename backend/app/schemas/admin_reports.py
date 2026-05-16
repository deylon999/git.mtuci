from __future__ import annotations

from pydantic import BaseModel, Field


class AdminCourseSummaryRead(BaseModel):
    id: str
    title: str
    teacher_name: str
    students_count: int
    assignments_count: int


class AdminReportsOverviewRead(BaseModel):
    total_users: int
    pending_users: int
    total_students: int
    total_teachers: int
    total_courses: int
    total_repositories: int
    submissions_pending_grade: int
    activity_today: int
    courses: list[AdminCourseSummaryRead] = Field(default_factory=list)
