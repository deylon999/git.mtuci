from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TeacherGradingQueueItemRead(BaseModel):
    submission_id: UUID
    student_id: UUID
    student_name: str
    assignment_id: UUID
    assignment_title: str
    course_id: UUID
    course_title: str
    submitted_at: datetime
    repo_name: str | None = None


class TeacherDashboardRead(BaseModel):
    courses_count: int
    students_total: int
    assignments_total: int
    pending_grading: int
    submissions_this_week: int
    overdue_assignments: int
