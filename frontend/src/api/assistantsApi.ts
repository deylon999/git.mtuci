import { apiRequest } from "./client";
import type { Course } from "./types";
import type { TeacherGradingQueueItem } from "./teacherDashboardApi";

export function getAssistantCourses(): Promise<Course[]> {
  return apiRequest<Course[]>("/assistants/me/courses");
}

export function getAssistantGradingQueue(limit = 100): Promise<TeacherGradingQueueItem[]> {
  return apiRequest<TeacherGradingQueueItem[]>(`/assistants/me/grading-queue?limit=${limit}`);
}
