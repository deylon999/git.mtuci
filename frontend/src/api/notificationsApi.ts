import { apiRequest } from "./client";
import type { Notification } from "./types";

let notificationsInflight: Promise<Notification[]> | null = null;
let notificationsCache: { savedAt: number; data: Notification[] } | null = null;
const NOTIFICATIONS_CACHE_TTL_MS = 10_000;

export function invalidateNotificationsCache(): void {
  notificationsCache = null;
  notificationsInflight = null;
}

export function seedNotificationsCache(data: Notification[]): void {
  notificationsCache = { savedAt: Date.now(), data };
  notificationsInflight = null;
}

export async function getNotifications(opts?: { limit?: number; offset?: number; bypassCache?: boolean }): Promise<Notification[]> {
  const hasCustomQuery = typeof opts?.limit === "number" || typeof opts?.offset === "number";
  if (hasCustomQuery || opts?.bypassCache) {
    const query = new URLSearchParams();
    if (typeof opts?.limit === "number") query.set("limit", String(opts.limit));
    if (typeof opts?.offset === "number") query.set("offset", String(opts.offset));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiRequest<Notification[]>(`/notifications${suffix}`);
  }

  const now = Date.now();
  if (notificationsCache && now - notificationsCache.savedAt < NOTIFICATIONS_CACHE_TTL_MS) {
    return notificationsCache.data;
  }
  if (notificationsInflight) {
    return notificationsInflight;
  }
  notificationsInflight = apiRequest<Notification[]>("/notifications")
    .then((data) => {
      notificationsCache = { savedAt: Date.now(), data };
      return data;
    })
    .finally(() => {
      notificationsInflight = null;
    });
  return notificationsInflight;
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  invalidateNotificationsCache();
  return apiRequest<void>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  invalidateNotificationsCache();
  return apiRequest<void>("/notifications/read-all", {
    method: "PATCH",
  });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  invalidateNotificationsCache();
  return apiRequest<void>(`/notifications/${notificationId}`, {
    method: "DELETE",
  });
}
