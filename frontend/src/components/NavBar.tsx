import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import { getTheme } from "../theme";
import { pageGutterClass } from "../layout/pageLayout";
import type { UserRole } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface NavBarProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function NavBar({ isDarkTheme = false, onToggleTheme }: NavBarProps) {
  const navigate = useNavigate();
  const { t } = useUserPreferences();
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarDisplayMode, setAvatarDisplayMode] = useState<string>("cover");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkTheme]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const me = await getMe();
        if (!cancelled) {
          setUserName(me.full_name || me.email || "User");
          setUserRole(me.role);
          // Add cache-busting timestamp to force image reload
          setAvatarUrl(me.avatar_url ? `${me.avatar_url}?t=${Date.now()}` : null);
          setAvatarDisplayMode(me.avatar_display_mode || "cover");
        }
      } catch {
        if (!cancelled) {
          setUserName("User");
          setUserRole(null);
          setAvatarUrl(null);
          setAvatarDisplayMode("cover");
        }
      }
    }
    loadMe();

    // Listen for avatar updates
    const handleAvatarUpdate = (e: CustomEvent) => {
      const userData = e.detail;
      if (userData) {
        setUserName(userData.full_name || userData.email || "User");
        setUserRole(userData.role);
        // Add cache-busting timestamp to force image reload
        setAvatarUrl(userData.avatar_url ? `${userData.avatar_url}?t=${Date.now()}` : null);
        setAvatarDisplayMode(userData.avatar_display_mode || "cover");
      }
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdate as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('avatarUpdated', handleAvatarUpdate as EventListener);
    };
  }, []);

  function handleToggleTheme() {
    onToggleTheme?.();
  }

  function onLogout() {
    clearToken();
    invalidateMeCache();
    navigate("/login", { replace: true });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // TODO: Implement search functionality
    console.log("Searching for:", searchQuery);
  }

  const theme = getTheme(isDarkTheme);

  return (
    <div className="border-b transition-colors" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <div className={`flex items-center justify-between py-2 ${pageGutterClass}`}>
        {/* Left: Logo */}
        <Link to="/home" className="flex items-center">
          <img
            src="/logo_mtuci.png"
            alt="MTUCI"
            className="h-8 w-auto object-contain"
          />
        </Link>

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-8">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("admin.navbar.search")}
              className="w-full rounded-md px-3 py-1.5 pl-9 text-sm outline-none transition border focus:ring-2 focus:ring-blue-500/50"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: theme.text3 }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </form>
        </div>

        {/* Right: Navigation + User */}
        <div className="flex items-center gap-4">
          {userRole !== "admin" && (
            <nav className="flex items-center gap-2">
              <Link
                to="/courses"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition"
                style={{ color: theme.text, backgroundColor: theme.hoverBg }}
              >
                {/* ЗАМЕНИ src НА ИКОНКУ КУРСОВ */}
                <img src="/icon-courses.png" alt="" className="h-5 w-5" />
                {t("admin.navbar.courses")}
              </Link>
              <Link
                to="/dashboard"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition"
                style={{ color: theme.text, backgroundColor: theme.hoverBg }}
              >
                {/* ЗАМЕНИ src НА ИКОНКУ ДАШБОРДА */}
                <img src="/icon-dashboard.png" alt="" className="h-5 w-5" />
                {t("admin.navbar.dashboard")}
              </Link>
            </nav>
          )}

          {/* Theme toggle */}
          <button
            onClick={handleToggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-full transition"
            style={{ backgroundColor: theme.bg3, color: theme.text }}
            title={isDarkTheme ? t("header.themeToLight") : t("header.themeToDark")}
          >
            {isDarkTheme ? "🌙" : "☀️"}
          </button>

          {/* User dropdown */}
          <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full p-1 transition"
            style={{ color: theme.text, backgroundColor: theme.hoverBg }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className={`h-7 w-7 rounded-full object-${avatarDisplayMode}`}
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: theme.bg3, color: theme.text }}>
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-[150px] truncate text-sm" style={{ color: theme.text }}>{userName}</span>
            <svg className="h-4 w-4" style={{ color: theme.text3 }} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 rounded-md border py-1 shadow-lg" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
              <div className="border-b px-4 py-2 text-sm" style={{ borderColor: theme.border, color: theme.text2 }}>
                {t("admin.navbar.loggedInAs")} <span className="font-medium" style={{ color: theme.text }}>{userName}</span>
              </div>
              <Link
                to="/profile"
                className="block px-4 py-2 text-sm transition-colors"
                style={{ color: theme.text2, backgroundColor: theme.hoverBg }}
                onClick={() => setMenuOpen(false)}
              >
                {t("admin.navbar.profile")}
              </Link>
              <div className="border-t my-1" style={{ borderColor: theme.border }}></div>
              <button
                onClick={onLogout}
                className="w-full px-4 py-2 text-left text-sm transition-colors"
                style={{ color: theme.danger, backgroundColor: theme.hoverBg }}
              >
                {t("admin.navbar.logout")}
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

