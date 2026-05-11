import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, LogOut, User, Shield, Activity, Moon, Sun, X, Check, AlertTriangle } from "lucide-react";
import { clearToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import { getServiceStatus } from "../api/adminApi";
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "../api/notificationsApi";
import { getTheme } from "../theme";
import type { UserRole, Notification } from "../api/types";

// Helper для форматирования времени уведомления
function formatNotificationTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} час${diffHours > 1 ? (diffHours < 5 ? "а" : "ов") : ""} назад`;
  if (diffDays === 1) return "Вчера";
  return `${diffDays} дн${diffDays > 1 ? (diffDays < 5 ? "я" : "ей") : ""} назад`;
}

// Status indicator component
function StatusIndicator({ status, label, isDarkTheme = true }: { status: "online" | "offline" | "warning"; label: string; isDarkTheme?: boolean }) {
  const colors = {
    online: "bg-emerald-500",
    offline: "bg-red-500",
    warning: "bg-amber-500",
  };
  const theme = getTheme(isDarkTheme);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer group" style={{ 
      backgroundColor: theme.hoverBg,
      border: `${isDarkTheme ? '0.5px' : '1px'} solid ${theme.border}40`
    }}>
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
        {status === "offline" && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${colors[status]} animate-ping`} />
        )}
      </div>
      <span className="text-xs transition-colors group-hover:opacity-80" style={{ color: theme.text2 }}>{label}</span>
    </div>
  );
}

