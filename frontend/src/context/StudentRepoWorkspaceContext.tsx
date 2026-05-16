import { createContext, useContext } from "react";
import type { StudentRepoSummary } from "../api/studentDashboardApi";
import type { StudentRepoMeta } from "../hooks/useStudentRepoWorkspace";
import type { RepoNavTabId } from "../components/repo/RepoNavTabs";

export interface StudentRepoWorkspaceContextValue {
  repoId: string;
  meta: StudentRepoMeta | null;
  summary: StudentRepoSummary | null;
  loading: boolean;
  error: string | null;
  activeTab: RepoNavTabId;
}

export const StudentRepoWorkspaceContext = createContext<StudentRepoWorkspaceContextValue | null>(null);

export function useStudentRepoWorkspaceContext() {
  const ctx = useContext(StudentRepoWorkspaceContext);
  if (!ctx) throw new Error("useStudentRepoWorkspaceContext outside layout");
  return ctx;
}
