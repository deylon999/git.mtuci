import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronDown, LogOut, User, Shield, Activity, Moon, Sun } from "lucide-react";
import { clearToken } from "../api/client";
import { useAuthUser } from "../context/AuthUserContext";
import { getServiceStatus } from "../api/adminApi";
import { getTheme } from "../theme";
import NotificationBell from "./NotificationBell";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { UserRole } from "../api/types";

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
  const { t } = useUserPreferences();
  const { user, clearUser, refreshUser } = useAuthUser();

  const [userName, setUserName] = useState("Admin");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarDisplayMode, setAvatarDisplayMode] = useState<string>("cover");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // System status from API
  const [systemStatus, setSystemStatus] = useState<{
    api: "online" | "offline";
    database: "online" | "offline";
  }>({ api: "offline", database: "offline" });

  useEffect(() => {
    if (!user) return;
    setUserName(user.full_name || user.email || "Admin");
    setUserRole(user.role);
    setAvatarUrl(user.avatar_url ? `${user.avatar_url}?t=${Date.now()}` : null);
    setAvatarDisplayMode(user.avatar_display_mode || "cover");
  }, [user]);

  useEffect(() => {
    const handleAvatarUpdate = () => {
      void refreshUser({ force: true });
    };
    window.addEventListener("avatarUpdated", handleAvatarUpdate);
    return () => window.removeEventListener("avatarUpdated", handleAvatarUpdate);
  }, [refreshUser]);

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

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function onLogout() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/search/code?q=${encodeURIComponent(q)}`);
  }

  const theme = getTheme(isDarkTheme);

  const searchForm = (
    <form onSubmit={handleSearch} className="relative group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors" style={{ color: theme.text3 }} />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t("header.searchAdmin")}
        className="w-full h-9 pl-10 pr-4 rounded-lg text-sm outline-none transition-all duration-200 border focus:ring-2 focus:ring-blue-500/50"
        style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
      />
    </form>
  );

  return (
    <header className="border-b transition-colors" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className="mx-auto max-w-[1400px] px-4">
        {/* Main header row */}
        <div className="flex items-center justify-between h-14 gap-2">
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

          <div className="flex-1 max-w-2xl mx-2 sm:mx-6 hidden sm:block min-w-0">{searchForm}</div>

          {/* Right: Actions + Profile */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ color: theme.text2, backgroundColor: theme.hoverBg }}
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={t("header.searchAdmin")}
            >
              <Search className="h-5 w-5" />
            </button>
            {/* System Status */}
            <div className="hidden xl:flex items-center gap-3 mr-2">
              <StatusIndicator status={systemStatus.api} label={t("header.apiStatus")} isDarkTheme={isDarkTheme} />
              <StatusIndicator status={systemStatus.database} label={t("header.dbStatus")} isDarkTheme={isDarkTheme} />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors mr-1"
              style={{ color: theme.text2 }}
              title={isDarkTheme ? t("header.themeToLight") : t("header.themeToDark")}
            >
              {isDarkTheme ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            <NotificationBell isDarkTheme={isDarkTheme} />

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
                  <span className="text-[10px] leading-tight transition-colors" style={{ color: theme.text2 }}>{t("roles.admin")}</span>
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
                    {t("header.profile")}
                  </Link>

                  <Link
                    to="/admin/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <Shield className="h-4 w-4" />
                    {t("header.securitySettings")}
                  </Link>

                  <Link
                    to="/admin/monitoring"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <Activity className="h-4 w-4" />
                    {t("header.monitoring")}
                  </Link>

                  <div className="border-t my-1" style={{ borderColor: theme.border }} />

                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{ color: theme.danger }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("header.logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {mobileSearchOpen ? <div className="sm:hidden pb-3">{searchForm}</div> : null}
      </div>
    </header>
  );
}
