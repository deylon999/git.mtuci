import { tr } from "../utils/i18nLabels";
import { apiRequest } from "./client";

export interface TeacherGradingQueueStats {
  pending: number;
  stale: number;
  graded_today: number;
  avg_waiting_hours: number | null;
}

export interface TeacherGradingQueueItem {
  submission_id: string;
  student_id: string;
  student_name: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_title: string;
  submitted_at: string;
  repo_name: string | null;
  waiting_hours: number;
  is_stale: boolean;
}

export interface TeacherDashboard {
  courses_count: number;
  students_total: number;
  assignments_total: number;
  pending_grading: number;
  submissions_this_week: number;
  overdue_assignments: number;
}

export interface TeacherDashboardFull {
  greeting_name: string;
  department: string | null;
  active_courses_count: number;
  students_total: number;
  pending_grading: number;
  commits_today: number;
  pending_work: TeacherGradingQueueItem[];
  recent_commits: {
    student_id: string | null;
    student_name: string;
    repo_name: string | null;
    message: string | null;
    created_at: string;
  }[];
  courses: {
    course_id: string;
    title: string;
    students_count: number;
    assignments_count: number;
    pending_count: number;
  }[];
  deadlines: {
    assignment_id: string;
    assignment_title: string;
    course_id: string;
    course_title: string;
    deadline: string;
    submitted_count: number;
    total_students: number;
  }[];
  activity_by_day: { date: string; commits: number }[];
}

export interface TeacherCourseListItem {
  course_id: string;
  title: string;
  description: string | null;
  students_count: number;
  assignments_count: number;
  pending_count: number;
  grade_max: number;
  target_groups: string[];
  nearest_deadline: string | null;
  nearest_deadline_title: string | null;
  submitted_percent: number | null;
}

export interface TeacherStudentListItem {
  student_id: string;
  full_name: string;
  email: string;
  group_name: string | null;
  courses: string[];
  course_ids: string[];
  repositories_count: number;
  commits_total: number;
  last_activity_at: string | null;
  average_grade: number | null;
  activity_status: "active" | "idle" | "inactive";
}

export interface TeacherStudentsSummary {
  students_total: number;
  active_this_week: number;
  average_grade: number | null;
  pending_grading: number;
  items: TeacherStudentListItem[];
}

export interface TeacherActivityItem {
  id: string;
  activity_type: string;
  student_name: string | null;
  repo_name: string | null;
  message: string | null;
  created_at: string;
}

export function getTeacherDashboard(): Promise<TeacherDashboard> {
  return apiRequest<TeacherDashboard>("/teachers/me/dashboard");
}

export function getTeacherDashboardFull(): Promise<TeacherDashboardFull> {
  return apiRequest<TeacherDashboardFull>("/teachers/me/dashboard/full");
}

export function getTeacherGradingQueue(
  limit = 100,
  courseId?: string,
): Promise<TeacherGradingQueueItem[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (courseId) q.set("course_id", courseId);
  return apiRequest<TeacherGradingQueueItem[]>(`/teachers/me/grading-queue?${q}`);
}

export function getTeacherGradingQueueStats(courseId?: string): Promise<TeacherGradingQueueStats> {
  const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
  return apiRequest<TeacherGradingQueueStats>(`/teachers/me/grading-queue/stats${q}`);
}

export function getTeacherCoursesList(): Promise<TeacherCourseListItem[]> {
  return apiRequest<TeacherCourseListItem[]>("/teachers/me/courses");
}

export function getTeacherStudents(limit = 500): Promise<TeacherStudentsSummary> {
  return apiRequest<TeacherStudentsSummary>(`/teachers/me/students?limit=${limit}`);
}

export function getTeacherActivity(limit = 80, courseId?: string): Promise<TeacherActivityItem[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (courseId) q.set("course_id", courseId);
  return apiRequest<TeacherActivityItem[]>(`/teachers/me/activity?${q}`);
}

export interface TeacherCourseStudentDetail {
  student_id: string;
  full_name: string;
  email: string;
  group_name: string | null;
  completed_assignments: number;
  total_assignments: number;
  average_grade: number | null;
  last_activity_at: string | null;
  activity_status: string;
}

export interface TeacherCourseDetail {
  course_id: string;
  title: string;
  description: string | null;
  grade_max: number;
  target_groups: string[];
  students_count: number;
  assignments_count: number;
  average_grade: number | null;
  completion_percent: number | null;
  pending_grading: number;
  activity_by_week: { week_label: string; commits: number }[];
  students: TeacherCourseStudentDetail[];
}

export interface TeacherTemplateRepo {
  repo_name: string;
  description: string | null;
  assignments_count: number;
  courses: string[];
  last_assignment_at: string | null;
}

export function getTeacherCourseDetail(courseId: string): Promise<TeacherCourseDetail> {
  return apiRequest<TeacherCourseDetail>(`/teachers/me/courses/${courseId}/detail`);
}

export function getTeacherTemplates(): Promise<TeacherTemplateRepo[]> {
  return apiRequest<TeacherTemplateRepo[]>("/teachers/me/templates");
}

export async function exportTeacherStudentsCsv(): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(
    `${import.meta.env.VITE_API_URL ?? "/api"}/teachers/me/students/export`,
    { headers: { Authorization: token ? `Bearer ${token}` : "" } },
  );
  if (!res.ok) throw new Error(tr("core.errors.exportStudentsFailed"));
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students.csv";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
