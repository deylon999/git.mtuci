import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronDown, LogOut, User, Shield, Activity, Moon, Sun, Users, FolderGit2, FileText, Loader2 } from "lucide-react";
import { clearToken } from "../api/client";
import { useAuthUser } from "../context/AuthUserContext";
import { getLogs, getServiceStatus, locateLogInAdminLogs } from "../api/adminApi";
import { globalSearch, type SearchHit } from "../api/searchApi";
import { getTheme } from "../theme";
import NotificationBell from "./NotificationBell";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { UserRole, LogEntry } from "../api/types";

type LiveSearchMode = "all" | "users" | "repositories" | "logs";

interface LiveSearchIntent {
  mode: LiveSearchMode;
  globalQuery: string | null;
  logsQuery: string | null;
  logsLevel: "ERROR" | "WARNING" | null;
}

const LIVE_GLOBAL_LIMIT = 24;
const LIVE_LOGS_LIMIT = 5;
const LOGS_PAGE_LIMIT = 10;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string, markClassName: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = text.split(re);
  const qLower = q.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === qLower ? (
      <mark key={`${part}-${idx}`} className={markClassName}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    ),
  );
}

function resolveLiveSearchIntent(rawQuery: string): LiveSearchIntent {
  const query = rawQuery.trim();
  if (!query) return { mode: "all", globalQuery: null, logsQuery: null, logsLevel: null };

  if (query.startsWith("@")) {
    const usersQuery = query.slice(1).trim();
    return {
      mode: "users",
      globalQuery: usersQuery || null,
      logsQuery: null,
      logsLevel: null,
    };
  }

  const repoMatch = query.match(/^repo:\s*(.*)$/i);
  if (repoMatch) {
    const repositoriesQuery = repoMatch[1].trim();
    return {
      mode: "repositories",
      globalQuery: repositoriesQuery || null,
      logsQuery: null,
      logsLevel: null,
    };
  }

  const logMatch = query.match(/^(ERROR|WARNING)\b[:\s-]*(.*)$/i);
  if (logMatch) {
    const rest = logMatch[2].trim();
    return {
      mode: "logs",
      globalQuery: null,
      logsQuery: rest || null,
      logsLevel: logMatch[1].toUpperCase() as "ERROR" | "WARNING",
    };
  }

  return {
    mode: "all",
    globalQuery: query,
    logsQuery: query,
    logsLevel: null,
  };
}

function roleBadgeClass(role: string, isDarkTheme: boolean): string {
  if (role === "admin") return isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700";
  if (role === "teacher") return isDarkTheme ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-700";
  if (role === "laborant") return isDarkTheme ? "bg-pink-500/20 text-pink-400" : "bg-pink-100 text-pink-700";
  return isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700";
}

function roleLabel(role: string, t: (key: string) => string): string {
  if (role === "admin") return t("admin.users.roleAdminFull");
  if (role === "teacher") return t("admin.users.roleTeacherFull");
  if (role === "laborant") return t("admin.users.roleLaborantFull");
  return t("admin.users.roleStudentFull");
}

function parseRoleFromSubtitle(subtitle: string | null): string {
  const value = (subtitle ?? "").toLowerCase();
  if (value.includes("admin")) return "admin";
  if (value.includes("преп") || value.includes("teacher")) return "teacher";
  if (value.includes("лаборант") || value.includes("laborant")) return "laborant";
  return "student";
}

