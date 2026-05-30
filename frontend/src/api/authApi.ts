import { apiRequest, clearToken, setToken } from "./client";
import type { TokenResponse, UserRead } from "./types";

const ME_CACHE_TTL_MS = 15_000;
let meCache: UserRead | null = null;
let meCacheTs = 0;
let meInFlight: Promise<UserRead> | null = null;

export function invalidateMeCache() {
  meCache = null;
  meCacheTs = 0;
  meInFlight = null;
}

/** Seed from dashboard/profile bundle — avoids a separate GET /auth/me on student shell pages. */
export function seedMeCache(user: UserRead): void {
  meCache = user;
  meCacheTs = Date.now();
  meInFlight = null;
}

export async function login(email: string, password: string, rememberMe?: boolean) {
  // Always drop previous session before a fresh sign-in attempt:
  // avoids sticking to an old role/token if new credentials are wrong.
  clearToken();
  invalidateMeCache();

  const data = await apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password, remember_me: rememberMe },
  });

  // В backend response_model: TokenResponse(access_token, token_type)
  setToken(data.access_token);
  invalidateMeCache();
}

export async function register(email: string, password: string, fullName: string) {
  await apiRequest<unknown>("/auth/register", {
    method: "POST",
    auth: false,
    body: { email, password, full_name: fullName },
  });
}

export async function registerStudentMtuci(
  email: string,
  password: string,
  fullName: string,
  mtuciLogin?: string,
  mtuciPassword?: string
) {
  await apiRequest<unknown>("/auth/register-student-mtuci", {
    method: "POST",
    auth: false,
    body: {
      email,
      password,
      full_name: fullName,
      mtuci_login: mtuciLogin || null,
      mtuci_password: mtuciPassword || null,
    },
  });
}

export async function getMe(opts?: { force?: boolean }): Promise<UserRead> {
  const force = opts?.force ?? false;
  const now = Date.now();
  if (!force && meCache && now - meCacheTs < ME_CACHE_TTL_MS) {
    return meCache;
  }
  if (!force && meInFlight) {
    return meInFlight;
  }

  meInFlight = apiRequest<UserRead>("/auth/me")
    .then((data) => {
      meCache = data;
      meCacheTs = Date.now();
      return data;
    })
    .finally(() => {
      meInFlight = null;
    });
  return meInFlight;
}

export async function changeMyPassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest<void>("/users/me/password", {
    method: "PATCH",
    body: { old_password: oldPassword, new_password: newPassword },
  });
  invalidateMeCache();
}

export async function getCurrentUser(): Promise<UserRead> {
  return getMe();
}

export async function updateAssistantGrading(allow: boolean): Promise<{ allow_assistant_grading: boolean }> {
  return apiRequest<{ allow_assistant_grading: boolean }>("/auth/me/assistant-grading", {
    method: "PATCH",
    body: { allow_assistant_grading: allow },
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest<void>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}

export async function uploadAvatar(file: File): Promise<UserRead> {
  const formData = new FormData();
  formData.append("file", file);
  
  const data = await apiRequest<UserRead>("/users/me/avatar", {
    method: "POST",
    body: formData,
    // Don't set Content-Type, browser will set it with boundary for FormData
    headers: {},
  });
  invalidateMeCache();
  return data;
}

export async function uploadAvatarWithMode(file: File, displayMode: "cover" | "contain" | "fill" | "scale-down"): Promise<UserRead> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("avatar_display_mode", displayMode);
  
  const data = await apiRequest<UserRead>("/users/me/avatar", {
    method: "POST",
    body: formData,
    headers: {},
  });
  invalidateMeCache();
  return data;
}

export async function updateAvatarDisplayMode(mode: "cover" | "contain" | "fill" | "scale-down"): Promise<UserRead> {
  const data = await apiRequest<UserRead>("/users/me/avatar-display-mode", {
    method: "PATCH",
    body: { avatar_display_mode: mode },
  });
  invalidateMeCache();
  return data;
}

