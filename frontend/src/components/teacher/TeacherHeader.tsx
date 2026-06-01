import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Moon, Search, Sun, User } from "lucide-react";
import { clearToken } from "../../api/client";
import { useAuthUser } from "../../context/AuthUserContext";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { getTheme } from "../../theme";
import { initialsFromName } from "./teacherUiConstants";
import NotificationBell from "../NotificationBell";

interface Props {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

function GitMtuciLogo() {
  return (
    <svg viewBox="0 0 339 339" className="h-[26px] w-[26px]" fill="none" aria-hidden>
      <defs>
        <linearGradient id="teacher-logo-lg" x1="0" y1="0" x2="339" y2="339" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M267.259 74.5966L185.67 34.705C175.452 29.7089 163.548 29.7089 153.33 34.705L71.7413 74.5966C61.5229 79.5927 54.1014 89.0412 51.5777 100.267L31.4269 189.903C28.9032 201.129 31.5519 212.911 38.6232 221.914L95.0844 293.796C102.156 302.799 112.88 308.042 124.222 308.042H214.778C226.12 308.042 236.844 302.799 243.916 293.796L300.377 221.914C307.448 212.911 310.097 201.129 307.573 189.903L287.422 100.267C284.899 89.0412 277.477 79.5927 267.259 74.5966ZM198.9 6.81289C180.321 -2.27096 158.679 -2.27097 140.1 6.81289L58.5113 46.7044C39.9325 55.7883 26.4389 72.9673 21.8503 93.3786L1.6995 183.014C-2.88911 203.425 1.92669 224.847 14.7837 241.216L71.2449 313.098C84.1018 329.466 103.601 339 124.222 339H214.778C235.399 339 254.898 329.466 267.755 313.098L324.216 241.216C337.073 224.847 341.889 203.425 337.301 183.014L317.15 93.3786C312.561 72.9673 299.068 55.7883 280.489 46.7044L198.9 6.81289Z"
        fill="url(#teacher-logo-lg)"
      />
    </svg>
  );
}

export default function TeacherHeader({ isDarkTheme = true, onToggleTheme }: Props) {
  const navigate = useNavigate();
  const { t } = useUserPreferences();
  const { user, clearUser } = useAuthUser();
  const theme = getTheme(isDarkTheme);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = user?.full_name || user?.email || t("roles.user");
  const initials = initialsFromName(displayName);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-teacher-profile]")) setMenuOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/search/code?q=${encodeURIComponent(q)}`);
  }

  function onLogout() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  return (
    <header
      className="shrink-0 border-b z-10"
      style={{ backgroundColor: theme.bg2, borderColor: theme.border, height: 56 }}
    >
      <div className="flex h-full items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <GitMtuciLogo />
            <span className="text-base font-semibold" style={{ color: theme.text }}>
              git<span style={{ color: theme.accent2 }}>мтуси</span>
            </span>
          </Link>
          <div className="h-[18px] w-px shrink-0" style={{ backgroundColor: theme.border }} />
          <span
            className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{
              color: "#a78bfa",
              backgroundColor: "rgba(167,139,250,0.1)",
              borderColor: "rgba(167,139,250,0.3)",
            }}
          >
            {t("roles.teacher")}
          </span>
        </div>

        <form
          onSubmit={onSearch}
          className="hidden md:flex items-center gap-2 rounded-[8px] border px-3.5 py-2 w-[280px]"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("teacher.header.searchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: theme.text2 }}
          />
          <span
            className="shrink-0 rounded border px-1.5 text-[10px]"
            style={{ color: theme.text3, borderColor: theme.border }}
          >
            ⌘K
          </span>
        </form>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
            title={isDarkTheme ? t("header.themeToLight") : t("header.themeToDark")}
          >
            {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <NotificationBell isDarkTheme={isDarkTheme} />

          <div className="relative" data-teacher-profile>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-lg border px-3 py-1.5"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)" }}
              >
                {initials}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-sm font-medium leading-tight" style={{ color: theme.text }}>
                  {displayName}
                </div>
                <div className="text-xs leading-tight" style={{ color: theme.text2 }}>
                  {t("roles.teacher")}
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 hidden sm:block" style={{ color: theme.text2 }} />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 mt-1 w-52 rounded-lg border py-1 z-50 shadow-xl"
                style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
              >
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs"
                  style={{ color: theme.text2 }}
                >
                  <User className="h-3.5 w-3.5" />
                  {t("header.profile")}
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs"
                  style={{ color: theme.text2 }}
                >
                  {t("sidebar.settings")}
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs"
                  style={{ color: theme.danger }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("header.logout")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
