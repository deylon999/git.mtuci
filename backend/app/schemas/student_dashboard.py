from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.notification import NotificationRead
from app.schemas.system import SystemInfoRead
from app.schemas.user import UserRead
from app.schemas.user_settings import UserSettingsRead


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
    id: str
    platform_course_id: UUID | None = None
    title: str
    teacher_name: str | None = None
    assignments_count: int = 0
    score: int | None = None
    score_label: str | None = None
    score_max: int = 100
    score_color: str = "muted"
    attendance_percent: float | None = None
    source: str = "platform"
    has_platform: bool = True


class StudentMergedCourseRead(BaseModel):
    id: str
    platform_course_id: UUID | None = None
    title: str
    source: str = Field(description="platform | lk | merged")
    teacher_name: str | None = None
    attendance_percent: float | None = None
    attendance_skips: int | None = None
    assignments_total: int = 0
    assignments_graded: int = 0
    assignments_submitted: int = 0
    earned_points: float = 0
    max_points: float = 0
    percent: float | None = None
    score: int | None = None
    score_label: str | None = None
    grade_max: int = 100
    score_color: str = "muted"
    enrolled_count: int = 0
    has_platform: bool = False


class StudentMergedCoursesRead(BaseModel):
    courses: list[StudentMergedCourseRead] = Field(default_factory=list)
    lk_warning: str | None = Field(
        default=None,
        description="lk_credentials_missing | lk_auth_failed | lk_unavailable",
    )


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
    type: str = Field(description="success | commit | comment | deadline | pr | repo | notification")
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
    gitea_available: bool = True
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


class StudentRepoCreateBranchBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    from_ref: str = Field(default="main", min_length=1, max_length=200)


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
    is_blocked: bool = False
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
    body: str | None = None
    state: str
    author_name: str | None = None
    labels: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    milestone: str | None = None
    comments_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoIssuesRead(BaseModel):
    issues: list[StudentRepoIssueRead] = Field(default_factory=list)
    page: int = 1
    has_more: bool = False


class StudentRepoIssueUpsertBody(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=10000)
    labels: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    milestone: str | None = Field(default=None, max_length=255)


class StudentRepoIssuePatchBody(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=10000)
    state: str | None = Field(default=None, pattern="^(open|closed)$")
    labels: list[str] | None = None
    assignees: list[str] | None = None
    milestone: str | None = Field(default=None, max_length=255)


class StudentRepoReactionBody(BaseModel):
    content: str = Field(
        pattern="^(\\+1|-1|laugh|confused|heart|hooray|rocket|eyes)$",
        description="+1|-1|laugh|confused|heart|hooray|rocket|eyes",
    )


class StudentRepoPullRead(BaseModel):
    number: int
    title: str
    state: str
    author_name: str | None = None
    head_branch: str | None = None
    base_branch: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    merged: bool | None = None
    commits_count: int | None = None


class StudentRepoPullFileRead(BaseModel):
    filename: str
    status: str | None = None
    additions: int = 0
    deletions: int = 0
    changes: int = 0
    previous_filename: str | None = None


class StudentRepoPullReviewCommentRead(BaseModel):
    id: int
    review_id: int | None = None
    body: str
    path: str | None = None
    position: int | None = None
    original_position: int | None = None
    user_login: str | None = None
    user_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoPullThreadRead(BaseModel):
    path: str
    position: int | None = None
    original_position: int | None = None
    comments: list[StudentRepoPullReviewCommentRead] = Field(default_factory=list)


class StudentRepoPullReviewRead(BaseModel):
    id: int
    state: str | None = None
    body: str | None = None
    dismissed: bool = False
    comments_count: int = 0
    user_login: str | None = None
    user_name: str | None = None
    submitted_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoPullDiscussionCommentRead(BaseModel):
    id: int
    body: str
    user_login: str | None = None
    user_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StudentRepoPullCheckItemRead(BaseModel):
    id: str
    name: str
    source: str = Field(description="commit_status | action_run")
    state: str = Field(description="queued | running | success | failure | cancelled | unknown")
    description: str | None = None
    details_url: str | None = None
    run_id: int | None = None
    job_id: int | None = None
    can_retry: bool = False
    has_logs: bool = False


