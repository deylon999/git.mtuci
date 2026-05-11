import { apiRequest } from "./client";
import type { Notification } from "./types";

export async function getNotifications(): Promise<Notification[]> {
  return apiRequest<Notification[]>("/notifications");
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  return apiRequest<void>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  return apiRequest<void>("/notifications/read-all", {
    method: "PATCH",
  });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  return apiRequest<void>(`/notifications/${notificationId}`, {
    method: "DELETE",
  });
}
