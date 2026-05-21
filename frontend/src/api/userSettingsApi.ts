import { apiRequest } from "./client";

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  assignments: boolean;
  grades: boolean;
  teacher_pr_submitted?: boolean;
  teacher_pr_stale?: boolean;
  teacher_deadline_missed?: boolean;
  teacher_daily_digest?: boolean;
}

export interface UserSettings {
  theme: "light" | "dark" | "system";
  language: string;
  notifications: NotificationSettings;
}

let settingsInflight: Promise<UserSettings> | null = null;
let settingsCache: { savedAt: number; data: UserSettings } | null = null;
const SETTINGS_CACHE_TTL_MS = 30_000;

export function invalidateUserSettingsCache(): void {
  settingsCache = null;
  settingsInflight = null;
}

export function seedUserSettingsCache(data: UserSettings): void {
  settingsCache = { savedAt: Date.now(), data };
  settingsInflight = null;
}

export function getUserSettings(): Promise<UserSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.savedAt < SETTINGS_CACHE_TTL_MS) {
    return Promise.resolve(settingsCache.data);
  }
  if (settingsInflight) {
    return settingsInflight;
  }
  settingsInflight = apiRequest<UserSettings>("/users/me/settings")
    .then((data) => {
      settingsCache = { savedAt: Date.now(), data };
      return data;
    })
    .finally(() => {
      settingsInflight = null;
    });
  return settingsInflight;
}

export function patchUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  invalidateUserSettingsCache();
  return apiRequest<UserSettings>("/users/me/settings", {
    method: "PATCH",
    body: payload,
  }).then((data) => {
    settingsCache = { savedAt: Date.now(), data };
    return data;
  });
}