class StudentRepoPullChecksRead(BaseModel):
    can_merge: bool = False
    mergeable: bool | None = None
    conflict_state: str = Field(description="clean | conflicting | unknown")
    blocked_reason: str | None = None
    policy_reasons: list[str] = Field(default_factory=list)
    required_approvals: int = 0
    approvals: int = 0
    required_contexts: list[str] = Field(default_factory=list)
    successful_contexts: list[str] = Field(default_factory=list)
    missing_required_contexts: list[str] = Field(default_factory=list)
    required_reviewer_logins: list[str] = Field(default_factory=list)
    approved_reviewer_logins: list[str] = Field(default_factory=list)
    missing_required_reviewer_logins: list[str] = Field(default_factory=list)
    items: list[StudentRepoPullCheckItemRead] = Field(default_factory=list)


class StudentRepoPullDetailRead(BaseModel):
    number: int
    title: str
    state: str
    body: str | None = None
    author_name: str | None = None
    author_login: str | None = None
    head_branch: str | None = None
    base_branch: str | None = None
    head_sha: str | None = None
    base_sha: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    merged: bool | None = None
    mergeable: bool | None = None
    draft: bool | None = None
    comments_count: int = 0
    review_comments_count: int = 0
    commits_count: int | None = None
    changed_files_count: int | None = None
    web_url: str | None = None
    diff_url: str | None = None
    patch_url: str | None = None


class StudentRepoPullDetailBundleRead(BaseModel):
    pull: StudentRepoPullDetailRead
    diff: str = ""
    files: list[StudentRepoPullFileRead] = Field(default_factory=list)
    reviews: list[StudentRepoPullReviewRead] = Field(default_factory=list)
    threads: list[StudentRepoPullThreadRead] = Field(default_factory=list)
    discussion: list[StudentRepoPullDiscussionCommentRead] = Field(default_factory=list)
    checks: StudentRepoPullChecksRead


class StudentRepoCreatePullBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    head: str = Field(min_length=1, max_length=200)
    base: str = Field(default="main", min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=5000)


class StudentRepoCreatePullReviewCommentBody(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1, max_length=5000)
    new_position: int | None = Field(default=None, ge=1)
    old_position: int | None = Field(default=None, ge=1)


class StudentRepoCreatePullReviewBody(BaseModel):
    event: str = Field(
        default="comment",
        pattern="^(comment|approve|request_changes)$",
        description="comment | approve | request_changes",
    )
    body: str | None = Field(default=None, max_length=5000)
    comments: list[StudentRepoCreatePullReviewCommentBody] = Field(default_factory=list)


class StudentRepoCreatePullDiscussionCommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class StudentRepoMergePullBody(BaseModel):
    method: str = Field(default="merge", pattern="^(merge|squash|rebase)$")
    commit_title: str | None = Field(default=None, max_length=200)
    commit_message: str | None = Field(default=None, max_length=5000)
    delete_branch_after_merge: bool = True
    force_merge: bool = False
    head_commit_id: str | None = Field(default=None, min_length=4, max_length=80)


class StudentRepoMergeResultRead(BaseModel):
    merged: bool
    message: str | None = None


class StudentRepoPullCheckLogRead(BaseModel):
    id: str
    log: str
    truncated: bool = False


class StudentRepoPullCheckRetryRead(BaseModel):
    id: str
    accepted: bool
    message: str | None = None


class StudentRepoCommitDiffRead(BaseModel):
    sha: str
    diff: str


class StudentRepoFileHistoryCommitRead(BaseModel):
    sha: str
    message: str | None = None
    author_name: str | None = None
    author_login: str | None = None
    authored_at: datetime | None = None
    web_url: str | None = None


