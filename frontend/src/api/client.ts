export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

const TOKEN_KEY = "token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

type ApiMethod = "GET" | "POST" | "DELETE" | "PATCH";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiRequest<T>(
  path: string,
  opts?: {
    method?: ApiMethod;
    body?: unknown;
    auth?: boolean;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const method = opts?.method ?? "GET";
  const auth = opts?.auth ?? true;

  const headers: Record<string, string> = {};
  
  // Only set Content-Type if not FormData (browser will set with boundary for FormData)
  if (!(opts?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  
  // Merge custom headers
  if (opts?.headers) {
    Object.assign(headers, opts.headers);
  }

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: opts?.body instanceof FormData ? opts.body : opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await parseJson<{ detail?: string | Array<{ loc: string[]; msg: string; type: string }> }>(res.clone());
      if (Array.isArray(data?.detail)) {
        // FastAPI validation error format
        detail = data.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ');
      } else {
        detail = data?.detail ?? "";
      }
    } catch {
      // ignore parse errors
    }
    const msg = detail ? `${res.status} ${detail}` : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return parseJson<T>(res);
}

