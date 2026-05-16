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


class StudentAssignmentListItemRead(BaseModel):
    id: UUID
    course_id: UUID
    course_title: str
    title: str
    description: str | None = None
    deadline: datetime
    start_date: datetime
    submitted: bool = False
    grade: int | None = None
    final_grade: float | None = None
    grade_max: int = 100
    status: str = Field(description="pending | submitted | graded | overdue")
    urgency: str = Field(description="danger | warning | info | muted")


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


class StudentRepositoriesStatsRead(BaseModel):
    total: int
    public_count: int
    private_count: int
    course_count: int
    commits_week: int
    total_commits: int
    repos_week_delta: int


class StudentRepositoryItemRead(BaseModel):
    id: str
    name: str
    description: str | None = None
    gitea_path: str | None = None
    gitea_web_url: str | None = None
    clone_url: str | None = None
    language: str | None = None
    commits_count: int | None = None
    commits_count_approx: bool = False
    forks_count: int | None = None
    stars_count: int | None = None
    open_pr_count: int | None = None
    visibility: str
    source: str = Field(description="personal | assignment")
    assignment_label: str | None = None
    course_id: UUID | None = None
    assignment_id: UUID | None = None
    repository_id: UUID | None = None
    can_delete: bool = False
    updated_at: datetime


class StudentRepositoriesRead(BaseModel):
    gitea_web_base: str
    stats: StudentRepositoriesStatsRead
    repositories: list[StudentRepositoryItemRead] = Field(default_factory=list)


class StudentRepoCloneInfoRead(BaseModel):
    clone_url: str
    git_clone_command: str
    auth_required: bool = False
    note: str | None = None


class StudentRepoLintBody(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=512_000)


class StudentRepoLintDiagnosticRead(BaseModel):
    line: int
    column: int
    end_line: int
    end_column: int
    message: str
    severity: str = "error"


class StudentRepoLintRead(BaseModel):
    language: str
    diagnostics: list[StudentRepoLintDiagnosticRead] = Field(default_factory=list)
    linter: str = "none"
    skipped: bool = False
    message: str | None = None


class StudentRepoFileRead(BaseModel):
    sha: str
    name: str
    path: str
    type: str = Field(description="file | dir")
    size: int | None = None
    last_commit_message: str | None = None
    last_commit_at: datetime | None = None


class StudentRepoFileContentRead(BaseModel):
    filepath: str
    content: str


class StudentRepoBranchRead(BaseModel):
    name: str
    is_default: bool = False


class StudentRepoBranchesRead(BaseModel):
    default_branch: str
    branches: list[StudentRepoBranchRead] = Field(default_factory=list)


class StudentRepoRecentCommitRead(BaseModel):
    sha: str
    message: str
    author_name: str | None = None
    committed_at: datetime | None = None


class StudentRepoGiteaLinksRead(BaseModel):
    code: str
    issues: str
    pulls: str
    wiki: str
    settings: str
    commits: str
    activity: str


class StudentRepoSummaryRead(BaseModel):
    description: str | None = None
    language: str | None = None
    default_branch: str = "main"
    commits_count: int | None = None
    commits_count_approx: bool = False
    branches_count: int = 0
    tags_count: int = 0
    forks_count: int | None = None
    stars_count: int | None = None
    open_pr_count: int | None = None
    open_issues_count: int | None = None
    watchers_count: int | None = None
    size_kb: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    has_readme: bool = False
    readme_path: str | None = None
    license_name: str | None = None
    license_path: str | None = None
    recent_commits: list[StudentRepoRecentCommitRead] = Field(default_factory=list)
    gitea_links: StudentRepoGiteaLinksRead | None = None


class StudentRepoCommitsRead(BaseModel):
    commits: list[StudentRepoRecentCommitRead] = Field(default_factory=list)
    page: int = 1
    has_more: bool = False


class StudentRepoIssueRead(BaseModel):
    number: int
    title: str
    state: str
    author_name: str | None = None
    labels: list[str] = Field(default_factory=list)
    comments_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoIssuesRead(BaseModel):
    issues: list[StudentRepoIssueRead] = Field(default_factory=list)
    page: int = 1
    has_more: bool = False


class StudentRepoPullRead(BaseModel):
    number: int
    title: str
    state: str
    author_name: str | None = None
    head_branch: str | None = None
    base_branch: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoPullsRead(BaseModel):
    pulls: list[StudentRepoPullRead] = Field(default_factory=list)
    page: int = 1
    has_more: bool = False


class StudentRepoWikiPageRead(BaseModel):
    title: str
    slug: str
    subtitle: str | None = None


class StudentRepoWikiPagesRead(BaseModel):
    pages: list[StudentRepoWikiPageRead] = Field(default_factory=list)
    enabled: bool = True


class StudentRepoWikiContentRead(BaseModel):
    title: str
    slug: str
    content: str = ""


class StudentRepoFileSearchItemRead(BaseModel):
    path: str


class StudentRepoCreateFileBody(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = ""
    message: str = Field(default="Create file via MTUCI", max_length=500)
    branch: str | None = Field(default=None, max_length=200)


class StudentGroupRankingRead(BaseModel):
    group_name: str | None
    your_place: int | None = None
    your_points: int | None = None
    your_name: str | None = None
    top_percent_label: str | None = None
    entries: list[StudentGroupRankingEntryRead] = Field(default_factory=list)


class StudentGradeCourseRead(BaseModel):
    course_id: UUID
    title: str
    teacher_name: str
    grade_max: int
    average_score: int | None = None
    assignments_total: int
    assignments_graded: int
    assignments_submitted: int


class StudentGradeItemRead(BaseModel):
    assignment_id: UUID
    course_id: UUID
    course_title: str
    title: str
    grade: int | None = None
    final_grade: float | None = None
    grade_max: int = 100
    status: str = Field(description="pending | submitted | graded | overdue")
    graded_at: datetime | None = None
    submitted_at: datetime | None = None


class StudentGradesSummaryRead(BaseModel):
    overall_average: float | None = None
    graded_count: int = 0
    pending_review: int = 0
    courses: list[StudentGradeCourseRead] = Field(default_factory=list)
    items: list[StudentGradeItemRead] = Field(default_factory=list)


class StudentForkItemRead(BaseModel):
    id: UUID
    event_type: str = Field(description="fork | repo_created")
    source_repo: str
    target_repo: str | None = None
    created_at: datetime
