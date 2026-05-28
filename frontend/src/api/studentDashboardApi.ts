import { apiRequest } from "./client";
import type { Notification, UserRead } from "./types";
import type { UserSettings } from "./userSettingsApi";
import type { SystemInfo } from "./systemApi";

export interface StudentDashboardKpi {
  repos_total: number;
  repos_week_delta: number;
  commits_week: number;
  commits_week_avg: number | null;
  courses_active: number;
  assignments_total: number;
  deadlines_today: number;
  deadlines_today_sub: string;
}

export interface StudentSidebarCounts {
  courses_count: number;
  assignments_pending: number;
}

export interface StudentDashboardCourse {
  id: string;
  platform_course_id?: string | null;
  title: string;
  teacher_name?: string | null;
  assignments_count: number;
  score: number | null;
  score_label?: string | null;
  score_max: number;
  score_color: "success" | "warning" | "danger" | "muted";
  attendance_percent?: number | null;
  source?: "platform" | "lk" | "merged";
  has_platform?: boolean;
}

export interface StudentMergedCourse {
  id: string;
  platform_course_id: string | null;
  title: string;
  source: "platform" | "lk" | "merged";
  teacher_name: string | null;
  attendance_percent: number | null;
  attendance_skips: number | null;
  assignments_total: number;
  assignments_graded: number;
  assignments_submitted: number;
  earned_points: number;
  max_points: number;
  percent: number | null;
  score: number | null;
  score_label: string | null;
  grade_max: number;
  score_color: "success" | "warning" | "danger" | "muted";
  enrolled_count: number;
  has_platform: boolean;
}

export interface StudentMergedCoursesResponse {
  courses: StudentMergedCourse[];
  lk_warning: string | null;
}

export function getStudentMergedCourses(refresh = false): Promise<StudentMergedCoursesResponse> {
  const qs = refresh ? "?refresh=true" : "";
  return apiRequest<StudentMergedCoursesResponse>(`/students/me/courses-merged${qs}`);
}

export interface StudentDeadlineDto {
  id: string;
  assignment_id: string;
  course_id: string;
  name: string;
  course: string;
  deadline: string;
  urgency: "danger" | "warning" | "info" | "muted";
}

export interface StudentDashboardStats {
  kpi: StudentDashboardKpi;
  sidebar: StudentSidebarCounts;
  courses: StudentDashboardCourse[];
  deadlines: StudentDeadlineDto[];
}

export interface StudentRecentRepository {
  id: string;
  name: string;
  assignment_label: string | null;
  language: string | null;
  commits_count: number | null;
  updated_at: string;
  visibility: string;
  source: "personal" | "assignment";
  course_id?: string | null;
  assignment_id?: string | null;
  repository_id?: string | null;
}

export interface StudentActivitySummary {
  week_progress_percent: number;
  commits: number;
  prs_open: number;
  submitted: number;
  in_review: number;
}

export interface StudentActivityFeedItem {
  id: string;
  type: "success" | "commit" | "comment" | "deadline" | "pr" | "repo" | "notification";
  text: string;
  bold: string | null;
  text_after: string | null;
  time_label: string;
  created_at: string;
  badge: string | null;
  badge_variant: "ok" | "warn" | "err" | "info" | "gray" | null;
  href: string | null;
}

export interface StudentGroupRankingEntry {
  place: number;
  student_id: string;
  name: string;
  points: number;
  is_you: boolean;
}

export interface StudentGroupRanking {
  group_name: string | null;
  your_place: number | null;
  your_points: number | null;
  your_name: string | null;
  top_percent_label: string | null;
  entries: StudentGroupRankingEntry[];
}

export interface StudentAppShellFields {
  user: UserRead;
  settings: UserSettings;
  notifications: Notification[];
  system_info: SystemInfo;
}

export interface StudentDashboardBundle extends StudentAppShellFields {
  stats: StudentDashboardStats;
  recent_repositories: StudentRecentRepository[];
  activity_summary: StudentActivitySummary;
  activity_feed: StudentActivityFeedItem[];
  group_ranking: StudentGroupRanking;
}

