import type { StudentRepoSummary } from "../api/studentDashboardApi";
import type { StudentRepoMeta } from "../hooks/useStudentRepoWorkspace";

export interface CachedRepoWorkspace {
  meta: StudentRepoMeta;
  summary: StudentRepoSummary | null;
}

const cache = new Map<string, CachedRepoWorkspace>();

export function getCachedRepoWorkspace(repoId: string): CachedRepoWorkspace | undefined {
  return cache.get(repoId);
}

export function setCachedRepoWorkspace(repoId: string, data: CachedRepoWorkspace): void {
  cache.set(repoId, data);
}
