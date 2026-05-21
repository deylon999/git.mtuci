import { hydrateStudentAppShell } from "./studentAppBootstrap";
import {
  getStudentAssignments,
  getStudentDashboardBundle,
  getStudentGrades,
  getStudentGroupRanking,
  getStudentMergedCourses,
  getStudentProfileBundle,
  type StudentAssignmentListItem,
  type StudentDashboardBundle,
  type StudentSidebarCounts,
  type StudentGradesSummary,
  type StudentGroupRanking,
  type StudentMergedCoursesResponse,
  type StudentProfileBundle,
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

let profileBundleInflight: Promise<StudentProfileBundle> | null = null;
let profileBundleMem: { savedAt: number; data: StudentProfileBundle } | null = null;
const PROFILE_BUNDLE_TTL_MS = 60_000;

export function invalidateStudentProfileBundleDedup(): void {
  profileBundleMem = null;
  profileBundleInflight = null;
}

export function getStudentProfileBundleDeduped(feedLimit = 8): Promise<StudentProfileBundle> {
  const now = Date.now();
  if (profileBundleMem && now - profileBundleMem.savedAt < PROFILE_BUNDLE_TTL_MS) {
    return Promise.resolve(profileBundleMem.data);
  }
  if (!profileBundleInflight) {
    profileBundleInflight = getStudentProfileBundle(feedLimit)
      .then((data) => {
        hydrateStudentAppShell(data);
        profileBundleMem = { savedAt: Date.now(), data };
        return data;
      })
      .finally(() => {
        profileBundleInflight = null;
      });
  }
  return profileBundleInflight;
}

let dashboardBundleInflight: Promise<StudentDashboardBundle> | null = null;
let dashboardBundleMem: { savedAt: number; data: StudentDashboardBundle } | null = null;
const DASHBOARD_BUNDLE_TTL_MS = 60_000;

export function invalidateStudentDashboardBundleCache(): void {
  dashboardBundleMem = null;
  dashboardBundleInflight = null;
}

export function getCachedDashboardSidebarCounts(): StudentSidebarCounts | null {
  return dashboardBundleMem?.data.stats.sidebar ?? null;
}

export function getStudentDashboardBundleDeduped(
  recentLimit = 5,
  feedLimit = 12,
): Promise<StudentDashboardBundle> {
  const now = Date.now();
  if (dashboardBundleMem && now - dashboardBundleMem.savedAt < DASHBOARD_BUNDLE_TTL_MS) {
    return Promise.resolve(dashboardBundleMem.data);
  }
  if (dashboardBundleInflight) {
    return dashboardBundleInflight;
  }
  dashboardBundleInflight = getStudentDashboardBundle(recentLimit, feedLimit)
    .then((data) => {
      hydrateStudentAppShell(data);
      dashboardBundleMem = { savedAt: Date.now(), data };
      return data;
    })
    .finally(() => {
      dashboardBundleInflight = null;
    });
  return dashboardBundleInflight;
}

let gradesInflight: Promise<StudentGradesSummary> | null = null;

export function getStudentGradesDeduped(limit = 200): Promise<StudentGradesSummary> {
  if (!gradesInflight) {
    gradesInflight = getStudentGrades(limit).finally(() => {
      gradesInflight = null;
    });
  }
  return gradesInflight;
}

let groupRankingInflight: Promise<StudentGroupRanking> | null = null;

export function getStudentGroupRankingDeduped(): Promise<StudentGroupRanking> {
  if (!groupRankingInflight) {
    groupRankingInflight = getStudentGroupRanking().finally(() => {
      groupRankingInflight = null;
    });
  }
  return groupRankingInflight;
}
