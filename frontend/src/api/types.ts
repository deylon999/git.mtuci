export type UserRole = "student" | "teacher" | "admin" | "laborant";

export type TokenType = "bearer";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  href?: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: TokenType | string;
}

export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  mtuci_login?: string | null;
  role: UserRole;
  group_name: string | null;
  student_id: string | null;
  is_blocked: boolean;
  avatar_url: string | null;
  avatar_display_mode: "cover" | "contain" | "fill" | "scale-down";
  allow_assistant_grading: boolean;
  can_switch_student_mode?: boolean;
  created_at: string;
  last_login: string | null;
}

export interface AdminUserRead {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  group_name: string | null;
  student_id: string | null;
  is_blocked: boolean;
  is_pending?: boolean;
  avatar_url: string | null;
  created_at: string;
  last_login: string | null;
  repositories_count?: number;
}

export interface AdminReviewQueueItem {
  repo_label: string;
  pending_count: number;
  urgency: "urgent" | "today" | "normal";
}

export interface TableSizeEntry {
  name: string;
  size: string;
  size_mb: number;
}

export interface SystemMetrics {
  cpu_percent: number | null;
  cpu_model: string | null;
  memory_percent: number | null;
  memory_used_gb: number | null;
  memory_total_gb: number | null;
  disk_percent: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  network_upload_mbps: number | null;
  network_download_mbps: number | null;
  load_avg: number[] | null;
  requests_total_hour: number | null;
  requests_errors_hour: number | null;
  avg_response_ms: number | null;
  p95_response_ms: number | null;
  error_rate: number | null;
  rps: number | null;
  database: DatabaseMetrics | null;
}

export interface DatabaseMetrics {
  connections_active: number | null;
  connections_max: number | null;
  size_mb: number | null;
  tables_count: number | null;
  queries_per_sec: number | null;
  avg_query_ms: number | null;
  cache_hit_rate: number | null;
  deadlocks: number | null;
  last_migration: string | null;
  top_tables: TableSizeEntry[] | null;
}

export interface MonitoredService {
  id: string;
  name: string;
  port: string;
  online: boolean;
  uptime: string | null;
  detail: string | null;
}

export interface ServiceStatus {
  git: boolean;
  db: boolean;
  api: boolean;
  frontend: boolean;
  websocket: boolean;
  git_uptime: string | null;
  git_version: string | null;
  db_uptime: string | null;
  db_version: string | null;
  api_uptime: string | null;
  api_version: string | null;
  git_repos_count: number | null;
  websocket_connections: number | null;
  frontend_url: string | null;
  services: MonitoredService[];
}

export interface BackupInfo {
  last_backup: string | null;
  next_backup: string | null;
}

export interface FacultyCommitsStat {
  faculty: string;
  short_name: string;
  commits: number;
  color: string;
}

export interface ActiveRepositoryStat {
  id: string;
  name: string;
  author: string;
  commits: number;
  is_public: boolean;
  initials: string;
  color: string;
}

export interface TodayStats {
  total_events: number;
  total_events_delta: number;
  commits: number;
  commits_delta: number;
  active_users: number;
  active_users_delta: number;
  new_repositories: number;
  new_repositories_delta: number;
}

export interface HotRepoStat {
  name: string;
  url: string;
  events: number;
  language: string | null;
}

export interface TopUserStat {
  user_id: string;
  user_name: string;
  name: string;
  initials: string;
  color: string;
  count: number;
  percent: number;
}

export interface HourlyActivity {
  hour: number;
  count: number;
  is_current: boolean;
}

export interface ActivityItem {
  id: string;
  type: string;
  user: string;
  initials: string;
  color: string;
  repo: string;
  message: string;
  time: string;
  tag: string;
  timestamp: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  grade_max: number;
  target_groups: string[] | null;
  teacher_id: string;
  created_at: string;
  enrolled_count?: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  start_date: string;
  deadline: string;
  late_penalty_periods: { weeks: number; max_grade: number }[];
  gitea_repo_name: string | null;
  created_at: string;
}

export interface CommitAuthor {
  name: string;
  email: string | null;
}

export interface Commit {
  sha: string;
  message: string;
  author: CommitAuthor;
  date: string;
}

export type RepoFileType = "file" | "dir";

export interface RepoFile {
  sha: string;
  name: string;
  type: RepoFileType;
  size: number | null;
}

export type SubmissionStatus = "submitted" | "not_submitted";

export interface SubmissionStatusRead {
  student_id: string;
  student_full_name: string;
  status: SubmissionStatus;
  last_commit_at: string | null;
  grade: number | null;
  final_grade: number | null;
  penalty_points: number;
  weeks_late: number;
  late_max_grade: number | null;
  comment: string | null;
  submitted_at: string | null;
  graded_at: string | null;
}

export interface MyGradeRead {
  grade: number | null;
  final_grade: number | null;
  penalty_points: number;
  weeks_late: number;
  late_max_grade: number | null;
  comment: string | null;
  graded_at: string | null;
  grade_max: number;
}

export type PlagiarismVerdict = "high" | "medium" | "low";

export interface PlagiarismStudent {
  id: string;
  full_name: string;
  email: string;
}

export interface PlagiarismPair {
  student1: PlagiarismStudent;
  student2: PlagiarismStudent;
  similarity: number;
  verdict: PlagiarismVerdict;
}

export interface PlagiarismCheckResult {
  pairs: PlagiarismPair[];
  checked_at: string;
}

export interface PlagiarismCompareResult {
  similarity: number;
  verdict: PlagiarismVerdict;
  common_features: string[];
  lines1: { line: string; status: "exact" | "similar" | "different" }[];
  lines2: { line: string; status: "exact" | "similar" | "different" }[];
}

export interface FileContent {
  filepath: string;
  content: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

// Logs types
export type LogLevel = "ERROR" | "WARNING" | "INFO" | "DEBUG";
export type LogSource = "auth" | "repositories" | "webhooks" | "admin" | "gitea" | "permissions" | "courses";

export interface LogEntry {
  id: string;
  created_at: string;
  level: LogLevel;
  source: LogSource;
  user_id: string | null;
  user_email: string | null;
  user_full_name: string | null;
  message: string;
  detail: string | null;
  ip_address: string;
  http_status: number | null;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
}

export interface LogsStats {
  total: number;
  errors_today: number;
  warnings_today: number;
  success_today: number;
}

export interface LogsFilters {
  level?: LogLevel;
  source?: LogSource;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort?: "desc" | "asc";
}

export interface LogsPagination {
  limit: number;
  offset: number;
}
