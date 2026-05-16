import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, AlertTriangle, X } from "lucide-react";
import { getTheme } from "../theme";
import { useNotifications } from "../hooks/useNotifications";
import type { Notification, NotificationType } from "../api/types";

function formatNotificationTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays === 1) return "Вчера";
  return `${diffDays} дн назад`;
}

function NotificationIcon({ type, read }: { type: NotificationType; read: boolean }) {
  const cls = `h-4 w-4 flex-shrink-0 ${read ? "opacity-50" : ""}`;
  switch (type) {
    case "success":
      return <Check className={`${cls} text-green-500`} />;
    case "warning":
      return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "error":
      return <X className={`${cls} text-red-500`} />;
    default:
      return <Bell className={`${cls} text-blue-500`} />;
  }
}

interface NotificationBellProps {
  isDarkTheme?: boolean;
}

export default function NotificationBell({ isDarkTheme = false }: NotificationBellProps) {
  const navigate = useNavigate();
  const theme = getTheme(isDarkTheme);
  const { notifications, unreadCount, refresh, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const hasUnread = unreadCount > 0;

  const handleClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    setOpen(false);
    if (notification.href) {
      navigate(notification.href);
    }
  };

  return (
    <div className="relative" data-notification-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
        style={{ color: theme.text2 }}
        aria-label="Уведомления"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {hasUnread ? (
          <span
            className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2"
            style={{ borderColor: theme.bg }}
          >
            <span className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden border"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: theme.border }}
          >
            <div>
              <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
                Уведомления
              </h3>
              <p className="text-xs" style={{ color: theme.text2 }}>
                {unreadCount} непрочитанных
              </p>
            </div>
            {hasUnread ? (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className={`text-xs font-medium ${isDarkTheme ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}
              >
                Отметить все
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center" style={{ color: theme.text2 }}>
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Нет уведомлений</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleClick(notification)}
                  className="w-full text-left px-4 py-3 border-b transition-colors cursor-pointer"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: notification.read ? "transparent" : theme.hoverBg,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <NotificationIcon type={notification.type} read={notification.read} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${notification.read ? "opacity-70" : ""}`}
                        style={{ color: theme.text }}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.text2 }}>
                        {notification.message}
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: theme.text2 }}>
                        {formatNotificationTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read ? (
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
