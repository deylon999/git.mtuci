import { apiRequest } from "./client";

export interface SearchHit {
  type: "course" | "assignment" | "user" | "repository";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
}

export interface CodeSearchHit {
  repository_id: string;
  repository_name: string;
  path: string;
  branch: string;
  score: number;
  snippet: string | null;
  highlights?: string[];
}

export interface CodeSearchResponse {
  query: string;
  total: number;
  facets?: {
    extensions?: Array<{ value: string; count: number }>;
    repositories?: Array<{ value: string; count: number }>;
  };
  hits: CodeSearchHit[];
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query: string;
  search_type: string;
  filters?: Record<string, unknown>;
  filters_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function globalSearch(q: string, limit = 20): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiRequest<SearchResponse>(`/search?${params.toString()}`);
}

export function codeSearch(
  q: string,
  params?: {
    extension?: string;
    path_prefix?: string;
    path_contains?: string;
    symbol?: string;
    repo_id?: string;
    min_score?: number;
    sort?: "relevance" | "path";
    branch?: string;
    limit?: number;
  },
): Promise<CodeSearchResponse> {
  const qp = new URLSearchParams({ q, limit: String(params?.limit ?? 20) });
  if (params?.extension) qp.set("extension", params.extension);
  if (params?.path_prefix) qp.set("path_prefix", params.path_prefix);
  if (params?.path_contains) qp.set("path_contains", params.path_contains);
  if (params?.symbol) qp.set("symbol", params.symbol);
  if (params?.repo_id) qp.set("repo_id", params.repo_id);
  if (typeof params?.min_score === "number") qp.set("min_score", String(params.min_score));
  if (params?.sort) qp.set("sort", params.sort);
  if (params?.branch) qp.set("branch", params.branch);
  return apiRequest<CodeSearchResponse>(`/search/code?${qp.toString()}`);
}

export function listSavedSearches(): Promise<SavedSearch[]> {
  return apiRequest<SavedSearch[]>("/search/saved");
}

export function createSavedSearch(payload: {
  name: string;
  query: string;
  search_type?: string;
  filters?: Record<string, unknown>;
}): Promise<SavedSearch> {
  return apiRequest<SavedSearch>("/search/saved", { method: "POST", body: payload });
}

export function updateSavedSearch(
  id: string,
  payload: { name?: string; query?: string; filters?: Record<string, unknown> },
): Promise<SavedSearch> {
  return apiRequest<SavedSearch>(`/search/saved/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteSavedSearch(id: string): Promise<void> {
  return apiRequest<void>(`/search/saved/${encodeURIComponent(id)}`, { method: "DELETE" });
}
