import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, User, Moon, Sun, Search, Plus } from "lucide-react";
import { clearToken } from "../api/client";
import { useAuthUser } from "../context/AuthUserContext";
import { globalSearch } from "../api/searchApi";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import NotificationBell from "./NotificationBell";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { UserRole } from "../api/types";

function roleLabel(role: UserRole | null, t: (key: string) => string): string {
  switch (role) {
    case "student":
      return t("roles.student");
    case "teacher":
      return t("roles.teacher");
    case "laborant":
      return t("roles.laborant");
    case "admin":
      return t("roles.admin");
    default:
      return t("roles.user");
  }
}

interface StudentHeaderProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function StudentHeader({ isDarkTheme = false, onToggleTheme }: StudentHeaderProps) {
  const navigate = useNavigate();
  const { t } = useUserPreferences();
  const { user, clearUser, refreshUser } = useAuthUser();

  const [userName, setUserName] = useState(() => t("roles.user"));
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [homeHref, setHomeHref] = useState("/dashboard");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (user) {
      setUserName(user.full_name || user.email || t("roles.user"));
      setUserRole(user.role);
      setHomeHref(getDefaultRouteForRole(user.role));
      setAvatarUrl(user.avatar_url ? `${user.avatar_url}?t=${Date.now()}` : null);
    }
  }, [user, t]);

  useEffect(() => {
    const handleAvatarUpdate = (e: CustomEvent) => {
      const userData = e.detail;
      if (userData) {
        void refreshUser({ force: true });
      }
    };
    window.addEventListener("avatarUpdated", handleAvatarUpdate as EventListener);
    return () => window.removeEventListener("avatarUpdated", handleAvatarUpdate as EventListener);
  }, [refreshUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) setProfileMenuOpen(false);
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
    try {
      const result = await globalSearch(q, 8);
      const first = result.hits[0];
      if (first?.href) {
        navigate(first.href);
        return;
      }
    } catch {
      // fallback
    }
    navigate(`/courses?q=${encodeURIComponent(q)}`);
  }

  const theme = getTheme(isDarkTheme);

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

          <div className="flex-1 max-w-2xl mx-4 md:mx-8 hidden md:block min-w-0">
            <form onSubmit={handleSearch} className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                style={{ color: theme.text3 }}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("header.searchStudent")}
                className="w-full h-9 pl-10 pr-4 rounded-lg text-sm outline-none border focus:ring-2 focus:ring-blue-500/50"
                style={{
                  backgroundColor: theme.inputBg,
                  borderColor: theme.border,
                  color: theme.text,
                }}
              />
            </form>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {userRole === "student" ? (
              <Link
                to="/repositories/new"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
                style={{
                  backgroundColor: `${theme.success}18`,
                  borderColor: `${theme.success}40`,
                  color: theme.success,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("header.createRepo")}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title={isDarkTheme ? t("header.themeToLight") : t("header.themeToDark")}
            >
              {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <NotificationBell isDarkTheme={isDarkTheme} />

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
                    {roleLabel(userRole, t)}
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
                      {roleLabel(userRole, t)}
                    </p>
                  </div>

                  <Link
                    to="/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-90"
                    style={{ color: theme.text2 }}
                  >
                    <User className="h-4 w-4" />
                    {t("header.profile")}
                  </Link>

                  <div className="border-t my-1" style={{ borderColor: theme.border }} />

                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-90"
                    style={{ color: theme.danger }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("header.logout")}
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
