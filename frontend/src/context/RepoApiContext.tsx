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
  getFileHistory?: (repoId: string, path: string, branch?: string, page?: number, limit?: number) => Promise<any>;
  getFileBlame?: (repoId: string, path: string, branch?: string) => Promise<any>;
  searchFiles: (repoId: string, q: string, branch?: string) => Promise<any>;
  getIssues: (repoId: string, state?: string, page?: number, q?: string) => Promise<any>;
  getPulls: (repoId: string, state?: string, page?: number) => Promise<any>;
  getWikiPages: (repoId: string) => Promise<any>;
  getWikiContent: (repoId: string, name: string) => Promise<any>;
  getCommitDiff: (repoId: string, sha: string) => Promise<any>;
  compareRefs?: (repoId: string, base: string, head: string) => Promise<any>;
  getUnmergedBranches: (repoId: string, base?: string, limit?: number) => Promise<any>;
  getPullDetail?: (repoId: string, pullNumber: number) => Promise<any>;
  getPullCheckLog?: (repoId: string, pullNumber: number, checkId: string) => Promise<any>;
  retryPullCheck?: (repoId: string, pullNumber: number, checkId: string) => Promise<any>;
  // write-actions (student only)
  createPull?: typeof student.createStudentRepoPull;
  createPullReview?: (repoId: string, pullNumber: number, body: any) => Promise<any>;
  createPullComment?: (repoId: string, pullNumber: number, body: { body: string }) => Promise<any>;
  mergePull?: (repoId: string, pullNumber: number, body: any) => Promise<any>;
  createIssue?: (repoId: string, body: any) => Promise<any>;
  patchIssue?: (repoId: string, issueNumber: number, body: any) => Promise<any>;
  reactIssue?: (repoId: string, issueNumber: number, content: any) => Promise<any>;
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
  getFileHistory: student.getStudentRepoFileHistory,
  getFileBlame: student.getStudentRepoFileBlame,
  searchFiles: student.searchStudentRepoFiles,
  getIssues: student.getStudentRepoIssues,
  getPulls: student.getStudentRepoPulls,
  getWikiPages: student.getStudentRepoWikiPages,
  getWikiContent: student.getStudentRepoWikiContent,
  getCommitDiff: student.getStudentRepoCommitDiff,
  compareRefs: student.compareStudentRepoRefs,
  getUnmergedBranches: student.getStudentRepoUnmergedBranches,
  getPullDetail: student.getStudentRepoPullDetail,
  getPullCheckLog: student.getStudentRepoPullCheckLog,
  retryPullCheck: student.retryStudentRepoPullCheck,
  createPull: student.createStudentRepoPull,
  createPullReview: student.createStudentRepoPullReview,
  createPullComment: student.createStudentRepoPullComment,
  mergePull: student.mergeStudentRepoPull,
  createIssue: student.createStudentRepoIssue,
  patchIssue: student.patchStudentRepoIssue,
  reactIssue: student.reactStudentRepoIssue,
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
  getFileHistory: teacher.getTeacherRepoFileHistory,
  getFileBlame: teacher.getTeacherRepoFileBlame,
  searchFiles: teacher.searchTeacherRepoFiles,
  getIssues: teacher.getTeacherRepoIssues,
  getPulls: teacher.getTeacherRepoPulls,
  getWikiPages: teacher.getTeacherRepoWikiPages,
  getWikiContent: teacher.getTeacherRepoWikiContent,
  getCommitDiff: teacher.getTeacherRepoCommitDiff,
  compareRefs: teacher.compareTeacherRepoRefs,
  getUnmergedBranches: teacher.getTeacherRepoUnmergedBranches,
  getPullDetail: teacher.getTeacherRepoPullDetail,
  getPullCheckLog: teacher.getTeacherRepoPullCheckLog,
  retryPullCheck: teacher.retryTeacherRepoPullCheck,
  createPullReview: teacher.createTeacherRepoPullReview,
  createPullComment: teacher.createTeacherRepoPullComment,
  mergePull: teacher.mergeTeacherRepoPull,
  createIssue: teacher.createTeacherRepoIssue,
  patchIssue: teacher.patchTeacherRepoIssue,
  reactIssue: teacher.reactTeacherRepoIssue,
};

const RepoApiContext = createContext<RepoApi>(studentRepoApi);

export function RepoApiProvider({ value, children }: { value: RepoApi; children: React.ReactNode }) {
  return <RepoApiContext.Provider value={value}>{children}</RepoApiContext.Provider>;
}

export function useRepoApi() {
  return useContext(RepoApiContext);
}

