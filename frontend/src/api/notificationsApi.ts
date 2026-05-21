import { apiRequest } from "./client";
import type { Notification } from "./types";

let notificationsInflight: Promise<Notification[]> | null = null;
let notificationsCache: { savedAt: number; data: Notification[] } | null = null;
const NOTIFICATIONS_CACHE_TTL_MS = 10_000;

export function invalidateNotificationsCache(): void {
  notificationsCache = null;
  notificationsInflight = null;
}

export async function getNotifications(): Promise<Notification[]> {
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
