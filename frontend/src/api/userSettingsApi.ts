import { apiRequest } from "./client";

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  assignments: boolean;
  grades: boolean;
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
