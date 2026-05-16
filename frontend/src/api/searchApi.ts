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

export function globalSearch(q: string, limit = 20): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiRequest<SearchResponse>(`/search?${params.toString()}`);
}
