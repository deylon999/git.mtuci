import { apiRequest } from "./client";

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
}

export interface TeacherDashboard {
  courses_count: number;
  students_total: number;
  assignments_total: number;
  pending_grading: number;
  submissions_this_week: number;
  overdue_assignments: number;
}

export function getTeacherDashboard(): Promise<TeacherDashboard> {
  return apiRequest<TeacherDashboard>("/teachers/me/dashboard");
}

export function getTeacherGradingQueue(limit = 100): Promise<TeacherGradingQueueItem[]> {
  return apiRequest<TeacherGradingQueueItem[]>(`/teachers/me/grading-queue?limit=${limit}`);
}