class StudentRepoFileHistoryRead(BaseModel):
    path: str
    branch: str
    page: int = 1
    has_more: bool = False
    commits: list[StudentRepoFileHistoryCommitRead] = Field(default_factory=list)


class StudentRepoCompareFileRead(BaseModel):
    filename: str
    previous_filename: str | None = None
    status: str | None = None
    additions: int = 0
    deletions: int = 0
    changes: int = 0
    is_binary: bool = False
    too_large: bool = False
    truncated: bool = False


class StudentRepoCompareRead(BaseModel):
    base: str
    head: str
    status: str | None = None
    ahead_by: int = 0
    behind_by: int = 0
    total_commits: int = 0
    files: list[StudentRepoCompareFileRead] = Field(default_factory=list)


class StudentRepoBlameChunkRead(BaseModel):
    sha: str
    message: str | None = None
    author_name: str | None = None
    author_login: str | None = None
    authored_at: datetime | None = None
    web_url: str | None = None
    start_line: int
    end_line: int
    line_count: int = 1


class StudentRepoBlameRead(BaseModel):
    path: str
    branch: str
    chunks: list[StudentRepoBlameChunkRead] = Field(default_factory=list)


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


class StudentAppShellRead(BaseModel):
    """Auth, preferences, inbox, and footer metadata bundled with student pages."""

    user: UserRead
    settings: UserSettingsRead
    notifications: list[NotificationRead] = Field(default_factory=list)
    system_info: SystemInfoRead


class StudentProfileBundleRead(StudentAppShellRead):
    """Single response for /students/me/profile-bundle."""

    activity_summary: StudentActivitySummaryRead
    activity_feed: list[StudentActivityFeedItemRead] = Field(default_factory=list)
    group_ranking: StudentGroupRankingRead
    repositories_stats: StudentRepositoriesStatsRead


class StudentDashboardBundleRead(StudentAppShellRead):
    """Single response for /students/me/dashboard-bundle — one round-trip for dashboard."""

    stats: StudentDashboardStatsRead
    recent_repositories: list[StudentRecentRepositoryRead] = Field(default_factory=list)
    activity_summary: StudentActivitySummaryRead
    activity_feed: list[StudentActivityFeedItemRead] = Field(default_factory=list)
    group_ranking: StudentGroupRankingRead


class StudentGitCloneTokenStatusRead(BaseModel):
    configured: bool
    masked_token: str | None = None
    gitea_username: str | None = None


class StudentGitCloneTokenRegenerateRead(BaseModel):
    token: str
    gitea_username: str
    note: str = (
        "Сохраните токен — он показывается один раз. Используйте в URL git clone для приватных репозиториев."
    )


class StudentGradeCourseRead(BaseModel):
    course_id: UUID
    title: str
    teacher_name: str
    grade_max: int
    average_score: int | None = None
    earned_points: float = 0
    max_points: float = 0
    percent: float | None = None
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
    percent: float | None = None
    status: str = Field(description="pending | submitted | graded | overdue")
    graded_at: datetime | None = None
    submitted_at: datetime | None = None
    comment: str | None = None


class StudentGradesSummaryRead(BaseModel):
    overall_average: float | None = None
    overall_earned: float = 0
    overall_max: float = 0
    overall_percent: float | None = None
    graded_count: int = 0
    pending_review: int = 0
    courses: list[StudentGradeCourseRead] = Field(default_factory=list)
    items: list[StudentGradeItemRead] = Field(default_factory=list)


class StudentForkItemRead(BaseModel):
    id: str
    name: str
    fork_repo_path: str
    parent_repo_path: str | None = None
    parent_web_url: str | None = None
    gitea_web_url: str | None = None
    ahead_by: int | None = None
    behind_by: int | None = None
    open_pr_count: int | None = None
    sync_status: str = "unknown"
    updated_at: datetime | None = None
