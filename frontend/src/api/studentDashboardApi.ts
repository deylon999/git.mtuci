import { apiRequest } from "./client";

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
  title: string;
  teacher_name: string;
  assignments_count: number;
  score: number | null;
  score_max: number;
  score_color: "success" | "warning" | "danger" | "muted";
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
  type: "success" | "commit" | "comment" | "deadline" | "notification";
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
  status: StudentAssignmentStatus;
  graded_at: string | null;
  submitted_at: string | null;
}

export interface StudentGradesSummary {
  overall_average: number | null;
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
  event_type: "fork" | "repo_created";
  source_repo: string;
  target_repo: string | null;
  created_at: string;
}

export function getStudentForks(limit = 100): Promise<StudentForkItem[]> {
  return apiRequest<StudentForkItem[]>(`/students/me/forks?limit=${limit}`);
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
  updated_at: string;
}

export interface StudentRepositoriesResponse {
  gitea_web_base: string;
  stats: StudentRepositoriesStats;
  repositories: StudentRepositoryItem[];
}

export function getStudentRepositories(): Promise<StudentRepositoriesResponse> {
  return apiRequest<StudentRepositoriesResponse>("/students/me/repositories");
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
  state: string;
  author_name: string | null;
  labels: string[];
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
): Promise<StudentRepoIssuesResponse> {
  return apiRequest<StudentRepoIssuesResponse>(
    `/students/me/repositories/${repoId}/issues${repoQuery({ state, page: String(page) })}`,
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
