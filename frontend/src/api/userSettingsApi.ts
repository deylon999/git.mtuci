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

export function getUserSettings(): Promise<UserSettings> {
  return apiRequest<UserSettings>("/users/me/settings");
}

export function patchUserSettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  return apiRequest<UserSettings>("/users/me/settings", {
    method: "PATCH",
    body: payload,
  });
}
