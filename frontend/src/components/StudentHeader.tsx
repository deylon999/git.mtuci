import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  LogOut,
  User,
  Moon,
  Sun,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { clearToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../api/notificationsApi";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import type { UserRole, Notification } from "../api/types";

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

function roleLabel(role: UserRole | null): string {
  switch (role) {
    case "student":
      return "Студент";
    case "teacher":
      return "Преподаватель";
    case "laborant":
      return "Лаборант";
    default:
      return "Пользователь";
  }
}

interface StudentHeaderProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function StudentHeader({ isDarkTheme = false, onToggleTheme }: StudentHeaderProps) {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("Пользователь");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [homeHref, setHomeHref] = useState("/dashboard");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUserName(me.full_name || me.email || "Пользователь");
          setUserRole(me.role);
          setHomeHref(getDefaultRouteForRole(me.role));
          setAvatarUrl(me.avatar_url ? `${me.avatar_url}?t=${Date.now()}` : null);
        }
      } catch {
        if (!cancelled) {
          setUserName("Пользователь");
          setUserRole(null);
          setAvatarUrl(null);
        }
      }
    }
    loadMe();

    const handleAvatarUpdate = (e: CustomEvent) => {
      const userData = e.detail;
      if (userData) {
        setUserName(userData.full_name || userData.email || "Пользователь");
        setUserRole(userData.role);
        setHomeHref(getDefaultRouteForRole(userData.role));
        setAvatarUrl(userData.avatar_url ? `${userData.avatar_url}?t=${Date.now()}` : null);
      }
    };
    window.addEventListener("avatarUpdated", handleAvatarUpdate as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("avatarUpdated", handleAvatarUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const data = await getNotifications();
        if (!cancelled) setNotifications(data);
      } catch {
        if (!cancelled) setNotifications([]);
      }
    }
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) setProfileMenuOpen(false);
      if (!target.closest("[data-notification-menu]")) setNotificationOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
    } catch {
      // local fallback
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
    } catch {
      // local fallback
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success":
        return <Check className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "error":
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  function onLogout() {
    clearToken();
    invalidateMeCache();
    navigate("/login", { replace: true });
  }

  const theme = getTheme(isDarkTheme);
  const hasNotifications = notifications.filter((n) => !n.read).length > 0;

  return (
    <header className="border-b transition-colors shrink-0" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className={pageGutterClass}>
        <div className="flex items-center justify-between h-14">
          <Link to={homeHref} className="flex items-center gap-2 group">
            <img
              src="/logo_mtuci.png"
              alt="MTUCI"
              className="h-8 w-auto object-contain transition-opacity group-hover:opacity-90"
            />
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title={isDarkTheme ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            >
              {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <div className="relative" data-notification-menu>
              <button
                type="button"
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
                style={{ color: theme.text2 }}
                aria-label="Уведомления"
              >
                <Bell className="h-5 w-5" />
                {hasNotifications ? (
                  <span
                    className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2"
                    style={{ borderColor: theme.bg }}
                  >
                    <span className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
                  </span>
                ) : null}
              </button>

              {notificationOpen ? (
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
                        {notifications.filter((n) => !n.read).length} непрочитанных
                      </p>
                    </div>
                    {hasNotifications ? (
                      <button
                        type="button"
                        onClick={markAllAsRead}
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
                        <div
                          key={notification.id}
                          onClick={() => markAsRead(notification.id)}
                          className="px-4 py-3 border-b transition-colors cursor-pointer"
                          style={{
                            borderColor: theme.border,
                            backgroundColor: notification.read ? "transparent" : theme.hoverBg,
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex-shrink-0 ${notification.read ? "opacity-50" : ""}`}>
                              {getNotificationIcon(notification.type)}
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
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative ml-1" data-profile-menu>
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: theme.hoverBg }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                    style={{ border: `${isDarkTheme ? "0.5px" : "1px"} solid ${theme.border}` }}
                  />
                ) : (
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: theme.bg3,
                      color: theme.text,
                      border: `${isDarkTheme ? "0.5px" : "1px"} solid ${theme.border}`,
                    }}
                  >
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium leading-tight" style={{ color: theme.text }}>
                    {userName}
                  </span>
                  <span className="text-[10px] leading-tight" style={{ color: theme.text2 }}>
                    {roleLabel(userRole)}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                  style={{ color: theme.text2 }}
                />
              </button>

              {profileMenuOpen ? (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-lg shadow-xl z-50 py-1 border"
                  style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: theme.border }}>
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                      {userName}
                    </p>
                    <p className="text-xs truncate" style={{ color: theme.text2 }}>
                      {roleLabel(userRole)}
                    </p>
                  </div>

                  <Link
                    to="/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-90"
                    style={{ color: theme.text2 }}
                  >
                    <User className="h-4 w-4" />
                    Профиль
                  </Link>

                  <div className="border-t my-1" style={{ borderColor: theme.border }} />

                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-90"
                    style={{ color: theme.danger }}
                  >
                    <LogOut className="h-4 w-4" />
                    Выйти
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
