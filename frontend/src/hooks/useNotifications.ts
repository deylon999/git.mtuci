import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../api/client";
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../api/notificationsApi";
import type { Notification } from "../api/types";
import { useUserPreferencesOptional } from "../context/UserPreferencesContext";
import { showBrowserNotification } from "../utils/browserNotifications";

function getNotificationsWsUrl(): string {
  const token = getToken();
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${host}/ws/notifications${q}`;
}

export function useNotifications() {
  const prefs = useUserPreferencesOptional();
  const pushEnabled = prefs?.notifications.push ?? false;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUnreadRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const data = await getNotifications();
      const unread = data.filter((n) => !n.read);
      if (pushEnabled && unread.length > prevUnreadRef.current) {
        const newest = unread[0];
        if (newest) {
          showBrowserNotification(newest.title, { body: newest.message, tag: newest.id });
        }
      }
      prevUnreadRef.current = unread.length;
      setNotifications(data);
    } catch {
      setNotifications([]);
      prevUnreadRef.current = 0;
    }
  }, [pushEnabled]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    };
    void load();

    const connectWs = () => {
      if (!getToken()) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(getNotificationsWsUrl());
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { type?: string };
          if (data.type === "notifications_updated" || data.type === "connected") {
            void refresh();
          }
          if (data.type === "ping") {
            ws.send("ping");
          }
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connectWs, 5000);
        }
      };

      ws.onerror = () => ws.close();
    };

    connectWs();

    const fallback = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void refresh();
      }
    }, 120_000);

    return () => {
      cancelled = true;
      clearInterval(fallback);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [refresh]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await markNotificationAsRead(id);
    } catch {
      // optimistic UI still applies
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
    } catch {
      // optimistic UI still applies
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    loading,
    unreadCount,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
