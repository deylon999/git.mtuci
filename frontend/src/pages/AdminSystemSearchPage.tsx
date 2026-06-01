import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Users,
  FolderGit2,
  BookOpen,
  FileText,
  Clock3,
  ChevronRight,
} from "lucide-react";
import { globalSearch, type SearchHit } from "../api/searchApi";
import { getAdminUsers, getLogs } from "../api/adminApi";
import type { AdminUserRead, LogEntry } from "../api/types";
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";

type SearchTab = "all" | "users" | "repositories" | "courses" | "logs";

interface Props {
  isDarkTheme?: boolean;
}

const HISTORY_KEY = "admin_system_search_history_v1";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const normalizedYear = year.replace(/\s*г\.?$/iu, "").trim();
  return [day, month, normalizedYear].filter(Boolean).join(" ");
}

function getDayStart(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatLastSeen(value: string | null | undefined, locale: string, language: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return formatDateOnly(value, locale);

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const dayDiff = Math.floor((getDayStart(now) - getDayStart(date)) / dayMs);
  const isRu = language === "ru";

  if (dayDiff === 0) {
    if (diffMs < hourMs) {
      const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
      return isRu
        ? `${minutes} ${pluralRu(minutes, "минуту", "минуты", "минут")} назад`
        : `${minutes} min ago`;
    }
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return isRu ? `${hours} ${pluralRu(hours, "час", "часа", "часов")} назад` : `${hours} h ago`;
  }

  if (dayDiff === 1) return isRu ? "вчера" : "yesterday";
  if (dayDiff <= 30) {
    return isRu ? `${dayDiff} ${pluralRu(dayDiff, "день", "дня", "дней")} назад` : `${dayDiff} days ago`;
  }
  return formatDateOnly(value, locale);
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

function highlightQueryInTitle(title: string, query: string, className: string): React.ReactNode {
  const q = query.trim();
  if (!q) return title;
  const quotedVariants = [`«${q}»`, `"${q}"`];
  for (const quoted of quotedVariants) {
    const quotedLower = quoted.toLowerCase();
    const titleLowerForQuoted = title.toLowerCase();
    const quotedStart = titleLowerForQuoted.indexOf(quotedLower);
    if (quotedStart >= 0) {
      const quotedEnd = quotedStart + quoted.length;
      return (
        <>
          {title.slice(0, quotedStart)}
          <span className={className}>{title.slice(quotedStart, quotedEnd)}</span>
          {title.slice(quotedEnd)}
        </>
      );
    }
  }

  const titleLower = title.toLowerCase();
  const qLower = q.toLowerCase();
  const start = titleLower.indexOf(qLower);
  if (start < 0) return title;
  const end = start + q.length;
  return (
    <>
      {title.slice(0, start)}
      <span className={className}>{title.slice(start, end)}</span>
      {title.slice(end)}
    </>
  );
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

function parseGroupFromSubtitle(subtitle: string | null): string | null {
  const value = subtitle ?? "";
  const group = value.match(/([А-ЯA-Z]{2,}-?\d{1,3})/u);
  return group?.[1] ?? null;
}

function parseEmailFromSubtitle(subtitle: string | null): string | null {
  const value = subtitle ?? "";
  const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  return email?.[0] ?? null;
}

function parseCountFromText(value: string | null, patterns: RegExp[]): number | null {
  const text = value ?? "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatRepoCount(value: number, language: string): string {
  if (language === "ru") {
    return `${value} ${pluralRu(value, "репозиторий", "репозитория", "репозиториев")}`;
  }
  return `${value} ${value === 1 ? "repository" : "repositories"}`;
}

function formatCommitCount(value: number, language: string): string {
  if (language === "ru") {
    return `${value} ${pluralRu(value, "коммит", "коммита", "коммитов")}`;
  }
  return `${value} ${value === 1 ? "commit" : "commits"}`;
}

function formatForkCount(value: number, language: string): string {
  if (language === "ru") {
    return `${value} ${pluralRu(value, "форк", "форка", "форков")}`;
  }
  return `${value} ${value === 1 ? "fork" : "forks"}`;
}

function formatRepoVisibility(value: string | null | undefined, language: string): string {
  const normalized = (value ?? "").toLowerCase();
  if (language === "ru") {
    if (normalized === "private") return "Private";
    if (normalized === "course") return "Course";
    return "Public";
  }
  if (normalized === "private") return "Private";
  if (normalized === "course") return "Course";
  return "Public";
}

function formatCourseStatus(value: string | null | undefined, language: string): string {
  const normalized = (value ?? "").toLowerCase();
  if (language === "ru") {
    return normalized === "archived" ? "Архив" : "Активный";
  }
  return normalized === "archived" ? "Archived" : "Active";
}

function formatStudentsCount(value: number, language: string): string {
  if (language === "ru") {
    return `${value} ${pluralRu(value, "студент", "студента", "студентов")}`;
  }
  return `${value} ${value === 1 ? "student" : "students"}`;
}

function formatAssignmentsCount(value: number, language: string): string {
  if (language === "ru") {
    return `${value} ${pluralRu(value, "задание", "задания", "заданий")}`;
  }
  return `${value} ${value === 1 ? "assignment" : "assignments"}`;
}

function getSearchHitTitle(hit: SearchHit): string {
  if (hit.type === "repository") {
    return (hit.display_name ?? "").trim() || hit.title;
  }
  return hit.title;
}

export default function AdminSystemSearchPage({ isDarkTheme = true }: Props) {
  const { t, tp, language } = useUserPreferences();
  const ui = getAdminPageTheme(isDarkTheme);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";

  const queryFromUrl = (params.get("q") ?? "").trim();
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [adminUsersById, setAdminUsersById] = useState<Record<string, AdminUserRead>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [openLogIds, setOpenLogIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setSearchHistory(Array.isArray(parsed) ? parsed.slice(0, 6) : []);
    } catch {
      setSearchHistory([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAdminUsers()
      .then((users) => {
        if (cancelled) return;
        const next: Record<string, AdminUserRead> = {};
        users.forEach((item) => {
          next[item.id] = item;
        });
        setAdminUsersById(next);
      })
      .catch(() => {
        if (!cancelled) setAdminUsersById({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = queryFromUrl.trim();
    if (!q) {
      setHits([]);
      setLogs([]);
      setElapsedMs(0);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      const started = performance.now();
      try {
        const [searchRes, logsRes] = await Promise.all([
          globalSearch(q, 50),
          getLogs({ search: q, sort: "desc" }, { limit: 12, offset: 0 }).catch(() => ({ logs: [], total: 0 })),
        ]);
        if (cancelled) return;
        setHits(searchRes.hits);
        setLogs(logsRes.logs ?? []);
        setElapsedMs(Math.max(1, Math.round(performance.now() - started)));
        setSearchHistory((prev) => {
          const next = [q, ...prev.filter((item) => item !== q)].slice(0, 6);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          return next;
        });
      } catch {
        if (!cancelled) {
          setError(t("admin.search.loadError"));
          setHits([]);
          setLogs([]);
          setElapsedMs(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [queryFromUrl, t]);

  const users = useMemo(() => hits.filter((h) => h.type === "user"), [hits]);
  const repositories = useMemo(() => hits.filter((h) => h.type === "repository"), [hits]);
  const courses = useMemo(() => hits.filter((h) => h.type === "course" || h.type === "assignment"), [hits]);
  const totalCount = users.length + repositories.length + courses.length + logs.length;

  const tabCounts: Record<SearchTab, number> = {
    all: totalCount,
    users: users.length,
    repositories: repositories.length,
    courses: courses.length,
    logs: logs.length,
  };

  const tabList: Array<{ id: SearchTab; label: string }> = [
    { id: "all", label: t("admin.search.tabAll") },
    { id: "users", label: t("admin.search.tabUsers") },
    { id: "repositories", label: t("admin.search.tabRepositories") },
    { id: "courses", label: t("admin.search.tabCourses") },
    { id: "logs", label: t("admin.search.tabLogs") },
  ];

  const markClassName = isDarkTheme
    ? "rounded-sm bg-blue-500/20 px-0.5 text-blue-300"
    : "rounded-sm bg-blue-100 px-0.5 text-blue-700";
  const titleQueryClass = isDarkTheme ? "text-blue-400" : "text-blue-700";
  const tipNeutralClass = isDarkTheme ? "text-white" : "text-slate-900";
  const tipBlueClass = isDarkTheme ? "text-blue-400" : "text-blue-700";
  const tipErrorClass = isDarkTheme ? "text-red-400" : "text-red-700";
  const tipWarningClass = isDarkTheme ? "text-amber-300" : "text-amber-700";

  const showUsers = activeTab === "all" || activeTab === "users";
  const showRepos = activeTab === "all" || activeTab === "repositories";
  const showCourses = activeTab === "all" || activeTab === "courses";
  const showLogs = activeTab === "all" || activeTab === "logs";

  const sectionCard = `${ui.tableBg} border ${ui.tableBorder}`;
  const rightCardHead = `${ui.cardBg} border-b ${ui.tableBorder}`;
  const sectionCountClass = isDarkTheme
    ? "ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] normal-case bg-[#2d2d2d] text-[#8b949e]"
    : "ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] normal-case bg-slate-200 text-slate-700";

  const quickLinks = [
    users[0]
      ? {
          label: tp("admin.search.quickOpenUser", { name: users[0].title }),
          to: users[0].href,
        }
      : null,
    repositories[0]
      ? {
          label: tp("admin.search.quickOpenRepo", { name: getSearchHitTitle(repositories[0]) }),
          to: repositories[0].href,
        }
      : null,
    logs[0]
      ? {
          label: tp("admin.search.quickOpenLogs", { source: logs[0].source }),
          to: "/logs",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; to: string }>;

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLElement>, href: string): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate(href);
    }
  };

  const getLogDetailText = (log: LogEntry): string => {
    type RecordLike = Record<string, unknown>;
    const isRu = language === "ru";

    const asRecord = (value: unknown): RecordLike | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      return value as RecordLike;
    };

    const valueToText = (value: unknown): string | null => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return null;
    };

    const parseJsonIfPossible = (value: unknown): unknown => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    };

    const candidateRecords: RecordLike[] = [];
    const pushRecord = (value: unknown): void => {
      const record = asRecord(value);
      if (!record) return;
      candidateRecords.push(record);
      [record.data, record.payload, record.context, record.meta, record.metadata].forEach((nested) => {
        const nestedRecord = asRecord(nested);
        if (nestedRecord) candidateRecords.push(nestedRecord);
      });
    };

    const parsedValues = [
      parseJsonIfPossible(log.details),
      parseJsonIfPossible(log.payload),
      parseJsonIfPossible(log.metadata),
      parseJsonIfPossible(log.data),
      parseJsonIfPossible(log.context),
      parseJsonIfPossible(log.detail),
    ];
    parsedValues.forEach((value) => pushRecord(value));

    const firstFromRecords = (...keys: string[]): string | null => {
      for (const record of candidateRecords) {
        for (const key of keys) {
          const value = valueToText(record[key]);
          if (value) return value;
        }
      }
      return null;
    };

    const pickFirst = (...values: Array<unknown>): string | null => {
      for (const value of values) {
        const text = valueToText(value);
        if (text) return text;
      }
      return null;
    };

    const formatMaybeDate = (value: string | null): string => {
      if (!value) return "—";
      const formatted = formatDate(value, dateLocale);
      return formatted === "—" ? value : formatted;
    };

    const userId = pickFirst(log.user_id, firstFromRecords("user_id", "userId", "uid")) ?? "—";
    const ipAddress = pickFirst(log.ip_address, firstFromRecords("ip_address", "ip", "client_ip", "ipAddress")) ?? "—";
    const userAgent = pickFirst(log.user_agent, firstFromRecords("user_agent", "userAgent", "ua")) ?? "—";
    const statusText = pickFirst(log.http_status, firstFromRecords("http_status", "status", "status_code", "error_status")) ?? "—";
    const actionText =
      pickFirst(log.action, firstFromRecords("action", "event", "operation", "type")) ??
      (statusText !== "—" ? `HTTP ${statusText}` : "—");
    const timestamp = pickFirst(log.timestamp, log.created_at, firstFromRecords("timestamp", "created_at", "time", "date"));
    const repoText =
      pickFirst(
        log.repo,
        log.repository,
        log.source_repo,
        firstFromRecords("repo", "repository", "repo_name", "repository_name", "source_repo", "gitea_repo_name"),
      ) ?? "—";

    const userEmail = pickFirst(log.user_email, firstFromRecords("user_email", "email"));
    const requestId = pickFirst(log.request_id, firstFromRecords("request_id", "requestId", "trace_id", "traceId"));
    const method = pickFirst(log.method, firstFromRecords("method", "http_method"));
    const path = pickFirst(log.path, firstFromRecords("path", "endpoint", "url", "route"));
    const routeText = method && path ? `${method} ${path}` : method ?? path;

    const lines = [
      `user_id: ${userId}`,
      `ip_address: ${ipAddress}`,
      `user_agent: ${userAgent}`,
      `action: ${actionText}`,
      `status: ${statusText}`,
      `timestamp: ${formatMaybeDate(timestamp)}`,
      ...(repoText !== "—" ? [`repo: ${repoText}`] : []),
      `source: ${log.source}`,
      `level: ${log.level}`,
      ...(userEmail ? [`user_email: ${userEmail}`] : []),
      ...(routeText ? [`route: ${routeText}`] : []),
      ...(requestId ? [`request_id: ${requestId}`] : []),
      `${isRu ? "сообщение" : "message"}: ${log.message}`,
    ];

    const rawDetail = typeof log.detail === "string" ? log.detail.trim() : "";
    const detailParsedAsRecord = asRecord(parseJsonIfPossible(log.detail));
    if (rawDetail && !detailParsedAsRecord && rawDetail !== log.message) {
      lines.push("", `${isRu ? "detail" : "detail"}:`, rawDetail);
    }

    return lines.join("\n");
  };

  return (
    <div className={`h-full overflow-y-auto ${ui.pageWrapper}`}>
      <div className="w-full max-w-none mx-auto py-6 px-6 space-y-5 pb-20">
        <div>
          <h1 className={`text-xl font-semibold ${ui.tableNameText}`}>
            {highlightQueryInTitle(tp("admin.search.title", { query: queryFromUrl || "…" }), queryFromUrl, titleQueryClass)}
          </h1>
          <p className={`text-sm mt-1 ${ui.tableHeaderText}`}>
            {loading ? t("common.loading") : tp("admin.search.total", { n: totalCount, ms: elapsedMs })}
          </p>
          {error ? <p className="text-sm text-red-400 mt-2">{error}</p> : null}
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {tabList.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? isDarkTheme
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                      : "bg-blue-100 text-blue-700 border-blue-200"
                    : `${ui.tableBorder} ${ui.tableCellText} ${ui.tableRowHover}`
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                    active
                      ? isDarkTheme
                        ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                        : "bg-blue-100 text-blue-700 border-blue-300"
                      : isDarkTheme
                      ? "bg-[#2d2d2d] text-[#8b949e] border-[#2d2d2d]"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}
                >
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5 items-start">
          <div className="space-y-5">
            {showUsers ? (
              <section className="space-y-3">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${ui.tableHeaderText}`}>
                  {t("admin.search.tabUsers")} <span className={sectionCountClass}>{users.length}</span>
                </h2>
                {users.length === 0 ? (
                  <div className={`${sectionCard} rounded-xl p-5 text-sm ${ui.tableCellText}`}>{t("admin.search.emptyUsers")}</div>
                ) : (
                  users.map((hit) => {
                    const fullUser = adminUsersById[hit.id];
                    const role = fullUser?.role ?? parseRoleFromSubtitle(hit.subtitle);
                    const email = fullUser?.email ?? parseEmailFromSubtitle(hit.subtitle) ?? hit.subtitle ?? "—";
                    const group = fullUser?.group_name ?? parseGroupFromSubtitle(hit.subtitle);
                    const showGroup = (role === "student" || role === "laborant") && Boolean(group);
                    const registeredText = fullUser?.created_at ? formatDateOnly(fullUser.created_at, dateLocale) : "—";
                    const lastSeenText = formatLastSeen(fullUser?.last_login, dateLocale, language);
                    const repositoriesCount =
                      fullUser?.repositories_count ??
                      parseCountFromText(hit.subtitle, [/(?:^|\s)(\d+)\s*(?:репозитор(?:ий|ия|иев)|repositories?|repos?)\b/iu]) ??
                      0;
                    const commitsCount =
                      parseCountFromText(hit.subtitle, [/(?:^|\s)(\d+)\s*(?:коммит(?:а|ов)?|commits?)\b/iu]) ?? 0;
                    const repoCommitsText = `${formatRepoCount(repositoriesCount, language)} · ${formatCommitCount(commitsCount, language)}`;
                    const daysSinceLastLogin = fullUser?.last_login
                      ? Math.floor((getDayStart(new Date()) - getDayStart(new Date(fullUser.last_login))) / (24 * 60 * 60 * 1000))
                      : Number.POSITIVE_INFINITY;
                    const isUserActive = !fullUser?.is_blocked && daysSinceLastLogin <= 7;
                    const statusLabel = language === "ru" ? (isUserActive ? "Активен" : "Неактивен") : isUserActive ? "Active" : "Inactive";
                    const statusBadgeClass = isUserActive
                      ? isDarkTheme
                        ? "bg-green-500/20 text-green-400"
                        : "bg-green-100 text-green-700"
                      : isDarkTheme
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-amber-100 text-amber-700";
                    const subtitleText = `${email}${showGroup ? ` · ${t("admin.users.colGroup")} ${group}` : ""} · ${t("admin.search.registeredShort")} ${registeredText}`;
                    return (
                      <article
                        key={`${hit.type}-${hit.id}`}
                        className={`${sectionCard} rounded-xl p-4 flex items-start gap-3 hover:border-blue-500/40 transition-colors cursor-pointer`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(hit.href)}
                        onKeyDown={(event) => handleCardKeyDown(event, hit.href)}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-sm font-medium truncate ${ui.tableNameText}`}>
                            {highlightText(hit.title, queryFromUrl, markClassName)}
                          </h3>
                          <p className={`text-xs mt-1 truncate ${ui.tableHeaderText}`}>
                            {highlightText(subtitleText, queryFromUrl, markClassName)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${roleBadgeClass(role, isDarkTheme)}`}>
                              {roleLabel(role, t)}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{repoCommitsText}</span>
                          </div>
                        </div>
                        <div className="self-center shrink-0 min-w-[120px] flex flex-col items-end justify-between">
                          <button
                            type="button"
                            className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs ${ui.tableBorder} ${ui.tableNameText}`}
                          >
                            {t("admin.search.open")}
                          </button>
                          <span className={`mt-1.5 text-[10px] text-right ${ui.tableHeaderText}`}>{lastSeenText}</span>
                        </div>
                      </article>
                    );
                  })
                )}
              </section>
            ) : null}

            {showRepos ? (
              <section className="space-y-3">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${ui.tableHeaderText}`}>
                  {t("admin.search.tabRepositories")} <span className={sectionCountClass}>{repositories.length}</span>
                </h2>
                {repositories.length === 0 ? (
                  <div className={`${sectionCard} rounded-xl p-5 text-sm ${ui.tableCellText}`}>{t("admin.search.emptyRepositories")}</div>
                ) : (
                  repositories.map((hit) => {
                    const commitsCount = Number.isFinite(hit.repo_commits_count as number) ? Number(hit.repo_commits_count) : 0;
                    const forksCount = Number.isFinite(hit.repo_forks_count as number) ? Number(hit.repo_forks_count) : 0;
                    const languageLabel = (hit.repo_language ?? "").trim() || "—";
                    const visibilityLabel = formatRepoVisibility(hit.repo_visibility, language);
                    const visibilityBadgeClass =
                      hit.repo_visibility === "private"
                        ? isDarkTheme
                          ? "bg-red-500/20 text-red-400"
                          : "bg-red-100 text-red-700"
                        : hit.repo_visibility === "course"
                        ? isDarkTheme
                          ? "bg-violet-500/20 text-violet-400"
                          : "bg-violet-100 text-violet-700"
                        : isDarkTheme
                        ? "bg-[#2d2d2d] text-[#ccd0d4]"
                        : "bg-slate-200 text-slate-700";
                    const repoDescription = (hit.repo_description ?? hit.subtitle ?? "—").trim() || "—";
                    const lastRepoActivityText = formatLastSeen(hit.repo_pushed_at ?? hit.repo_updated_at, dateLocale, language);

                    return (
                      <article
                        key={`${hit.type}-${hit.id}`}
                        className={`${sectionCard} rounded-xl p-4 flex items-start gap-3 hover:border-blue-500/40 transition-colors cursor-pointer`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(hit.href)}
                        onKeyDown={(event) => handleCardKeyDown(event, hit.href)}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkTheme ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>
                          <FolderGit2 className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-sm font-medium truncate ${ui.tableNameText}`}>
                            {highlightText(getSearchHitTitle(hit), queryFromUrl, markClassName)}
                          </h3>
                          <p className={`text-xs mt-1 truncate ${ui.tableHeaderText}`}>
                            {highlightText(repoDescription, queryFromUrl, markClassName)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{languageLabel}</span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{formatCommitCount(commitsCount, language)}</span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{formatForkCount(forksCount, language)}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${visibilityBadgeClass}`}>
                              {visibilityLabel}
                            </span>
                          </div>
                        </div>
                        <div className="self-center shrink-0 min-w-[120px] flex flex-col items-end justify-between">
                          <button
                            type="button"
                            className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs ${ui.tableBorder} ${ui.tableNameText}`}
                          >
                            {t("admin.search.open")}
                          </button>
                          <span className={`mt-1.5 text-[10px] text-right ${ui.tableHeaderText}`}>{lastRepoActivityText}</span>
                        </div>
                      </article>
                    );
                  })
                )}
              </section>
            ) : null}

            {showCourses ? (
              <section className="space-y-3">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${ui.tableHeaderText}`}>
                  {t("admin.search.tabCourses")} <span className={sectionCountClass}>{courses.length}</span>
                </h2>
                {courses.length === 0 ? (
                  <div className={`${sectionCard} rounded-xl p-8 text-center`}>
                    <BookOpen className={`h-8 w-8 mx-auto ${ui.tableHeaderText}`} />
                    <p className={`text-sm mt-2 ${ui.tableCellText}`}>{t("admin.search.emptyCourses")}</p>
                  </div>
                ) : (
                  courses.map((hit) => {
                    if (hit.type !== "course") {
                      return (
                        <article
                          key={`${hit.type}-${hit.id}`}
                          className={`${sectionCard} rounded-xl p-4 flex items-start gap-3 hover:border-blue-500/40 transition-colors cursor-pointer`}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(hit.href)}
                          onKeyDown={(event) => handleCardKeyDown(event, hit.href)}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkTheme ? "bg-violet-500/20 text-violet-400" : "bg-violet-100 text-violet-700"}`}>
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className={`text-sm font-medium truncate ${ui.tableNameText}`}>
                              {highlightText(hit.title, queryFromUrl, markClassName)}
                            </h3>
                            <p className={`text-xs mt-1 truncate ${ui.tableHeaderText}`}>
                              {highlightText(hit.subtitle ?? "—", queryFromUrl, markClassName)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs ${ui.tableBorder} ${ui.tableNameText}`}
                          >
                            {t("admin.search.open")}
                          </button>
                        </article>
                      );
                    }

                    const teacherName = (hit.course_teacher_name ?? "").trim();
                    const groups = Array.isArray(hit.course_groups)
                      ? hit.course_groups.map((group) => group.trim()).filter(Boolean)
                      : [];
                    const subtitleText =
                      [teacherName, groups.length > 0 ? groups.join(", ") : null].filter(Boolean).join(" · ") ||
                      hit.subtitle ||
                      "—";
                    const statusLabel = formatCourseStatus(hit.course_status, language);
                    const statusBadgeClass =
                      (hit.course_status ?? "").toLowerCase() === "archived"
                        ? isDarkTheme
                          ? "bg-[#2d2d2d] text-[#8b949e]"
                          : "bg-slate-200 text-slate-700"
                        : isDarkTheme
                        ? "bg-green-500/20 text-green-400"
                        : "bg-green-100 text-green-700";
                    const assignmentsCount = Number(hit.course_assignments_count ?? 0);
                    const studentsCount = Number(hit.course_students_count ?? 0);
                    const prCount = Number(hit.course_pr_count ?? 0);
                    const nearestDeadline = hit.course_nearest_deadline
                      ? `${t("admin.search.nearestDeadlineShort")} ${formatDateOnly(hit.course_nearest_deadline, dateLocale)}`
                      : t("admin.search.noDeadline");

                    return (
                      <article
                        key={`${hit.type}-${hit.id}`}
                        className={`${sectionCard} rounded-xl p-4 flex items-start gap-3 hover:border-blue-500/40 transition-colors cursor-pointer`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(hit.href)}
                        onKeyDown={(event) => handleCardKeyDown(event, hit.href)}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkTheme ? "bg-violet-500/20 text-violet-400" : "bg-violet-100 text-violet-700"}`}>
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-sm font-medium truncate ${ui.tableNameText}`}>
                            {highlightText(hit.title, queryFromUrl, markClassName)}
                          </h3>
                          <p className={`text-xs mt-1 truncate ${ui.tableHeaderText}`}>
                            {highlightText(subtitleText, queryFromUrl, markClassName)}
                          </p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadgeClass}`}>
                              {statusLabel}
                            </span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{formatAssignmentsCount(assignmentsCount, language)}</span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{formatStudentsCount(studentsCount, language)}</span>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{nearestDeadline}</span>
                          </div>
                        </div>
                        <div className="self-center shrink-0 min-w-[120px] flex flex-col items-end justify-between">
                          <button
                            type="button"
                            className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs ${ui.tableBorder} ${ui.tableNameText}`}
                          >
                            {t("admin.search.open")}
                          </button>
                          {prCount > 0 ? (
                            <span className={`mt-1.5 text-[10px] text-right ${ui.tableHeaderText}`}>
                              {tp("admin.search.coursePrCount", { n: prCount })}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </section>
            ) : null}

            {showLogs ? (
              <section className="space-y-3">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${ui.tableHeaderText}`}>
                  {t("admin.search.tabLogs")} <span className={sectionCountClass}>{logs.length}</span>
                </h2>
                {logs.length === 0 ? (
                  <div className={`${sectionCard} rounded-xl p-5 text-sm ${ui.tableCellText}`}>{t("admin.search.emptyLogs")}</div>
                ) : (
                  logs.map((log) => {
                    const isOpen = Boolean(openLogIds[log.id]);
                    const levelClass =
                      log.level === "ERROR"
                        ? isDarkTheme
                          ? "bg-red-500/20 text-red-400"
                          : "bg-red-100 text-red-700"
                        : log.level === "WARNING"
                        ? isDarkTheme
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-amber-100 text-amber-700"
                        : isDarkTheme
                        ? "bg-green-500/20 text-green-400"
                        : "bg-green-100 text-green-700";
                    const logDotClass =
                      log.level === "ERROR"
                        ? isDarkTheme
                          ? "bg-red-400"
                          : "bg-red-500"
                        : log.level === "WARNING"
                        ? isDarkTheme
                          ? "bg-amber-300"
                          : "bg-amber-500"
                        : isDarkTheme
                        ? "bg-green-400"
                        : "bg-green-500";
                    return (
                      <article key={log.id} className={`${sectionCard} rounded-xl overflow-hidden hover:border-blue-500/40 transition-colors`}>
                        <button
                          type="button"
                          onClick={() => setOpenLogIds((prev) => ({ ...prev, [log.id]: !isOpen }))}
                          className="w-full text-left p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${logDotClass}`} />
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${levelClass}`}>
                              {log.level}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${isDarkTheme ? "bg-[#2d2d2d] text-[#8b949e]" : "bg-gray-100 text-gray-600"}`}>
                              {log.source}
                            </span>
                            <p className={`text-xs flex-1 truncate ${ui.tableNameText}`}>
                              {highlightText(log.message, queryFromUrl, markClassName)}
                            </p>
                            <span className={`text-[10px] ${ui.tableHeaderText}`}>{formatDate(log.created_at, dateLocale)}</span>
                          </div>
                        </button>
                        {isOpen ? (
                          <div className={`px-3 pb-3 text-xs font-mono whitespace-pre-wrap ${ui.tableCellText}`}>
                            {getLogDetailText(log)}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </section>
            ) : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-2">
            <section className={`${sectionCard} rounded-xl overflow-hidden`}>
              <div className={`px-3 py-2 text-xs font-semibold ${rightCardHead} ${ui.tableNameText}`}>
                {t("admin.search.statsTitle")}
              </div>
              <div className="px-3 text-xs">
                {[
                  { label: t("admin.search.query"), value: queryFromUrl || "—", kind: "query" as const },
                  { label: t("admin.search.totalLabel"), value: totalCount, kind: "count" as const },
                  { label: t("admin.search.tabUsers"), value: users.length, kind: "count" as const },
                  { label: t("admin.search.tabRepositories"), value: repositories.length, kind: "count" as const },
                  { label: t("admin.search.tabCourses"), value: courses.length, kind: "count" as const },
                  { label: t("admin.search.tabLogs"), value: logs.length, kind: "count" as const },
                  { label: t("admin.search.time"), value: elapsedMs, kind: "count" as const, suffix: " ms" },
                ].map((row, idx, arr) => {
                  const isCount = row.kind === "count";
                  const numericValue = isCount ? Number(row.value) : 0;
                  const valueClass =
                    row.kind === "query"
                      ? isDarkTheme
                        ? "text-blue-400"
                        : "text-blue-700"
                      : numericValue > 0
                      ? isDarkTheme
                        ? "text-white"
                        : "text-slate-900"
                      : ui.tableCellText;

                  return (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between py-2 ${idx < arr.length - 1 ? "border-b" : ""}`}
                      style={idx < arr.length - 1 ? { borderColor: ui.colors.border } : undefined}
                    >
                      <span className={ui.tableHeaderText}>{row.label}</span>
                      <span className={`font-medium ${valueClass}`}>
                        {row.value}
                        {"suffix" in row ? row.suffix : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`${sectionCard} rounded-xl overflow-hidden`}>
              <div className={`px-3 py-2 text-xs font-semibold ${rightCardHead} ${ui.tableNameText}`}>
                {t("admin.search.quickActions")}
              </div>
              <div className="p-2">
                {quickLinks.length === 0 ? (
                  <p className={`px-2 py-2 text-xs ${ui.tableCellText}`}>{t("admin.search.noQuickActions")}</p>
                ) : (
                  quickLinks.map((item, idx) => (
                    <button
                      key={`${item.to}-${idx}`}
                      type="button"
                      onClick={() => navigate(item.to)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs ${ui.tableCellText} ${ui.tableRowHover}`}
                    >
                      <span className="truncate">{item.label}</span>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className={`${sectionCard} rounded-xl overflow-hidden`}>
              <div className={`px-3 py-2 text-xs font-semibold ${rightCardHead} ${ui.tableNameText}`}>
                {t("admin.search.historyTitle")}
              </div>
              <div className="p-2">
                {searchHistory.length === 0 ? (
                  <p className={`px-2 py-2 text-xs ${ui.tableCellText}`}>{t("admin.search.emptyHistory")}</p>
                ) : (
                  searchHistory.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        const nextParams = new URLSearchParams(params);
                        nextParams.set("q", item);
                        setParams(nextParams);
                      }}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${ui.tableCellText} ${ui.tableRowHover}`}
                    >
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item}</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className={`${sectionCard} rounded-xl overflow-hidden`}>
              <div className={`px-3 py-2 text-xs font-semibold ${rightCardHead} ${ui.tableNameText}`}>
                {t("admin.search.tipsTitle")}
              </div>
              <div className={`p-3 space-y-2 text-xs ${ui.tableCellText}`}>
                <p>
                  <span className={`font-medium ${tipNeutralClass}`}>@email</span> {t("admin.search.tipEmailHint")}
                </p>
                <p>
                  <span className={`font-medium ${tipErrorClass}`}>ERROR</span>{" "}
                  <span className={ui.tableCellText}>/</span>{" "}
                  <span className={`font-medium ${tipWarningClass}`}>WARNING</span> {t("admin.search.tipErrorHint")}
                </p>
                <p>
                  <span className={`font-medium ${tipBlueClass}`}>БВТ2401</span> {t("admin.search.tipGroupHint")}
                </p>
                <p>
                  <span className={`font-medium ${tipNeutralClass}`}>repo:</span> {t("admin.search.tipRepoHint")}
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
