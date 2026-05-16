/** Browser (native) notifications — gated by user preference `notifications.push`. */

export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!browserNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function showBrowserNotification(title: string, options?: { body?: string; tag?: string }): void {
  if (!browserNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  try {
    new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: "/favicon.ico",
    });
  } catch {
    /* ignore — e.g. mobile restrictions */
  }
}
