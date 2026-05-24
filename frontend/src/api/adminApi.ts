import { apiRequest } from "./client";
import type {
  AdminReviewQueueItem,
  AdminUserRead,
  UserRole,
  SystemMetrics,
  ServiceStatus,
  BackupInfo,
  TodayStats,
  HotRepoStat,
  TopUserStat,
  HourlyActivity,
  LogsResponse,
  LogsStats,
  LogsFilters,
  LogsPagination,
} from "./types";

export async function getAdminUsers(): Promise<AdminUserRead[]> {
  return apiRequest<AdminUserRead[]>("/admin/users");
}

export async function getAdminReviewQueue(limit = 5): Promise<AdminReviewQueueItem[]> {
  return apiRequest<AdminReviewQueueItem[]>(`/admin/review-queue?limit=${limit}`);
}

export async function exportUsersCSV(): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/admin/users/export`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  if (!res.ok) {
    throw new Error("Failed to export users");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export interface UserImportResponse {
  imported: number;
  errors: string[];
  total: number;
}

export async function importUsersCSV(file: File): Promise<UserImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<UserImportResponse>("/admin/users/import", {
    method: "POST",
    body: formData,
    headers: {},
  });
}

export async function patchAdminUser(
  userId: string,
  payload: { role: UserRole; is_blocked: boolean; is_pending?: boolean; group_name?: string | null; student_id?: string | null },
): Promise<AdminUserRead> {
  return apiRequest<AdminUserRead>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function approveUser(userId: string): Promise<AdminUserRead> {
  return apiRequest<AdminUserRead>(`/admin/users/${userId}/approve`, {
    method: "POST",
  });
}

export async function rejectUser(userId: string): Promise<void> {
  await apiRequest<void>(`/admin/users/${userId}/reject`, {
    method: "POST",
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await apiRequest<void>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function resetAdminUserPassword(
  userId: string,
): Promise<{ new_password: string }> {
  return apiRequest<{ new_password: string }>(
    `/admin/users/${userId}/reset-password`,
    { method: "POST" },
  );
}

export interface UserStats {
  total: number;
  active: number;
  pending: number;
  blocked: number;
}

export async function getUserStats(): Promise<UserStats> {
  const users = await getAdminUsers();
  return {
    total: users.length,
    active: users.filter((u) => !u.is_blocked).length,
    pending: users.filter((u) => u.is_pending).length,
    blocked: users.filter((u) => u.is_blocked).length,
  };
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  return apiRequest<SystemMetrics>("/admin/system-metrics");
}

export async function getServiceStatus(): Promise<ServiceStatus> {
  return apiRequest<ServiceStatus>("/admin/service-status");
}

export async function getBackups(): Promise<BackupInfo> {
  return apiRequest<BackupInfo>("/admin/backups");
}

export async function createBackup(): Promise<{ success: boolean; file: string; message: string }> {
  return apiRequest<{ success: boolean; file: string; message: string }>("/admin/backups/create", { method: "POST" });
}

export async function restartAPI(): Promise<{ status?: string; message?: string }> {
  return apiRequest<{ status?: string; message?: string }>("/admin/restart", { method: "POST" });
}

export interface FacultyCommitsStat {
  faculty: string;
  short_name: string;
  commits: number;
  color: string;
}

export async function getCommitsByFaculty(): Promise<FacultyCommitsStat[]> {
  return apiRequest<FacultyCommitsStat[]>("/stats/commits-by-faculty");
}

export interface AdminRepository {
  id: string;
  name: string;
  description: string | null;
  gitea_repo_name: string | null;
  clone_url: string | null;
  gitea_web_url: string | null;
  gitea_owner: string | null;
  gitea_available?: boolean;
  owner_id: string | null;
  owner_full_name: string | null;
  commits_count: number;
  is_public: boolean;
  repo_type: "public" | "private" | "course";
  language: string | null;
  is_blocked: boolean;
  faculty_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminRepositoriesQuery {
  skip?: number;
  limit?: number;
  repo_type?: "public" | "private" | "course";
  language?: string;
  is_blocked?: boolean;
}

export interface AdminForkEvent {
  id: string;
  event_type: "fork" | "repo_created";
  user_id: string;
  user_full_name: string;
  user_login: string | null;
  source_repo: string | null;
  target_repo: string | null;
  message: string | null;
  created_at: string;
}

export interface AdminForkStats {
  total: number;
  forks_count: number;
  created_count: number;
  today_count: number;
  unique_users: number;
}

export interface AdminForkEventsResponse {
  stats: AdminForkStats;
  events: AdminForkEvent[];
}

export interface AdminCourseSummary {
  id: string;
  title: string;
  teacher_name: string;
  students_count: number;
  assignments_count: number;
}

export interface AdminReportsOverview {
  total_users: number;
  pending_users: number;
  total_students: number;
  total_teachers: number;
  total_courses: number;
  total_repositories: number;
  submissions_pending_grade: number;
  activity_today: number;
  courses: AdminCourseSummary[];
}

export async function getAdminReportsOverview(): Promise<AdminReportsOverview> {
  return apiRequest<AdminReportsOverview>("/admin/reports/overview");
}

export async function getAdminCoursesSummary(limit = 50): Promise<AdminCourseSummary[]> {
  return apiRequest<AdminCourseSummary[]>(`/admin/courses?limit=${limit}`);
}

export async function getAdminForks(params?: {
  limit?: number;
  offset?: number;
  event_type?: "fork" | "repo_created";
}): Promise<AdminForkEventsResponse> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.offset != null) search.set("offset", String(params.offset));
  if (params?.event_type) search.set("event_type", params.event_type);
  const qs = search.toString();
  return apiRequest<AdminForkEventsResponse>(`/admin/forks${qs ? `?${qs}` : ""}`);
}

export async function getAdminRepositories(
  query: AdminRepositoriesQuery = {},
): Promise<AdminRepository[]> {
  const params = new URLSearchParams();
  if (query.skip != null) params.set("skip", String(query.skip));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.repo_type) params.set("repo_type", query.repo_type);
  if (query.language) params.set("language", query.language);
  if (query.is_blocked != null) params.set("is_blocked", String(query.is_blocked));
  const qs = params.toString();
  return apiRequest<AdminRepository[]>(`/admin/repositories${qs ? `?${qs}` : ""}`);
}

export async function deleteAdminRepository(repositoryId: string): Promise<void> {
  await apiRequest<void>(`/admin/repositories/${repositoryId}`, { method: "DELETE" });
}

export async function toggleAdminRepositoryBlock(repositoryId: string): Promise<AdminRepository> {
  return apiRequest<AdminRepository>(`/admin/repositories/${repositoryId}/toggle-block`, {
    method: "POST",
  });
}

export interface MyCommitsResponse {
  commits: number;
  repositories: number;
}

export async function getMyCommits(): Promise<MyCommitsResponse> {
  return apiRequest<MyCommitsResponse>("/stats/my-commits");
}

export interface TotalUsersResponse {
  total_users: number;
}

export async function getTotalUsers(): Promise<TotalUsersResponse> {
  return apiRequest<TotalUsersResponse>("/stats/total-users");
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

export async function getActiveRepositories(limit: number = 5): Promise<ActiveRepositoryStat[]> {
  return apiRequest<ActiveRepositoryStat[]>(`/stats/active-repositories?limit=${limit}`);
}

export async function getGroups(): Promise<string[]> {
  return apiRequest<string[]>("/groups");
}

export async function getTodayStats(): Promise<TodayStats> {
  return apiRequest<TodayStats>("/stats/today");
}

export async function getHotRepos(): Promise<HotRepoStat[]> {
  return apiRequest<HotRepoStat[]>("/stats/hot-repos");
}

export async function getTopUsers(): Promise<TopUserStat[]> {
  return apiRequest<TopUserStat[]>("/stats/top-users");
}

export async function getHourlyActivity(): Promise<HourlyActivity[]> {
  return apiRequest<HourlyActivity[]>("/stats/hourly-activity");
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

export interface RecentActivityResponse {
  activities: ActivityItem[];
  count: number;
  total: number;
}

export interface ActivityFilters {
  search?: string;
  activityType?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getRecentActivity(
  limit: number = 50,
  offset: number = 0,
  filters?: ActivityFilters
): Promise<RecentActivityResponse> {
  const params = new URLSearchParams();
  params.append("limit", String(limit));
  params.append("offset", String(offset));

  if (filters?.search) params.append("search", filters.search);
  if (filters?.activityType) params.append("activity_type", filters.activityType);
  if (filters?.userId) params.append("user_id", filters.userId);
  if (filters?.dateFrom && filters.dateFrom !== "undefined") params.append("date_from", filters.dateFrom);
  if (filters?.dateTo && filters.dateTo !== "undefined") params.append("date_to", filters.dateTo);

  return apiRequest<RecentActivityResponse>(`/activity/recent?${params.toString()}`);
}

// Logs API functions
export async function getLogs(
  filters?: LogsFilters,
  pagination?: LogsPagination
): Promise<LogsResponse> {
  const params = new URLSearchParams();

  if (filters?.level) params.append("level", filters.level);
  if (filters?.source) params.append("source", filters.source);
  if (filters?.search) params.append("search", filters.search);
  if (filters?.date_from) params.append("date_from", filters.date_from);
  if (filters?.date_to) params.append("date_to", filters.date_to);
  if (filters?.sort) params.append("sort", filters.sort);

  if (pagination) {
    params.append("limit", String(pagination.limit));
    params.append("offset", String(pagination.offset));
  }

  return apiRequest<LogsResponse>(`/admin/logs?${params.toString()}`);
}

export async function getLogsStats(): Promise<LogsStats> {
  return apiRequest<LogsStats>("/admin/logs/stats");
}

export async function exportLogs(
  filters?: LogsFilters
): Promise<Blob> {
  const params = new URLSearchParams();

  if (filters?.level) params.append("level", filters.level);
  if (filters?.source) params.append("source", filters.source);
  if (filters?.search) params.append("search", filters.search);
  if (filters?.date_from) params.append("date_from", filters.date_from);
  if (filters?.date_to) params.append("date_to", filters.date_to);
  if (filters?.sort) params.append("sort", filters.sort);

  const token = localStorage.getItem("token");
  const res = await fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/admin/logs/export?${params.toString()}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  return res.blob();
}

export async function deleteOldLogs(days: number = 30): Promise<{ deleted_count: number }> {
  return apiRequest<{ deleted_count: number }>(`/admin/logs/old?days=${days}`, {
    method: "DELETE",
  });
}
