export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

const TOKEN_KEY = "token";

/** Fired on window when an authenticated request gets 401: the token was cleared and the user must sign in again. */
export const SESSION_EXPIRED_EVENT = "mtuci:session-expired";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

const sessionCleanups = new Set<() => void>();
let sessionGeneration = 0;

/**
 * Register a reset for per-user client caches. Runs whenever the session ends (logout, expiry, a new sign-in),
 * so the next account never sees the previous one's courses, profile, settings or notifications.
 */
export function onSessionCleared(cleanup: () => void): void {
  sessionCleanups.add(cleanup);
}

/** Bumped on every session change; a cache write from a request started under an older session must be dropped. */
export function getSessionGeneration(): number {
  return sessionGeneration;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionGeneration += 1;
  for (const cleanup of sessionCleanups) {
    try {
      cleanup();
    } catch {
      // a broken cache reset must not block signing out
    }
  }
}

type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** Error thrown for non-2xx responses. `message` is the server detail (user-facing), `status` the HTTP code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * True when GET /auth/me rejected the session (invalid/expired token -> 401, blocked user -> 403).
 * Network failures and 5xx errors return false so a transient outage does not log the user out.
 */
export function isSessionRejectedError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

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
    /** Called with the successful response, e.g. to read pagination headers such as X-Total-Count. */
    onResponse?: (res: Response) => void;
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

  let sentToken = false;
  if (auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      sentToken = true;
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: opts?.body instanceof FormData ? opts.body : opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && sentToken) {
      // The session expired or was revoked (password change, admin reset): drop it once, centrally,
      // instead of leaving every page to show its own error with a dead token.
      clearToken();
      if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
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
    // The message is shown to users as is, so it carries only the reason; the status lives in ApiError.status.
    const msg = detail || res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }

  opts?.onResponse?.(res);

  return parseJson<T>(res);
}

