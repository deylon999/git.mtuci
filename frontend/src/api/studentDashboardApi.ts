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
