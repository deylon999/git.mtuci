from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TeacherGradingQueueStatsRead(BaseModel):
    pending: int
    stale: int
    graded_today: int
    avg_waiting_hours: float | None = None


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
    waiting_hours: float = 0
    is_stale: bool = False


class TeacherDashboardRead(BaseModel):
    courses_count: int
    students_total: int
    assignments_total: int
    pending_grading: int
    submissions_this_week: int
    overdue_assignments: int


class TeacherDashboardPendingWorkRead(BaseModel):
    submission_id: UUID
    student_id: UUID
    student_name: str
    assignment_id: UUID
    assignment_title: str
    course_id: UUID
    course_title: str
    submitted_at: datetime
    repo_name: str | None = None
    waiting_hours: float = 0
    is_stale: bool = False


class TeacherDashboardCommitRead(BaseModel):
    student_id: UUID | None = None
    student_name: str
    repo_name: str | None = None
    message: str | None = None
    created_at: datetime


class TeacherDashboardCourseSummaryRead(BaseModel):
    course_id: UUID
    title: str
    students_count: int
    assignments_count: int
    pending_count: int


class TeacherDashboardDeadlineRead(BaseModel):
    assignment_id: UUID
    assignment_title: str
    course_id: UUID
    course_title: str
    deadline: datetime
    submitted_count: int
    total_students: int


class TeacherDashboardActivityDayRead(BaseModel):
    date: str
    commits: int


class TeacherDashboardFullRead(BaseModel):
    greeting_name: str
    department: str | None = None
    active_courses_count: int
    students_total: int
    pending_grading: int
    commits_today: int
    pending_work: list[TeacherDashboardPendingWorkRead] = Field(default_factory=list)
    recent_commits: list[TeacherDashboardCommitRead] = Field(default_factory=list)
    courses: list[TeacherDashboardCourseSummaryRead] = Field(default_factory=list)
    deadlines: list[TeacherDashboardDeadlineRead] = Field(default_factory=list)
    activity_by_day: list[TeacherDashboardActivityDayRead] = Field(default_factory=list)


class TeacherStudentListItemRead(BaseModel):
    student_id: UUID
    full_name: str
    email: str
    group_name: str | None
    courses: list[str] = Field(default_factory=list)
    course_ids: list[UUID] = Field(default_factory=list)
    repositories_count: int = 0
    commits_total: int = 0
    last_activity_at: datetime | None = None
    average_grade: float | None = None
    activity_status: str = "inactive"


class TeacherStudentsSummaryRead(BaseModel):
    students_total: int
    active_this_week: int
    average_grade: float | None
    pending_grading: int
    items: list[TeacherStudentListItemRead] = Field(default_factory=list)


class TeacherActivityItemRead(BaseModel):
    id: UUID
    activity_type: str
    student_name: str | None
    repo_name: str | None
    message: str | None
    created_at: datetime


class TeacherCourseStudentDetailRead(BaseModel):
    student_id: UUID
    full_name: str
    email: str
    group_name: str | None = None
    completed_assignments: int = 0
    total_assignments: int = 0
    average_grade: float | None = None
    last_activity_at: datetime | None = None
    activity_status: str = "inactive"


class TeacherCourseWeekActivityRead(BaseModel):
    week_label: str
    commits: int


class TeacherCourseDetailRead(BaseModel):
    course_id: UUID
    title: str
    description: str | None
    grade_max: int
    target_groups: list[str] = Field(default_factory=list)
    students_count: int
    assignments_count: int
    average_grade: float | None = None
    completion_percent: float | None = None
    pending_grading: int = 0
    activity_by_week: list[TeacherCourseWeekActivityRead] = Field(default_factory=list)
    students: list[TeacherCourseStudentDetailRead] = Field(default_factory=list)


class TeacherTemplateRepoRead(BaseModel):
    repo_name: str
    description: str | None = None
    assignments_count: int = 0
    courses: list[str] = Field(default_factory=list)
    last_assignment_at: datetime | None = None


class TeacherCourseListItemRead(BaseModel):
    course_id: UUID
    title: str
    description: str | None
    students_count: int
    assignments_count: int
    pending_count: int
    grade_max: int
    target_groups: list[str] = Field(default_factory=list)
    nearest_deadline: datetime | None = None
    nearest_deadline_title: str | None = None
    submitted_percent: float | None = None