export function getStudentDashboardBundle(
  recentLimit = 5,
  feedLimit = 12,
): Promise<StudentDashboardBundle> {
  return apiRequest<StudentDashboardBundle>(
    `/students/me/dashboard-bundle?recent_limit=${recentLimit}&feed_limit=${feedLimit}`,
  );
}

export function getStudentDashboardStats(): Promise<StudentDashboardStats> {
  return apiRequest<StudentDashboardStats>("/students/me/dashboard-stats");
}

export function getStudentRecentRepositories(limit = 5): Promise<StudentRecentRepository[]> {
  return apiRequest<StudentRecentRepository[]>(`/students/me/repositories/recent?limit=${limit}`);
}

export function getStudentActivitySummary(): Promise<StudentActivitySummary> {
  return apiRequest<StudentActivitySummary>("/students/me/activity-summary");
}

export function getStudentActivityFeed(limit = 12): Promise<StudentActivityFeedItem[]> {
  return apiRequest<StudentActivityFeedItem[]>(`/students/me/activity-feed?limit=${limit}`);
}

export function getStudentGroupRanking(): Promise<StudentGroupRanking> {
  return apiRequest<StudentGroupRanking>("/students/me/group-ranking");
}

export interface StudentProfileBundle extends StudentAppShellFields {
  activity_summary: StudentActivitySummary;
  activity_feed: StudentActivityFeedItem[];
  group_ranking: StudentGroupRanking;
  repositories_stats: StudentRepositoriesStats;
}

export function getStudentProfileBundle(feedLimit = 8): Promise<StudentProfileBundle> {
  return apiRequest<StudentProfileBundle>(
    `/students/me/profile-bundle?feed_limit=${feedLimit}`,
  );
}

export interface StudentGitCloneTokenStatus {
  configured: boolean;
  masked_token: string | null;
  gitea_username: string | null;
}

export interface StudentGitCloneTokenRegenerate {
  token: string;
  gitea_username: string;
  note: string;
}

export function getStudentGitCloneTokenStatus(): Promise<StudentGitCloneTokenStatus> {
  return apiRequest<StudentGitCloneTokenStatus>("/students/me/git-clone-token");
}

export function regenerateStudentGitCloneToken(): Promise<StudentGitCloneTokenRegenerate> {
  return apiRequest<StudentGitCloneTokenRegenerate>("/students/me/git-clone-token/regenerate", {
    method: "POST",
  });
}

export interface StudentDeadlineDetail extends StudentDeadlineDto {
  submitted: boolean;
}

export function getStudentDeadlines(limit = 100): Promise<StudentDeadlineDetail[]> {
  return apiRequest<StudentDeadlineDetail[]>(`/students/me/deadlines?limit=${limit}`);
}

export type StudentAssignmentStatus = "pending" | "submitted" | "graded" | "overdue";

export interface StudentAssignmentListItem {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  description: string | null;
  deadline: string;
  start_date: string;
  submitted: boolean;
  grade: number | null;
  final_grade: number | null;
  grade_max: number;
  status: StudentAssignmentStatus;
  urgency: "danger" | "warning" | "info" | "muted";
}

export function getStudentAssignments(limit = 200): Promise<StudentAssignmentListItem[]> {
  return apiRequest<StudentAssignmentListItem[]>(`/students/me/assignments?limit=${limit}`);
}

export interface StudentGradeCourse {
  course_id: string;
  title: string;
  teacher_name: string;
  grade_max: number;
  average_score: number | null;
  earned_points: number;
  max_points: number;
  percent: number | null;
  assignments_total: number;
  assignments_graded: number;
  assignments_submitted: number;
}

export interface StudentGradeItem {
  assignment_id: string;
  course_id: string;
  course_title: string;
  title: string;
  grade: number | null;
  final_grade: number | null;
  grade_max: number;
  percent: number | null;
  status: StudentAssignmentStatus;
  graded_at: string | null;
  submitted_at: string | null;
  comment: string | null;
}

