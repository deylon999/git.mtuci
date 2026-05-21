import {
  getStudentAssignments,
  getStudentMergedCourses,
  type StudentAssignmentListItem,
  type StudentMergedCoursesResponse,
} from "./studentDashboardApi";

/** In-flight dedup: parallel callers share one HTTP request (React StrictMode, multiple hooks). */
let assignmentsInflight: Promise<StudentAssignmentListItem[]> | null = null;

export function getStudentAssignmentsDeduped(limit = 200): Promise<StudentAssignmentListItem[]> {
  if (!assignmentsInflight) {
    assignmentsInflight = getStudentAssignments(limit).finally(() => {
      assignmentsInflight = null;
    });
  }
  return assignmentsInflight;
}

let mergedInflight: Promise<StudentMergedCoursesResponse> | null = null;
let mergedMemCache: { savedAt: number; data: StudentMergedCoursesResponse } | null = null;
const MERGED_MEM_TTL_MS = 30_000;

export function getStudentMergedCoursesDeduped(refresh = false): Promise<StudentMergedCoursesResponse> {
  if (!refresh && mergedMemCache && Date.now() - mergedMemCache.savedAt < MERGED_MEM_TTL_MS) {
    return Promise.resolve(mergedMemCache.data);
  }
  if (!refresh && mergedInflight) {
    return mergedInflight;
  }
  mergedInflight = getStudentMergedCourses(refresh)
    .then((data) => {
      mergedMemCache = { savedAt: Date.now(), data };
      return data;
    })
    .finally(() => {
      mergedInflight = null;
    });
  return mergedInflight;
}

export function invalidateStudentMergedCoursesMemCache(): void {
  mergedMemCache = null;
}