interface AdminHeaderProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function AdminHeader({ isDarkTheme = false, onToggleTheme }: AdminHeaderProps) {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("Admin");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarDisplayMode, setAvatarDisplayMode] = useState<string>("cover");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // System status from API
  const [systemStatus, setSystemStatus] = useState<{
    api: "online" | "offline";
    database: "online" | "offline";
  }>({ api: "offline", database: "offline" });

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUserName(me.full_name || me.email || "Admin");
          setUserRole(me.role);
          setAvatarUrl(me.avatar_url ? `${me.avatar_url}?t=${Date.now()}` : null);
          setAvatarDisplayMode(me.avatar_display_mode || "cover");
        }
      } catch {
        if (!cancelled) {
          setUserName("Admin");
          setUserRole(null);
          setAvatarUrl(null);
        }
      }
    }
    loadMe();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch system status
  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const status = await getServiceStatus();
        if (!cancelled) {
          setSystemStatus({
            api: status?.api ? "online" : "offline",
            database: status?.db ? "online" : "offline",
          });
        }
      } catch {
        if (!cancelled) {
          setSystemStatus({ api: "offline", database: "offline" });
        }
      }
    }
    loadStatus();
    // Refresh every 30 seconds
    const interval = setInterval(loadStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Fetch notifications
  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      setNotificationsLoading(true);
      try {
        const data = await getNotifications();
        if (!cancelled) {
          setNotifications(data);
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    }
    loadNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) {
        setProfileMenuOpen(false);
      }
      if (!target.closest("[data-notification-menu]")) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // Ignore error, still update local state
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // Ignore error, still update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // TODO: Implement global search
    console.log("Searching for:", searchQuery);
  }

  const theme = getTheme(isDarkTheme);
  const hasNotifications = notifications.filter(n => !n.read).length > 0;

  return (
    <header className="border-b transition-colors" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className="mx-auto max-w-[1400px] px-4">
        {/* Main header row */}
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo */}
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-8 h-8 font-bold text-lg transition-colors" style={{ color: theme.text }}>
              M
            </div>
            <div className="w-px h-5 transition-colors" style={{ backgroundColor: theme.divider }} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight transition-colors" style={{ color: theme.text }}>GIT</span>
              <span className="text-[10px] leading-tight tracking-wider transition-colors" style={{ color: theme.text2 }}>ADMIN PANEL</span>
            </div>
          </Link>

          {/* Center: Search - wider */}
          <div className="flex-1 max-w-2xl mx-8 hidden md:block">
            <form onSubmit={handleSearch} className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors" style={{ color: theme.text3 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по системе..."
                className="w-full h-9 pl-10 pr-4 rounded-lg text-sm outline-none transition-all duration-200 border focus:ring-2 focus:ring-blue-500/50"
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              />
            </form>
          </div>

          {/* Right: Actions + Profile */}
          <div className="flex items-center gap-2">
            {/* System Status */}
            <div className="hidden xl:flex items-center gap-3 mr-2">
              <StatusIndicator status={systemStatus.api} label="API" isDarkTheme={isDarkTheme} />
              <StatusIndicator status={systemStatus.database} label="БД" isDarkTheme={isDarkTheme} />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors mr-1"
              style={{ color: theme.text2 }}
              title={isDarkTheme ? "Переключить на светлую тему" : "Переключить на темную тему"}
            >
              {isDarkTheme ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            {/* Notifications */}
            <div className="relative" data-notification-menu>
              <button
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors mr-1"
                style={{ color: theme.text2 }}
              >
                <Bell className="h-5 w-5" />
                {hasNotifications && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2" style={{ borderColor: theme.bg }}>
                    <span className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {notificationOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
                  {/* Header */}
                  <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: theme.text }}>Уведомления</h3>
                      <p className="text-xs" style={{ color: theme.text2 }}>{notifications.filter(n => !n.read).length} непрочитанных</p>
                    </div>
                    {hasNotifications && (
                      <button
                        onClick={markAllAsRead}
                        className={`text-xs font-medium ${isDarkTheme ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}
                      >
                        Отметить все
                      </button>
                    )}
                  </div>

                  {/* Notifications List */}
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
                          className="px-4 py-3 border-b hover:bg-opacity-50 transition-colors cursor-pointer"
                          style={{ borderColor: theme.border, backgroundColor: notification.read ? 'transparent' : theme.hoverBg }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex-shrink-0 ${notification.read ? "opacity-50" : ""}`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${notification.read ? "opacity-70" : ""}`} style={{ color: theme.text }}>
                                {notification.title}
                              </p>
                              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.text2 }}>
                                {notification.message}
                              </p>
                              <p className="text-[10px] mt-1" style={{ color: theme.text2 }}>
                                {formatNotificationTime(notification.created_at)}
                              </p>
                            </div>
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 border-t" style={{ borderColor: theme.border }}>
                    <button
                      className={`w-full text-center text-xs font-medium ${isDarkTheme ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}
                    >
                      Показать все уведомления
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="relative ml-2" data-profile-menu>
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: theme.hoverBg }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                    style={{ border: `${isDarkTheme ? '0.5px' : '1px'} solid ${theme.border}` }}
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: theme.bg3, color: theme.text, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${theme.border}` }}>
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium leading-tight transition-colors" style={{ color: theme.text }}>{userName}</span>
                  <span className="text-[10px] leading-tight transition-colors" style={{ color: theme.text2 }}>Администратор</span>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`} style={{ color: theme.text2 }} />
              </button>

              {/* Profile dropdown */}
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-xl z-50 py-1 border" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
                  <div className="px-3 py-2 border-b" style={{ borderColor: theme.border }}>
                    <p className="text-sm font-medium truncate transition-colors" style={{ color: theme.text }}>{userName}</p>
                    <p className="text-xs truncate transition-colors" style={{ color: theme.text2 }}>{userRole || "admin"}</p>
                  </div>

                  <Link
                    to="/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <User className="h-4 w-4" />
                    Профиль
                  </Link>

                  <Link
                    to="/admin/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <Shield className="h-4 w-4" />
                    Настройки безопасности
                  </Link>

                  <Link
                    to="/admin/monitoring"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <Activity className="h-4 w-4" />
                    Мониторинг
                  </Link>

                  <div className="border-t my-1" style={{ borderColor: theme.border }} />

                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.danger }}
                  >
                    <LogOut className="h-4 w-4" />
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
