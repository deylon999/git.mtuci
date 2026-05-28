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
  body?: string | null;
  state: string;
  author_name: string | null;
  labels: string[];
  assignees?: string[];
  milestone?: string | null;
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

export interface TeacherRepoPullFile {
  filename: string;
  status: string | null;
  additions: number;
  deletions: number;
  changes: number;
  previous_filename: string | null;
}

export interface TeacherRepoPullReviewComment {
  id: number;
  review_id: number | null;
  body: string;
  path: string | null;
  position: number | null;
  original_position: number | null;
  user_login: string | null;
  user_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TeacherRepoPullThread {
  path: string;
  position: number | null;
  original_position: number | null;
  comments: TeacherRepoPullReviewComment[];
}

export interface TeacherRepoPullReview {
  id: number;
  state: string | null;
  body: string | null;
  dismissed: boolean;
  comments_count: number;
  user_login: string | null;
  user_name: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

export interface TeacherRepoPullDiscussionComment {
  id: number;
  body: string;
  user_login: string | null;
  user_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TeacherRepoPullChecks {
  can_merge: boolean;
  mergeable: boolean | null;
  conflict_state: "clean" | "conflicting" | "unknown";
  blocked_reason: string | null;
  policy_reasons: string[];
  required_approvals: number;
  approvals: number;
  required_contexts: string[];
  successful_contexts: string[];
  missing_required_contexts: string[];
  required_reviewer_logins: string[];
  approved_reviewer_logins: string[];
  missing_required_reviewer_logins: string[];
  items: TeacherRepoPullCheckItem[];
}

export interface TeacherRepoPullCheckItem {
  id: string;
  name: string;
  source: "commit_status" | "action_run" | string;
  state: "success" | "failure" | "pending" | "unknown" | string;
  description: string | null;
  details_url: string | null;
  run_id: number | null;
  job_id: number | null;
  can_retry: boolean;
  has_logs: boolean;
}

export interface TeacherRepoPullDetail {
  number: number;
  title: string;
  state: string;
  body: string | null;
  author_name: string | null;
  author_login: string | null;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  base_sha: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged: boolean | null;
  mergeable: boolean | null;
  draft: boolean | null;
  comments_count: number;
  review_comments_count: number;
  commits_count: number | null;
  changed_files_count: number | null;
  web_url: string | null;
  diff_url: string | null;
  patch_url: string | null;
}

export interface TeacherRepoPullDetailBundle {
  pull: TeacherRepoPullDetail;
  diff: string;
  files: TeacherRepoPullFile[];
  reviews: TeacherRepoPullReview[];
  threads: TeacherRepoPullThread[];
  discussion: TeacherRepoPullDiscussionComment[];
  checks: TeacherRepoPullChecks;
}

export interface TeacherRepoPullCheckLog {
  id: string;
  log: string;
  truncated: boolean;
}

export interface TeacherRepoPullCheckRetryResult {
  id: string;
  accepted: boolean;
  message: string | null;
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

export function getTeacherRepoIssues(repoId: string, state = "open", page = 1, q?: string): Promise<TeacherRepoIssuesResponse> {
  return apiRequest<TeacherRepoIssuesResponse>(
    `/teacher/repositories/${repoId}/issues${repoQuery({ state, page: String(page), q })}`,
  );
}

export interface TeacherRepoIssueUpsertBody {
  title: string;
  body?: string | null;
  labels?: string[];
  assignees?: string[];
  milestone?: string | null;
}

export interface TeacherRepoIssuePatchBody {
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
  milestone?: string | null;
}

export function createTeacherRepoIssue(repoId: string, body: TeacherRepoIssueUpsertBody): Promise<TeacherRepoIssue> {
  return apiRequest<TeacherRepoIssue>(`/teacher/repositories/${repoId}/issues`, {
    method: "POST",
    body,
  });
}

export function patchTeacherRepoIssue(
  repoId: string,
  issueNumber: number,
  body: TeacherRepoIssuePatchBody,
): Promise<TeacherRepoIssue> {
  return apiRequest<TeacherRepoIssue>(
    `/teacher/repositories/${repoId}/issues/${encodeURIComponent(String(issueNumber))}`,
    { method: "PATCH", body },
  );
}

export function reactTeacherRepoIssue(
  repoId: string,
  issueNumber: number,
  content: "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
): Promise<any> {
  return apiRequest<any>(
    `/teacher/repositories/${repoId}/issues/${encodeURIComponent(String(issueNumber))}/reactions`,
    { method: "POST", body: { content } },
  );
}

export function getTeacherRepoPulls(repoId: string, state = "open", page = 1): Promise<TeacherRepoPullsResponse> {
  return apiRequest<TeacherRepoPullsResponse>(
    `/teacher/repositories/${repoId}/pulls${repoQuery({ state, page: String(page) })}`,
  );
}

export function getTeacherRepoPullDetail(repoId: string, pullNumber: number): Promise<TeacherRepoPullDetailBundle> {
  return apiRequest<TeacherRepoPullDetailBundle>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}`,
  );
}

export function getTeacherRepoPullCheckLog(
  repoId: string,
  pullNumber: number,
  checkId: string,
): Promise<TeacherRepoPullCheckLog> {
  return apiRequest<TeacherRepoPullCheckLog>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/checks/${encodeURIComponent(checkId)}/log`,
  );
}

export function retryTeacherRepoPullCheck(
  repoId: string,
  pullNumber: number,
  checkId: string,
): Promise<TeacherRepoPullCheckRetryResult> {
  return apiRequest<TeacherRepoPullCheckRetryResult>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/checks/${encodeURIComponent(checkId)}/retry`,
    {
      method: "POST",
    },
  );
}

export interface TeacherRepoCreatePullReviewCommentBody {
  path: string;
  body: string;
  new_position?: number;
  old_position?: number;
}

export interface TeacherRepoCreatePullReviewBody {
  event: "comment" | "approve" | "request_changes";
  body?: string | null;
  comments?: TeacherRepoCreatePullReviewCommentBody[];
}

export function createTeacherRepoPullReview(
  repoId: string,
  pullNumber: number,
  body: TeacherRepoCreatePullReviewBody,
): Promise<TeacherRepoPullReview> {
  return apiRequest<TeacherRepoPullReview>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/reviews`,
    {
      method: "POST",
      body,
    },
  );
}

export function createTeacherRepoPullComment(
  repoId: string,
  pullNumber: number,
  body: { body: string },
): Promise<TeacherRepoPullDiscussionComment> {
  return apiRequest<TeacherRepoPullDiscussionComment>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/comments`,
    {
      method: "POST",
      body,
    },
  );
}

export interface TeacherRepoMergePullBody {
  method: "merge" | "squash" | "rebase";
  commit_title?: string | null;
  commit_message?: string | null;
  delete_branch_after_merge?: boolean;
  force_merge?: boolean;
  head_commit_id?: string | null;
}

export interface TeacherRepoMergePullResult {
  merged: boolean;
  message: string | null;
}

export function mergeTeacherRepoPull(
  repoId: string,
  pullNumber: number,
  body: TeacherRepoMergePullBody,
): Promise<TeacherRepoMergePullResult> {
  return apiRequest<TeacherRepoMergePullResult>(
    `/teacher/repositories/${repoId}/pulls/${encodeURIComponent(String(pullNumber))}/merge`,
    {
      method: "POST",
      body,
    },
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

export interface TeacherRepoFileHistoryCommit {
  sha: string;
  message: string | null;
  author_name: string | null;
  author_login: string | null;
  authored_at: string | null;
  web_url: string | null;
}

export interface TeacherRepoFileHistoryResponse {
  path: string;
  branch: string;
  page: number;
  has_more: boolean;
  commits: TeacherRepoFileHistoryCommit[];
}

export function getTeacherRepoFileHistory(
  repoId: string,
  path: string,
  branch?: string,
  page = 1,
  limit = 20,
): Promise<TeacherRepoFileHistoryResponse> {
  return apiRequest<TeacherRepoFileHistoryResponse>(
    `/teacher/repositories/${repoId}/history/file${repoQuery({
      path,
      branch,
      page: String(page),
      limit: String(limit),
    })}`,
  );
}

export interface TeacherRepoBlameChunk {
  sha: string;
  message: string | null;
  author_name: string | null;
  author_login: string | null;
  authored_at: string | null;
  web_url: string | null;
  start_line: number;
  end_line: number;
  line_count: number;
}

export interface TeacherRepoBlameResponse {
  path: string;
  branch: string;
  chunks: TeacherRepoBlameChunk[];
}

export function getTeacherRepoFileBlame(
  repoId: string,
  path: string,
  branch?: string,
): Promise<TeacherRepoBlameResponse> {
  return apiRequest<TeacherRepoBlameResponse>(
    `/teacher/repositories/${repoId}/blame/file${repoQuery({
      path,
      branch,
    })}`,
  );
}

export interface TeacherRepoCompareFile {
  filename: string;
  previous_filename?: string | null;
  status: string | null;
  additions: number;
  deletions: number;
  changes: number;
  is_binary?: boolean;
  too_large?: boolean;
  truncated?: boolean;
}

export interface TeacherRepoCompareResponse {
  base: string;
  head: string;
  status: string | null;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files: TeacherRepoCompareFile[];
}

export function compareTeacherRepoRefs(
  repoId: string,
  base: string,
  head: string,
): Promise<TeacherRepoCompareResponse> {
  return apiRequest<TeacherRepoCompareResponse>(
    `/teacher/repositories/${repoId}/compare${repoQuery({ base, head })}`,
  );
}

export function getTeacherRepoUnmergedBranches(repoId: string, base?: string, limit = 50): Promise<string[]> {
  return apiRequest<string[]>(
    `/teacher/repositories/${repoId}/unmerged-branches${repoQuery({ base, limit: String(limit) })}`,
  );
}

