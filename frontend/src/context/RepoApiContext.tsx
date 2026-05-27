import { createContext, useContext } from "react";
import * as student from "../api/studentDashboardApi";
import * as teacher from "../api/teacherRepositoriesApi";

export interface RepoApi {
  mode: "student" | "teacher";
  getSummary: (repoId: string, branch?: string) => Promise<any>;
  getBranches: (repoId: string) => Promise<any>;
  getCommits: (repoId: string, branch?: string, page?: number, limit?: number) => Promise<any>;
  getFiles: (repoId: string, path?: string, branch?: string) => Promise<any>;
  getFileContent: (repoId: string, filepath: string, branch?: string) => Promise<any>;
  searchFiles: (repoId: string, q: string, branch?: string) => Promise<any>;
  getIssues: (repoId: string, state?: string, page?: number) => Promise<any>;
  getPulls: (repoId: string, state?: string, page?: number) => Promise<any>;
  getWikiPages: (repoId: string) => Promise<any>;
  getWikiContent: (repoId: string, name: string) => Promise<any>;
  getCommitDiff: (repoId: string, sha: string) => Promise<any>;
  getUnmergedBranches: (repoId: string, base?: string, limit?: number) => Promise<any>;
  // write-actions (student only)
  createPull?: typeof student.createStudentRepoPull;
  createBranch?: typeof student.createStudentRepoBranch;
  deleteBranch?: typeof student.deleteStudentRepoBranch;
  getCloneInfo?: typeof student.getStudentRepoCloneInfo;
  createFile?: typeof student.createStudentRepoFile;
}

export const studentRepoApi: RepoApi = {
  mode: "student",
  getSummary: student.getStudentRepoSummary,
  getBranches: student.getStudentRepoBranches,
  getCommits: student.getStudentRepoCommits,
  getFiles: student.getStudentRepoFiles,
  getFileContent: student.getStudentRepoFileContent,
  searchFiles: student.searchStudentRepoFiles,
  getIssues: student.getStudentRepoIssues,
  getPulls: student.getStudentRepoPulls,
  getWikiPages: student.getStudentRepoWikiPages,
  getWikiContent: student.getStudentRepoWikiContent,
  getCommitDiff: student.getStudentRepoCommitDiff,
  getUnmergedBranches: student.getStudentRepoUnmergedBranches,
  createPull: student.createStudentRepoPull,
  createBranch: student.createStudentRepoBranch,
  deleteBranch: student.deleteStudentRepoBranch,
  getCloneInfo: student.getStudentRepoCloneInfo,
  createFile: student.createStudentRepoFile,
};

export const teacherRepoApi: RepoApi = {
  mode: "teacher",
  getSummary: teacher.getTeacherRepoSummary,
  getBranches: teacher.getTeacherRepoBranches,
  getCommits: teacher.getTeacherRepoCommits,
  getFiles: teacher.getTeacherRepoFiles,
  getFileContent: teacher.getTeacherRepoFileContent,
  searchFiles: teacher.searchTeacherRepoFiles,
  getIssues: teacher.getTeacherRepoIssues,
  getPulls: teacher.getTeacherRepoPulls,
  getWikiPages: teacher.getTeacherRepoWikiPages,
  getWikiContent: teacher.getTeacherRepoWikiContent,
  getCommitDiff: teacher.getTeacherRepoCommitDiff,
  getUnmergedBranches: teacher.getTeacherRepoUnmergedBranches,
};

const RepoApiContext = createContext<RepoApi>(studentRepoApi);

export function RepoApiProvider({ value, children }: { value: RepoApi; children: React.ReactNode }) {
  return <RepoApiContext.Provider value={value}>{children}</RepoApiContext.Provider>;
}

export function useRepoApi() {
  return useContext(RepoApiContext);
}

