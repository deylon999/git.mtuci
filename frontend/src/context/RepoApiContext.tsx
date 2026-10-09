import { createContext, useContext } from "react";
import * as student from "../api/studentDashboardApi";
import * as teacher from "../api/teacherRepositoriesApi";

export interface RepoApi {
  mode: "student" | "teacher";
  getSummary: typeof student.getStudentRepoSummary;
  getBranches: typeof student.getStudentRepoBranches;
  getCommits: typeof student.getStudentRepoCommits;
  getFiles: typeof student.getStudentRepoFiles;
  getFileContent: typeof student.getStudentRepoFileContent;
  getFileHistory?: typeof student.getStudentRepoFileHistory;
  getFileBlame?: typeof student.getStudentRepoFileBlame;
  searchFiles: typeof student.searchStudentRepoFiles;
  getIssues: typeof student.getStudentRepoIssues;
  getPulls: typeof student.getStudentRepoPulls;
  getWikiPages: typeof student.getStudentRepoWikiPages;
  getWikiContent: typeof student.getStudentRepoWikiContent;
  getCommitDiff: typeof student.getStudentRepoCommitDiff;
  compareRefs?: typeof student.compareStudentRepoRefs;
  getUnmergedBranches: typeof student.getStudentRepoUnmergedBranches;
  getPullDetail?: typeof student.getStudentRepoPullDetail;
  getPullCheckLog?: typeof student.getStudentRepoPullCheckLog;
  retryPullCheck?: typeof student.retryStudentRepoPullCheck;
  // write-actions (student only)
  createPull?: typeof student.createStudentRepoPull;
  createPullReview?: typeof student.createStudentRepoPullReview;
  createPullComment?: typeof student.createStudentRepoPullComment;
  mergePull?: typeof student.mergeStudentRepoPull;
  createIssue?: typeof student.createStudentRepoIssue;
  patchIssue?: typeof student.patchStudentRepoIssue;
  reactIssue?: typeof student.reactStudentRepoIssue;
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

