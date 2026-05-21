import type { StudentMergedCoursesResponse } from "../api/studentDashboardApi";

const STORAGE_KEY = "mtuci:student-merged-courses:v1";
const TTL_MS = 60 * 60 * 1000;

interface CacheEnvelope {
  savedAt: number;
  data: StudentMergedCoursesResponse;
}

export function readLkCoursesCache(): StudentMergedCoursesResponse | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (!env?.data?.courses || Date.now() - env.savedAt > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

export function writeLkCoursesCache(data: StudentMergedCoursesResponse): void {
  try {
    const env: CacheEnvelope = { savedAt: Date.now(), data };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* quota / private mode */
  }
}

export function clearLkCoursesCache(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