export interface StudentGradesSummary {
  overall_average: number | null;
  overall_earned: number;
  overall_max: number;
  overall_percent: number | null;
  graded_count: number;
  pending_review: number;
  courses: StudentGradeCourse[];
  items: StudentGradeItem[];
}

export function getStudentGrades(limit = 200): Promise<StudentGradesSummary> {
  return apiRequest<StudentGradesSummary>(`/students/me/grades?limit=${limit}`);
}

export interface StudentForkItem {
  id: string;
  name: string;
  fork_repo_path: string;
  parent_repo_path: string | null;
  parent_web_url: string | null;
  gitea_web_url: string | null;
  ahead_by: number | null;
  behind_by: number | null;
  open_pr_count: number | null;
  sync_status: "up_to_date" | "ahead" | "behind" | "unknown" | string;
  updated_at: string | null;
}

export function getStudentForks(limit = 100): Promise<StudentForkItem[]> {
  return apiRequest<StudentForkItem[]>(`/students/me/forks?limit=${limit}`);
}

export function syncStudentFork(repoPath: string): Promise<{ status: string }> {
  const q = encodeURIComponent(repoPath);
  return apiRequest<{ status: string }>(`/students/me/forks/sync?repo_path=${q}`, {
    method: "POST",
  });
}

export interface StudentRepositoriesStats {
  total: number;
  public_count: number;
  private_count: number;
  course_count: number;
  commits_week: number;
  total_commits: number;
  repos_week_delta: number;
}

export interface StudentRepositoryItem {
  id: string;
  name: string;
  description: string | null;
  gitea_path: string | null;
  gitea_web_url: string | null;
  clone_url: string | null;
  language: string | null;
  commits_count: number | null;
  commits_count_approx: boolean;
  forks_count: number | null;
  stars_count: number | null;
  open_pr_count: number | null;
  visibility: string;
  source: "personal" | "assignment";
  assignment_label: string | null;
  course_id?: string | null;
  assignment_id?: string | null;
  repository_id?: string | null;
  can_delete: boolean;
  gitea_available?: boolean;
  updated_at: string;
}

export interface StudentRepositoriesResponse {
  gitea_web_base: string;
  stats: StudentRepositoriesStats;
  repositories: StudentRepositoryItem[];
}

export type StudentRepositoriesGiteaMode = "none" | "lite" | "full";

const repositoriesInflight = new Map<
  StudentRepositoriesGiteaMode,
  Promise<StudentRepositoriesResponse>
>();

export function getStudentRepositories(
  giteaMode: StudentRepositoriesGiteaMode = "lite",
): Promise<StudentRepositoriesResponse> {
  const cached = repositoriesInflight.get(giteaMode);
  if (cached) return cached;
  const req = apiRequest<StudentRepositoriesResponse>(
    `/students/me/repositories?gitea=${giteaMode}`,
  ).finally(() => {
    repositoriesInflight.delete(giteaMode);
  });
  repositoriesInflight.set(giteaMode, req);
  return req;
}

export function deleteStudentRepository(repositoryId: string): Promise<void> {
  return apiRequest<void>(`/students/me/repositories/${repositoryId}`, { method: "DELETE" });
}

export interface StudentRepoFile {
  sha: string;
  name: string;
  path: string;
  type: "file" | "dir";
  size: number | null;
  last_commit_message?: string | null;
  last_commit_at?: string | null;
}

export interface StudentRepoFileContent {
  filepath: string;
  content: string;
}

