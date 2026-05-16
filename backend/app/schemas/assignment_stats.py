from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class AssignmentStatsRead(BaseModel):
    assignment_id: UUID
    course_id: UUID
    title: str
    students_total: int
    submitted_count: int
    graded_count: int
    pending_grade_count: int
    overdue_count: int
    average_grade: float | None = None
    average_final_grade: float | None = None
