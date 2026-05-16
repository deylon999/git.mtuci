import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, User, Moon, Sun, Search } from "lucide-react";
import { clearToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import NotificationBell from "./NotificationBell";
import type { UserRole } from "../api/types";

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
  const [searchQuery, setSearchQuery] = useState("");

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
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) setProfileMenuOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function onLogout() {
    clearToken();
    invalidateMeCache();
    navigate("/login", { replace: true });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
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
                placeholder="Поиск по курсам и заданиям…"
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
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              style={{ color: theme.text2 }}
              title={isDarkTheme ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
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
