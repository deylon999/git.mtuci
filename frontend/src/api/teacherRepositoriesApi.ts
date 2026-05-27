import { apiRequest } from "./client";

function repoQuery(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export interface TeacherRepoBranch {
  name: string;
  is_default: boolean;
}

export interface TeacherRepoBranches {
  default_branch: string;
  branches: TeacherRepoBranch[];
}

export interface TeacherRepoFile {
  sha: string;
  name: string;
  path: string;
  type: "file" | "dir";
  size: number | null;
  last_commit_message?: string | null;
  last_commit_at?: string | null;
}

export interface TeacherRepoFileContent {
  filepath: string;
  content: string;
}

export interface TeacherRepoRecentCommit {
  sha: string;
  message: string;
  author_name: string | null;
  committed_at: string | null;
}

export interface TeacherRepoCommitsResponse {
  commits: TeacherRepoRecentCommit[];
  page: number;
  has_more: boolean;
}

export interface TeacherRepoSummary {
  description: string | null;
  language: string | null;
  is_blocked: boolean;
  default_branch: string;
  commits_count: number | null;
  commits_count_approx: boolean;
  branches_count: number;
  tags_count: number;
  forks_count: number | null;
  stars_count: number | null;
  open_pr_count: number | null;
  open_issues_count: number | null;
  watchers_count: number | null;
  size_kb: number | null;
  created_at: string | null;
  updated_at: string | null;
  has_readme: boolean;
  readme_path: string | null;
  license_name: string | null;
  license_path: string | null;
  recent_commits: TeacherRepoRecentCommit[];
  gitea_links: any | null;
}

export interface TeacherRepoIssue {
  number: number;
  title: string;
  state: string;
  author_name: string | null;
  labels: string[];
  comments_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TeacherRepoIssuesResponse {
  issues: TeacherRepoIssue[];
  page: number;
  has_more: boolean;
}

export interface TeacherRepoPull {
  number: number;
  title: string;
  state: string;
  author_name: string | null;
  head_branch: string | null;
  base_branch: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged?: boolean | null;
  commits_count?: number | null;
}

export interface TeacherRepoPullsResponse {
  pulls: TeacherRepoPull[];
  page: number;
  has_more: boolean;
}

export interface TeacherRepoWikiPage {
  title: string;
  slug: string;
  subtitle: string | null;
}

export function getTeacherRepoSummary(repoId: string, branch?: string): Promise<TeacherRepoSummary> {
  return apiRequest<TeacherRepoSummary>(`/teacher/repositories/${repoId}/summary${repoQuery({ branch })}`);
}

export function getTeacherRepoBranches(repoId: string): Promise<TeacherRepoBranches> {
  return apiRequest<TeacherRepoBranches>(`/teacher/repositories/${repoId}/branches`);
}

export function getTeacherRepoCommits(repoId: string, branch?: string, page = 1, limit = 30): Promise<TeacherRepoCommitsResponse> {
  return apiRequest<TeacherRepoCommitsResponse>(
    `/teacher/repositories/${repoId}/commits${repoQuery({ branch, page: String(page), limit: String(limit) })}`,
  );
}

export function getTeacherRepoFiles(repoId: string, path = "", branch?: string): Promise<TeacherRepoFile[]> {
  return apiRequest<TeacherRepoFile[]>(
    `/teacher/repositories/${repoId}/files${repoQuery({ path: path || undefined, branch })}`,
  );
}

export function getTeacherRepoFileContent(repoId: string, filepath: string, branch?: string): Promise<TeacherRepoFileContent> {
  const encoded = filepath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return apiRequest<TeacherRepoFileContent>(
    `/teacher/repositories/${repoId}/files/${encoded}${repoQuery({ branch })}`,
  );
}

export function searchTeacherRepoFiles(repoId: string, q: string, branch?: string): Promise<{ path: string }[]> {
  return apiRequest<{ path: string }[]>(
    `/teacher/repositories/${repoId}/files/search${repoQuery({ q, branch })}`,
  );
}

export function getTeacherRepoIssues(repoId: string, state = "open", page = 1): Promise<TeacherRepoIssuesResponse> {
  return apiRequest<TeacherRepoIssuesResponse>(
    `/teacher/repositories/${repoId}/issues${repoQuery({ state, page: String(page) })}`,
  );
}

export function getTeacherRepoPulls(repoId: string, state = "open", page = 1): Promise<TeacherRepoPullsResponse> {
  return apiRequest<TeacherRepoPullsResponse>(
    `/teacher/repositories/${repoId}/pulls${repoQuery({ state, page: String(page) })}`,
  );
}

export function getTeacherRepoWikiPages(repoId: string): Promise<{ pages: TeacherRepoWikiPage[]; enabled: boolean }> {
  return apiRequest<{ pages: TeacherRepoWikiPage[]; enabled: boolean }>(
    `/teacher/repositories/${repoId}/wiki/pages`,
  );
}

export function getTeacherRepoWikiContent(repoId: string, name: string): Promise<{ title: string; slug: string; content: string }> {
  return apiRequest<{ title: string; slug: string; content: string }>(
    `/teacher/repositories/${repoId}/wiki/page${repoQuery({ name })}`,
  );
}

export function getTeacherRepoCommitDiff(repoId: string, sha: string): Promise<{ sha: string; diff: string }> {
  return apiRequest<{ sha: string; diff: string }>(
    `/teacher/repositories/${repoId}/commits/${encodeURIComponent(sha)}/diff`,
  );
}

export function getTeacherRepoUnmergedBranches(repoId: string, base?: string, limit = 50): Promise<string[]> {
  return apiRequest<string[]>(
    `/teacher/repositories/${repoId}/unmerged-branches${repoQuery({ base, limit: String(limit) })}`,
  );
}

