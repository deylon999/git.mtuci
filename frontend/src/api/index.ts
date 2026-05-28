import { apiRequest } from "./client";

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, params?: Record<string, QueryValue>): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

const api = {
  get<T>(path: string, config?: { params?: Record<string, QueryValue> }) {
    return apiRequest<T>(withQuery(path, config?.params), { method: "GET" }).then((data) => ({ data }));
  },
  post<T>(path: string, body?: unknown) {
    return apiRequest<T>(path, { method: "POST", body }).then((data) => ({ data }));
  },
  patch<T>(path: string, body?: unknown) {
    return apiRequest<T>(path, { method: "PATCH", body }).then((data) => ({ data }));
  },
  delete(path: string) {
    return apiRequest<void>(path, { method: "DELETE" }).then((data) => ({ data }));
  },
};

export default api;