function encodeRepoFilePath(filepath: string) {
  return filepath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function repoQuery(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export interface StudentRepoBranches {
  default_branch: string;
  branches: { name: string; is_default: boolean }[];
}

export function getStudentRepoBranches(repoId: string): Promise<StudentRepoBranches> {
  return apiRequest<StudentRepoBranches>(`/students/me/repositories/${repoId}/branches`);
}

export interface StudentRepoRecentCommit {
  sha: string;
  message: string;
  author_name: string | null;
  committed_at: string | null;
}

export interface StudentRepoGiteaLinks {
  code: string;
  issues: string;
  pulls: string;
  wiki: string;
  settings: string;
  commits: string;
  activity: string;
}

export interface StudentRepoSummary {
  description: string | null;
  language: string | null;
  is_blocked: boolean;
  default_branch: string;
  commits_count: number | null;
  commits_count_approx: boolean;
  branches_count: number;
  tags_count: number;
  forks_count: number | null;
  stars_count: number | null;
  open_pr_count: number | null;
  open_issues_count: number | null;
  watchers_count: number | null;
  size_kb: number | null;
  created_at: string | null;
  updated_at: string | null;
  has_readme: boolean;
  readme_path: string | null;
  license_name: string | null;
  license_path: string | null;
  recent_commits: StudentRepoRecentCommit[];
  gitea_links: StudentRepoGiteaLinks | null;
}

export interface StudentRepoCommitsResponse {
  commits: StudentRepoRecentCommit[];
  page: number;
  has_more: boolean;
}

export function getStudentRepoCommits(
  repoId: string,
  branch?: string,
  page = 1,
  limit = 30,
): Promise<StudentRepoCommitsResponse> {
  return apiRequest<StudentRepoCommitsResponse>(
    `/students/me/repositories/${repoId}/commits${repoQuery({
      branch,
      page: String(page),
      limit: String(limit),
    })}`,
  );
}

export function getStudentRepoSummary(repoId: string, branch?: string): Promise<StudentRepoSummary> {
  return apiRequest<StudentRepoSummary>(
    `/students/me/repositories/${repoId}/summary${repoQuery({ branch })}`,
  );
}

export interface StudentRepoCreateBranchBody {
  name: string;
  from_ref?: string;
}

export function createStudentRepoBranch(repoId: string, body: StudentRepoCreateBranchBody): Promise<void> {
  return apiRequest<void>(`/students/me/repositories/${repoId}/branches`, {
    method: "POST",
    body,
  });
}

export function deleteStudentRepoBranch(repoId: string, branch: string): Promise<void> {
  return apiRequest<void>(`/students/me/repositories/${repoId}/branches/${encodeURIComponent(branch)}`, {
    method: "DELETE",
  });
}

export function getStudentRepoUnmergedBranches(repoId: string, base?: string, limit = 50): Promise<string[]> {
  return apiRequest<string[]>(
    `/students/me/repositories/${repoId}/unmerged-branches${repoQuery({
      base,
      limit: String(limit),
    })}`,
  );
}

export interface StudentRepoCloneInfo {
  clone_url: string;
  git_clone_command: string;
  auth_required: boolean;
  note: string | null;
}

export function getStudentRepoCloneInfo(repoId: string): Promise<StudentRepoCloneInfo> {
  return apiRequest<StudentRepoCloneInfo>(`/students/me/repositories/${repoId}/clone`);
}

export interface StudentRepoLintDiagnostic {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  message: string;
  severity: string;
}

export interface StudentRepoLintResult {
  language: string;
  diagnostics: StudentRepoLintDiagnostic[];
  linter: string;
  skipped: boolean;
  message: string | null;
}

export function lintStudentRepoFile(
  repoId: string,
  path: string,
  content: string,
): Promise<StudentRepoLintResult> {
  return apiRequest<StudentRepoLintResult>(`/students/me/repositories/${repoId}/lint`, {
    method: "POST",
    body: { path, content },
  });
}

export function searchStudentRepoFiles(
  repoId: string,
  q: string,
  branch?: string,
): Promise<{ path: string }[]> {
  return apiRequest<{ path: string }[]>(
    `/students/me/repositories/${repoId}/files/search${repoQuery({ q, branch })}`,
  );
}

export interface CreateStudentRepoFileBody {
  path: string;
  content: string;
  message?: string;
  branch?: string;
}

export function createStudentRepoFile(
  repoId: string,
  body: CreateStudentRepoFileBody,
): Promise<StudentRepoFile> {
  return apiRequest<StudentRepoFile>(`/students/me/repositories/${repoId}/files`, {
    method: "POST",
    body,
  });
}

export function getStudentRepoFiles(
  repoId: string,
  path = "",
  branch?: string,
): Promise<StudentRepoFile[]> {
  return apiRequest<StudentRepoFile[]>(
    `/students/me/repositories/${repoId}/files${repoQuery({ path: path || undefined, branch })}`,
  );
}

export function getStudentRepoFileContent(
  repoId: string,
  filepath: string,
  branch?: string,
): Promise<StudentRepoFileContent> {
  return apiRequest<StudentRepoFileContent>(
    `/students/me/repositories/${repoId}/files/${encodeRepoFilePath(filepath)}${repoQuery({ branch })}`,
  );
}

export interface StudentRepoIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  author_name: string | null;
  labels: string[];
  assignees?: string[];
  milestone?: string | null;
  comments_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudentRepoIssuesResponse {
  issues: StudentRepoIssue[];
  page: number;
  has_more: boolean;
}

export function getStudentRepoIssues(
  repoId: string,
  state = "open",
  page = 1,
  q?: string,
): Promise<StudentRepoIssuesResponse> {
  return apiRequest<StudentRepoIssuesResponse>(
    `/students/me/repositories/${repoId}/issues${repoQuery({ state, page: String(page), q })}`,
  );
}

export interface StudentRepoIssueUpsertBody {
  title: string;
  body?: string | null;
  labels?: string[];
  assignees?: string[];
  milestone?: string | null;
}

export interface StudentRepoIssuePatchBody {
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: string | null;
}

export function createStudentRepoIssue(repoId: string, body: StudentRepoIssueUpsertBody): Promise<StudentRepoIssue> {
  return apiRequest<StudentRepoIssue>(`/students/me/repositories/${repoId}/issues`, {
    method: "POST",
    body,
  });
}

export function patchStudentRepoIssue(
  repoId: string,
  issueNumber: number,
  body: StudentRepoIssuePatchBody,
): Promise<StudentRepoIssue> {
  return apiRequest<StudentRepoIssue>(
    `/students/me/repositories/${repoId}/issues/${encodeURIComponent(String(issueNumber))}`,
    { method: "PATCH", body },
  );
}

export function reactStudentRepoIssue(
  repoId: string,
  issueNumber: number,
  content: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
): Promise<any> {
  return apiRequest<any>(
    `/students/me/repositories/${repoId}/issues/${encodeURIComponent(String(issueNumber))}/reactions`,
    { method: "POST", body: { content } },
  );
}

export interface StudentRepoPull {
  number: number;
  title: string;
  state: string;
  author_name: string | null;
  head_branch: string | null;
  base_branch: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged?: boolean | null;
  commits_count?: number | null;
}

export interface StudentRepoPullFile {
  filename: string;
  status: string | null;
  additions: number;
  deletions: number;
  changes: number;
  previous_filename: string | null;
}

export interface StudentRepoPullReviewComment {
  id: number;
  review_id: number | null;
  body: string;
  path: string | null;
  position: number | null;
  original_position: number | null;
  user_login: string | null;
  user_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudentRepoPullThread {
  path: string;
  position: number | null;
  original_position: number | null;
  comments: StudentRepoPullReviewComment[];
}

export interface StudentRepoPullReview {
  id: number;
  state: string | null;
  body: string | null;
  dismissed: boolean;
  comments_count: number;
  user_login: string | null;
  user_name: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

export interface StudentRepoPullDiscussionComment {
  id: number;
  body: string;
  user_login: string | null;
  user_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudentRepoPullChecks {
  can_merge: boolean;
  mergeable: boolean | null;
  conflict_state: "clean" | "conflicting" | "unknown";
  blocked_reason: string | null;
  policy_reasons: string[];
  required_approvals: number;
  approvals: number;
  required_contexts: string[];
  successful_contexts: string[];
  missing_required_contexts: string[];
  required_reviewer_logins: string[];
  approved_reviewer_logins: string[];
  missing_required_reviewer_logins: string[];
  items: StudentRepoPullCheckItem[];
}

export interface StudentRepoPullCheckItem {
  id: string;
  name: string;
  source: "commit_status" | "action_run" | string;
  state: "success" | "failure" | "pending" | "unknown" | string;
  description: string | null;
  details_url: string | null;
  run_id: number | null;
  job_id: number | null;
  can_retry: boolean;
  has_logs: boolean;
}

export interface StudentRepoPullDetail {
  number: number;
  title: string;
  state: string;
  body: string | null;
  author_name: string | null;
  author_login: string | null;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  base_sha: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged: boolean | null;
  mergeable: boolean | null;
  draft: boolean | null;
  comments_count: number;
  review_comments_count: number;
  commits_count: number | null;
  changed_files_count: number | null;
  web_url: string | null;
  diff_url: string | null;
  patch_url: string | null;
}

export interface StudentRepoPullDetailBundle {
  pull: StudentRepoPullDetail;
  diff: string;
  files: StudentRepoPullFile[];
  reviews: StudentRepoPullReview[];
  threads: StudentRepoPullThread[];
  discussion: StudentRepoPullDiscussionComment[];
  checks: StudentRepoPullChecks;
}

export interface StudentRepoPullCheckLog {
  id: string;
  log: string;
  truncated: boolean;
}

export interface StudentRepoPullCheckRetryResult {
  id: string;
  accepted: boolean;
  message: string | null;
}

export interface StudentRepoPullsResponse {
  pulls: StudentRepoPull[];
  page: number;
  has_more: boolean;
}

export function getStudentRepoPulls(
  repoId: string,
  state = "open",
  page = 1,
): Promise<StudentRepoPullsResponse> {
  return apiRequest<StudentRepoPullsResponse>(
    `/students/me/repositories/${repoId}/pulls${repoQuery({ state, page: String(page) })}`,
  );
}

export interface StudentRepoCreatePullBody {
  title: string;
  head: string;
  base?: string;
  body?: string | null;
}

export function createStudentRepoPull(repoId: string, body: StudentRepoCreatePullBody): Promise<StudentRepoPull> {
  return apiRequest<StudentRepoPull>(`/students/me/repositories/${repoId}/pulls`, {
    method: "POST",
    body,
  });
}

export function getStudentRepoPullDetail(
  repoId: string,
  pullNumber: number,
): Promise<StudentRepoPullDetailBundle> {
  return apiRequest<StudentRepoPullDetailBundle>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}`,
  );
}

export function getStudentRepoPullCheckLog(
  repoId: string,
  pullNumber: number,
  checkId: string,
): Promise<StudentRepoPullCheckLog> {
  return apiRequest<StudentRepoPullCheckLog>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/checks/${encodeURIComponent(checkId)}/log`,
  );
}

export function retryStudentRepoPullCheck(
  repoId: string,
  pullNumber: number,
  checkId: string,
): Promise<StudentRepoPullCheckRetryResult> {
  return apiRequest<StudentRepoPullCheckRetryResult>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/checks/${encodeURIComponent(checkId)}/retry`,
    { method: "POST" },
  );
}

export interface StudentRepoCreatePullReviewCommentBody {
  path: string;
  body: string;
  new_position?: number;
  old_position?: number;
}

export interface StudentRepoCreatePullReviewBody {
  event: "comment" | "approve" | "request_changes";
  body?: string | null;
  comments?: StudentRepoCreatePullReviewCommentBody[];
}

export function createStudentRepoPullReview(
  repoId: string,
  pullNumber: number,
  body: StudentRepoCreatePullReviewBody,
): Promise<StudentRepoPullReview> {
  return apiRequest<StudentRepoPullReview>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/reviews`,
    {
      method: "POST",
      body,
    },
  );
}

export function createStudentRepoPullComment(
  repoId: string,
  pullNumber: number,
  body: { body: string },
): Promise<StudentRepoPullDiscussionComment> {
  return apiRequest<StudentRepoPullDiscussionComment>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/comments`,
    {
      method: "POST",
      body,
    },
  );
}

export interface StudentRepoMergePullBody {
  method: "merge" | "squash" | "rebase";
  commit_title?: string | null;
  commit_message?: string | null;
  delete_branch_after_merge?: boolean;
  force_merge?: boolean;
  head_commit_id?: string | null;
}

export interface StudentRepoMergePullResult {
  merged: boolean;
  message: string | null;
}

export function mergeStudentRepoPull(
  repoId: string,
  pullNumber: number,
  body: StudentRepoMergePullBody,
): Promise<StudentRepoMergePullResult> {
  return apiRequest<StudentRepoMergePullResult>(
    `/students/me/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/merge`,
    {
      method: "POST",
      body,
    },
  );
}

export interface StudentRepoCommitDiff {
  sha: string;
  diff: string;
}

export function getStudentRepoCommitDiff(repoId: string, sha: string): Promise<StudentRepoCommitDiff> {
  return apiRequest<StudentRepoCommitDiff>(`/students/me/repositories/${repoId}/commits/${encodeURIComponent(sha)}/diff`);
}

export interface StudentRepoFileHistoryCommit {
  sha: string;
  message: string | null;
  author_name: string | null;
  author_login: string | null;
  authored_at: string | null;
  web_url: string | null;
}

export interface StudentRepoFileHistoryResponse {
  path: string;
  branch: string;
  page: number;
  has_more: boolean;
  commits: StudentRepoFileHistoryCommit[];
}

export function getStudentRepoFileHistory(
  repoId: string,
  path: string,
  branch?: string,
  page = 1,
  limit = 20,
): Promise<StudentRepoFileHistoryResponse> {
  return apiRequest<StudentRepoFileHistoryResponse>(
    `/students/me/repositories/${repoId}/history/file${repoQuery({
      path,
      branch,
      page: String(page),
      limit: String(limit),
    })}`,
  );
}

export interface StudentRepoBlameChunk {
  sha: string;
  message: string | null;
  author_name: string | null;
  author_login: string | null;
  authored_at: string | null;
  web_url: string | null;
  start_line: number;
  end_line: number;
  line_count: number;
}

export interface StudentRepoBlameResponse {
  path: string;
  branch: string;
  chunks: StudentRepoBlameChunk[];
}

export function getStudentRepoFileBlame(
  repoId: string,
  path: string,
  branch?: string,
): Promise<StudentRepoBlameResponse> {
  return apiRequest<StudentRepoBlameResponse>(
    `/students/me/repositories/${repoId}/blame/file${repoQuery({
      path,
      branch,
    })}`,
  );
}

export interface StudentRepoCompareFile {
  filename: string;
  previous_filename?: string | null;
  status: string | null;
  additions: number;
  deletions: number;
  changes: number;
  is_binary?: boolean;
  too_large?: boolean;
  truncated?: boolean;
}

export interface StudentRepoCompareResponse {
  base: string;
  head: string;
  status: string | null;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files: StudentRepoCompareFile[];
}

export function compareStudentRepoRefs(
  repoId: string,
  base: string,
  head: string,
): Promise<StudentRepoCompareResponse> {
  return apiRequest<StudentRepoCompareResponse>(
    `/students/me/repositories/${repoId}/compare${repoQuery({ base, head })}`,
  );
}

export interface StudentRepoWikiPage {
  title: string;
  slug: string;
  subtitle: string | null;
}

export function getStudentRepoWikiPages(repoId: string): Promise<{ pages: StudentRepoWikiPage[]; enabled: boolean }> {
  return apiRequest<{ pages: StudentRepoWikiPage[]; enabled: boolean }>(
    `/students/me/repositories/${repoId}/wiki/pages`,
  );
}

export function getStudentRepoWikiContent(
  repoId: string,
  name: string,
): Promise<{ title: string; slug: string; content: string }> {
  return apiRequest<{ title: string; slug: string; content: string }>(
    `/students/me/repositories/${repoId}/wiki/page${repoQuery({ name })}`,
  );
}
