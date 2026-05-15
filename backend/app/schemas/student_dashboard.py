from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StudentDashboardKpiRead(BaseModel):
    repos_total: int
    repos_week_delta: int
    commits_week: int
    commits_week_avg: float | None
    courses_active: int
    assignments_total: int
    deadlines_today: int
    deadlines_today_sub: str


class StudentSidebarCountsRead(BaseModel):
    courses_count: int
    assignments_pending: int


class StudentDashboardCourseRead(BaseModel):
    id: UUID
    title: str
    teacher_name: str
    assignments_count: int
    score: int | None
    score_max: int
    score_color: str = "muted"


class StudentDeadlineRead(BaseModel):
    id: str
    assignment_id: UUID
    course_id: UUID
    name: str
    course: str
    deadline: datetime
    urgency: str


class StudentDeadlineDetailRead(StudentDeadlineRead):
    submitted: bool = False


class StudentDashboardStatsRead(BaseModel):
    kpi: StudentDashboardKpiRead
    sidebar: StudentSidebarCountsRead
    courses: list[StudentDashboardCourseRead]
    deadlines: list[StudentDeadlineRead]


class StudentRecentRepositoryRead(BaseModel):
    id: str
    name: str
    assignment_label: str | None = None
    language: str | None = None
    commits_count: int | None = None
    updated_at: datetime
    visibility: str
    source: str = Field(description="personal | assignment")
    course_id: UUID | None = None
    assignment_id: UUID | None = None
    repository_id: UUID | None = None


class StudentActivitySummaryRead(BaseModel):
    week_progress_percent: int
    commits: int
    prs_open: int
    submitted: int
    in_review: int


class StudentActivityFeedItemRead(BaseModel):
    id: str
    type: str = Field(description="success | commit | comment | deadline | notification")
    text: str
    bold: str | None = None
    text_after: str | None = None
    time_label: str
    created_at: datetime
    badge: str | None = None
    badge_variant: str | None = None
    href: str | None = None


class StudentGroupRankingEntryRead(BaseModel):
    place: int
    student_id: UUID
    name: str
    points: int
    is_you: bool = False


class StudentGroupRankingRead(BaseModel):
    group_name: str | None
    your_place: int | None = None
    your_points: int | None = None
    your_name: str | None = None
    top_percent_label: str | None = None
    entries: list[StudentGroupRankingEntryRead] = Field(default_factory=list)