function getSearchHitTitle(hit: SearchHit): string {
  if (hit.type === "repository") {
    return (hit.display_name ?? "").trim() || hit.title;
  }
  return hit.title;
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
  const { t, tp, language } = useUserPreferences();
  const { user, clearUser, refreshUser } = useAuthUser();

  const [userName, setUserName] = useState("Admin");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarDisplayMode, setAvatarDisplayMode] = useState<string>("cover");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [liveMode, setLiveMode] = useState<LiveSearchMode>("all");
  const [liveUsers, setLiveUsers] = useState<SearchHit[]>([]);
  const [liveRepositories, setLiveRepositories] = useState<SearchHit[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
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
      if (!target.closest("[data-live-search]")) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    const intent = resolveLiveSearchIntent(query);
    setLiveMode(intent.mode);

    if (!query) {
      setLiveUsers([]);
      setLiveRepositories([]);
      setLiveLogs([]);
      setLiveLoading(false);
      setLiveError(null);
      return;
    }

    if (!intent.globalQuery && !intent.logsQuery && !intent.logsLevel) {
      setLiveUsers([]);
      setLiveRepositories([]);
      setLiveLogs([]);
      setLiveLoading(false);
      setLiveError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLiveLoading(true);
        setLiveError(null);

        let users: SearchHit[] = [];
        let repositories: SearchHit[] = [];
        let logs: LogEntry[] = [];

        const tasks: Promise<void>[] = [];

        if (intent.globalQuery) {
          tasks.push(
            globalSearch(intent.globalQuery, LIVE_GLOBAL_LIMIT).then((res) => {
              users = res.hits.filter((h) => h.type === "user").slice(0, 4);
              repositories = res.hits.filter((h) => h.type === "repository").slice(0, 4);
            }),
          );
        }

        if (intent.mode === "all" || intent.mode === "logs") {
          const filters: { search?: string; level?: "ERROR" | "WARNING"; sort: "desc" } = { sort: "desc" };
          if (intent.logsQuery) filters.search = intent.logsQuery;
          if (intent.logsLevel) filters.level = intent.logsLevel;
          tasks.push(
            getLogs(filters, { limit: LIVE_LOGS_LIMIT, offset: 0 }).then((res) => {
              logs = (res.logs ?? []).slice(0, LIVE_LOGS_LIMIT);
            }),
          );
        }

        const settled = await Promise.allSettled(tasks);
        if (cancelled) return;

        setLiveUsers(users);
        setLiveRepositories(repositories);
        setLiveLogs(logs);
        setLiveError(settled.some((item) => item.status === "rejected") ? t("common.failed") : null);
        setLiveLoading(false);
      })();
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, t]);

  function onLogout() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearchFocused(false);
    navigate(`/admin/search?q=${encodeURIComponent(q)}`);
  }

  const theme = getTheme(isDarkTheme);
  const markClassName = isDarkTheme
    ? "rounded-sm bg-blue-500/20 px-0.5 text-blue-300"
    : "rounded-sm bg-blue-100 px-0.5 text-blue-700";
  const searchIntent = useMemo(() => resolveLiveSearchIntent(searchQuery), [searchQuery]);
  const highlightQuery = searchIntent.globalQuery ?? searchIntent.logsQuery ?? "";
  const showLiveDropdown = isSearchFocused && searchQuery.trim().length > 0;
  const liveHasResults = liveUsers.length > 0 || liveRepositories.length > 0 || liveLogs.length > 0;
  const logTimeLocale = language === "en" ? "en-US" : "ru-RU";
  const liveHoverBg = isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.03)";

  function openSearchResults(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsSearchFocused(false);
    navigate(`/admin/search?q=${encodeURIComponent(trimmed)}`);
  }

  async function openLiveLog(log: LogEntry): Promise<void> {
    const filters: { search?: string; level?: "ERROR" | "WARNING"; sort: "desc" } = { sort: "desc" };
    if (searchIntent.logsQuery) filters.search = searchIntent.logsQuery;
    if (searchIntent.logsLevel) filters.level = searchIntent.logsLevel;

    let targetPage = 1;
    try {
      const located = await locateLogInAdminLogs(log.id, filters, LOGS_PAGE_LIMIT);
      if (located.found) targetPage = located.page;
    } catch {
      targetPage = 1;
    }

    const params = new URLSearchParams();
    params.set("sort", "desc");
    if (filters.search) params.set("search", filters.search);
    if (filters.level) params.set("level", filters.level);

    setIsSearchFocused(false);
    navigate(`/logs?${params.toString()}`, {
      state: { targetPage, highlightLogId: log.id },
    });
  }

  const searchForm = (
    <div className="relative group" data-live-search>
      <form onSubmit={handleSearch}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors" style={{ color: theme.text3 }} />
        <input
          type="text"
          value={searchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsSearchFocused(false);
            }
          }}
          placeholder={t("header.searchAdmin")}
          className="w-full h-9 pl-10 pr-4 rounded-lg text-sm outline-none transition-all duration-200 border focus:ring-2 focus:ring-blue-500/50"
          style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
        />
      </form>

      {showLiveDropdown ? (
        <div
          className="absolute top-[calc(100%+6px)] left-0 right-0 rounded-xl border shadow-xl z-[70] overflow-hidden"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border, boxShadow: theme.shadow }}
        >
          {liveLoading ? (
            <div className="px-3 py-3 flex items-center gap-2 text-xs" style={{ color: theme.text2 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t("header.liveLoading")}</span>
            </div>
          ) : null}

          {!liveLoading && liveError ? (
            <p className="px-3 py-2 text-xs" style={{ color: theme.danger }}>
              {liveError}
            </p>
          ) : null}

          {!liveLoading && !liveError ? (
            <>
              {(liveMode === "all" || liveMode === "users") && liveUsers.length > 0 ? (
                <section className="border-b" style={{ borderColor: theme.border }}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.text3 }}>
                    {t("admin.search.tabUsers")}
                  </div>
                  {liveUsers.map((hit) => {
                    const role = parseRoleFromSubtitle(hit.subtitle);
                    return (
                      <button
                        key={`${hit.type}-${hit.id}`}
                        type="button"
                        onClick={() => {
                          setIsSearchFocused(false);
                          navigate(hit.href);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                        style={{ color: theme.text2 }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = liveHoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate" style={{ color: theme.text }}>
                            {highlightText(getSearchHitTitle(hit), highlightQuery, markClassName)}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: theme.text2 }}>
                            {highlightText(hit.subtitle ?? "—", highlightQuery, markClassName)}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${roleBadgeClass(role, isDarkTheme)}`}>
                          {roleLabel(role, t)}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ) : null}

              {(liveMode === "all" || liveMode === "repositories") && liveRepositories.length > 0 ? (
                <section className="border-b" style={{ borderColor: theme.border }}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.text3 }}>
                    {t("admin.search.tabRepositories")}
                  </div>
                  {liveRepositories.map((hit) => (
                    <button
                      key={`${hit.type}-${hit.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchFocused(false);
                        navigate(hit.href);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{ color: theme.text2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = liveHoverBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isDarkTheme ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                        <FolderGit2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate" style={{ color: theme.text }}>
                          {highlightText(getSearchHitTitle(hit), highlightQuery, markClassName)}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: theme.text2 }}>
                          {highlightText(hit.subtitle ?? "—", highlightQuery, markClassName)}
                        </p>
                      </div>
                    </button>
                  ))}
                </section>
              ) : null}

              {(liveMode === "all" || liveMode === "logs") && liveLogs.length > 0 ? (
                <section className="border-b" style={{ borderColor: theme.border }}>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.text3 }}>
                    {t("admin.search.tabLogs")}
                  </div>
                  {liveLogs.map((log) => {
                    const levelClass =
                      log.level === "ERROR"
                        ? isDarkTheme
                          ? "bg-red-500/20 text-red-400"
                          : "bg-red-100 text-red-700"
                        : isDarkTheme
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-amber-100 text-amber-700";
                    return (
                      <button
                        key={log.id}
                        type="button"
                        onClick={() => {
                          void openLiveLog(log);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                        style={{ color: theme.text2 }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = liveHoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${log.level === "ERROR" ? (isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700") : isDarkTheme ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate font-mono" style={{ color: theme.text }}>
                            {highlightText(log.message, highlightQuery, markClassName)}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: theme.text2 }}>
                            {log.source} · {new Date(log.created_at).toLocaleTimeString(logTimeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium ${levelClass}`}>{log.level}</span>
                      </button>
                    );
                  })}
                </section>
              ) : null}

              {!liveHasResults ? (
                <p className="px-3 py-3 text-xs" style={{ color: theme.text2 }}>
                  {t("header.liveNoResults")}
                </p>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            onClick={() => openSearchResults(searchQuery)}
            className="w-full px-3 py-2.5 text-xs border-t text-left transition-colors"
            style={{ borderColor: theme.border, color: theme.accent2 }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = liveHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {tp("header.liveShowAll", { query: searchQuery.trim() })}
          </button>
        </div>
      ) : null}
    </div>
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
                    <p className="text-xs truncate transition-colors" style={{ color: theme.text2 }}>{userRole || t("common.admin")}</p>
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
