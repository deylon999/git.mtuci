import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  BellOff,
  CheckCircle2,
  Database,
  Info,
  Lock,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { AdminNotificationItem } from "../api/types";
import {
  approveUser,
  clearReadAdminNotifications,
  getAdminNotifications,
  getAdminNotificationsStats,
  rejectUser,
} from "../api/adminApi";
import { markAllNotificationsAsRead, markNotificationAsRead } from "../api/notificationsApi";
import { redeliverWebhook } from "../api/repoSettingsApi";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmModal from "../components/ConfirmModal";
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { currentLocaleTag } from "../utils/dates";

type Props = {
  isDarkTheme?: boolean;
};

type FilterTab = "all" | "unread" | "users" | "system" | "security";
type NotificationAction = AdminNotificationItem["actions"][number];

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const P = "admin.notificationsPage";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isToday(date: Date): boolean {
  return startOfDay(date) === startOfDay(new Date());
}

function isYesterday(date: Date): boolean {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / dayMs) === 1;
}

function formatDateOnly(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Today: "5 minutes ago"; yesterday: caller adds the time; up to 30 days: "3 days ago"; older: full date. */
function formatRelativeTime(value: string, locale: string, yesterdayLabel: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });

  if (isToday(date)) {
    if (diffMs < hourMs) return rtf.format(-Math.max(1, Math.floor(diffMs / minuteMs)), "minute");
    return rtf.format(-Math.max(1, Math.floor(diffMs / hourMs)), "hour");
  }
  if (isYesterday(date)) return `${yesterdayLabel}, ${formatTime(date, locale)}`;
  if (diffMs <= 30 * dayMs) return rtf.format(-Math.max(2, Math.round((startOfDay(new Date()) - startOfDay(date)) / dayMs)), "day");
  return formatDateOnly(value, locale);
}

function iconByItem(item: AdminNotificationItem) {
  if (item.category === "users") return UserPlus;
  if (item.category === "security") return Lock;
  const title = item.title.toLowerCase();
  if (title.includes("вебхук") || title.includes("webhook")) return Upload;
  if (title.includes("диск") || title.includes("disk")) return Database;
  if (item.severity === "critical") return AlertOctagon;
  if (item.severity === "warning") return AlertTriangle;
  if (item.severity === "success") return CheckCircle2;
  return Info;
}

function iconColorBySeverity(severity: AdminNotificationItem["severity"]) {
  if (severity === "critical") return "text-red-500 bg-red-500/10";
  if (severity === "warning") return "text-yellow-500 bg-yellow-500/10";
  if (severity === "success") return "text-green-500 bg-green-500/10";
  return "text-blue-500 bg-blue-500/10";
}

function unreadStripeClass(color: AdminNotificationItem["unread_color"]) {
  if (color === "red") return "border-l-red-500";
  if (color === "yellow") return "border-l-yellow-500";
  return "border-l-blue-500";
}

function unreadDotClass(color: AdminNotificationItem["unread_color"]) {
  if (color === "red") return "bg-red-500";
  if (color === "yellow") return "bg-yellow-500";
  return "bg-blue-500";
}

function severityTagClass(severity: AdminNotificationItem["severity"]): string {
  if (severity === "critical") return "bg-red-500/15 text-red-500";
  if (severity === "warning") return "bg-yellow-500/15 text-yellow-600";
  if (severity === "success") return "bg-green-500/15 text-green-600";
  return "bg-blue-500/15 text-blue-500";
}

export default function AdminNotificationsPage({ isDarkTheme = true }: Props) {
  const { t } = useUserPreferences();
  const navigate = useNavigate();
  const ui = getAdminPageTheme(isDarkTheme);
  const dateLocale = currentLocaleTag();

  const [tab, setTab] = useState<FilterTab>("all");
  const [searchText, setSearchText] = useState("");
  const [currentQuery, setCurrentQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [pendingReject, setPendingReject] = useState<{ item: AdminNotificationItem; action: NotificationAction } | null>(
    null,
  );
  const [tabCounts, setTabCounts] = useState<Record<FilterTab, number>>({
    all: 0,
    unread: 0,
    users: 0,
    system: 0,
    security: 0,
  });
  const [stats, setStats] = useState({ total: 0, unread: 0, actionRequired: 0, critical: 0 });
  const requestIdRef = useRef(0);

  // Debounce the search box; a new query always starts from the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchText.trim();
      setCurrentQuery((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const listQuery = {
        page,
        limit: PAGE_SIZE,
        q: currentQuery || undefined,
        ...(tab === "unread" ? { unread: true } : {}),
        ...(tab === "users" || tab === "system" || tab === "security" ? { category: tab } : {}),
      };
      const [listRes, statsRes] = await Promise.all([
        getAdminNotifications(listQuery),
        getAdminNotificationsStats(currentQuery || undefined),
      ]);
      if (requestId !== requestIdRef.current) return;

      setLoadFailed(false);
      setItems(listRes.items);
      setTotal(listRes.total);
      setPages(Math.max(1, listRes.pages));
      setStats({
        total: statsRes.total,
        unread: statsRes.unread,
        actionRequired: statsRes.action_required,
        critical: statsRes.critical,
      });
      setTabCounts({
        all: statsRes.total,
        unread: statsRes.unread,
        users: statsRes.users,
        system: statsRes.system,
        security: statsRes.security,
      });
    } catch {
      if (requestId === requestIdRef.current) setLoadFailed(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, tab, currentQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const groups: Record<"today" | "yesterday" | "earlier", AdminNotificationItem[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const item of items) {
      const date = new Date(item.created_at);
      const key = Number.isNaN(date.getTime()) ? "earlier" : isToday(date) ? "today" : isYesterday(date) ? "yesterday" : "earlier";
      groups[key].push(item);
    }
    return (["today", "yesterday", "earlier"] as const)
      .filter((key) => groups[key].length > 0)
      .map((key) => ({
        key,
        label:
          key === "earlier"
            ? t(`${P}.earlier`)
            : `${t(`${P}.${key}`)} — ${formatDateOnly(groups[key][0].created_at, dateLocale)}`,
        entries: groups[key],
      }));
  }, [items, t, dateLocale]);

  const handleMarkRead = useCallback(
    async (item: AdminNotificationItem) => {
      if (item.read || item.virtual) return;
      try {
        await markNotificationAsRead(item.id);
        setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, read: true, unread_color: null } : entry)));
        setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        setTabCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
      } catch {
        toast.error(t(`${P}.markReadError`));
      }
    },
    [t],
  );

  const runAction = useCallback(
    async (item: AdminNotificationItem, action: NotificationAction) => {
      if (action.kind !== "approve_user" && action.kind !== "reject_user" && action.kind !== "retry_webhook") {
        const href = action.href ?? item.href;
        if (href) navigate(href);
        return;
      }
      if (busy) return;
      setBusy(true);
      try {
        if (action.kind === "approve_user") {
          const userId = action.payload?.user_id;
          if (!userId) throw new Error("Missing user_id");
          await approveUser(userId);
        } else if (action.kind === "reject_user") {
          const userId = action.payload?.user_id;
          if (!userId) throw new Error("Missing user_id");
          await rejectUser(userId);
        } else {
          const repoId = action.payload?.repo_id;
          const webhookId = action.payload?.webhook_id;
          if (!repoId || !webhookId) throw new Error("Missing webhook payload");
          await redeliverWebhook(repoId, webhookId);
        }
        toast.success(t(`${P}.actionDone`));
        await load();
      } catch {
        toast.error(t(`${P}.actionError`));
      } finally {
        setBusy(false);
        setPendingReject(null);
      }
    },
    [busy, navigate, load, t],
  );

  const handleAction = (item: AdminNotificationItem, action: NotificationAction) => {
    if (action.kind === "reject_user") {
      setPendingReject({ item, action });
      return;
    }
    void runAction(item, action);
  };

  const runBulk = async (request: () => Promise<unknown>, doneKey: string, errorKey: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await request();
      toast.success(t(`${P}.${doneKey}`));
      await load();
    } catch {
      toast.error(t(`${P}.${errorKey}`));
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = (action: NotificationAction) => {
    if (action.kind === "open_link") return t(`${P}.open`);
    if (action.kind === "approve_user") return t(`${P}.approve`);
    if (action.kind === "reject_user") return t(`${P}.reject`);
    if (action.kind === "retry_webhook") return t(`${P}.retry`);
    return action.label;
  };

  const shown = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);
  const headerActionBtnClass = `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ui.cardBg} ${ui.cardHover} ${ui.textPrimary}`;
  const tabHover = isDarkTheme ? "hover:text-white" : "hover:text-slate-900";

  const tabMeta: FilterTab[] = ["all", "unread", "users", "system", "security"];
  const statCards = [
    { key: "total", value: stats.total, stripe: "bg-blue-500", valueClass: ui.textPrimary },
    { key: "unread", value: stats.unread, stripe: "bg-blue-500", valueClass: "text-blue-500" },
    { key: "actionRequired", value: stats.actionRequired, stripe: "bg-yellow-500", valueClass: "text-yellow-500" },
    { key: "critical", value: stats.critical, stripe: "bg-red-500", valueClass: "text-red-500" },
  ] as const;

  return (
    <div className={`w-full min-h-screen transition-colors ${ui.pageWrapper}`}>
      <div className="w-full max-w-full mx-auto px-4 py-5 sm:px-5 space-y-5">
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.dashboard.notifications")}
          subtitle={t(`${P}.subtitle`)}
          subtitleBelow
          actions={
            <>
              <button
                type="button"
                onClick={() => void runBulk(markAllNotificationsAsRead, "readAllDone", "readAllError")}
                disabled={busy || stats.unread === 0}
                className={headerActionBtnClass}
              >
                {t(`${P}.readAll`)}
              </button>
              <button
                type="button"
                onClick={() => void runBulk(clearReadAdminNotifications, "clearReadDone", "clearReadError")}
                disabled={busy}
                className={headerActionBtnClass}
              >
                {t(`${P}.clearRead`)}
              </button>
            </>
          }
        />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map((card) => (
            <div key={card.key} className={`${ui.cardShell} px-4 py-3 overflow-hidden`}>
              <div className={`-mx-4 -mt-3 mb-3 h-1 ${card.stripe}`} />
              <div className={`text-2xl font-semibold ${card.valueClass}`}>{card.value}</div>
              <div className={`text-xs mt-1 ${ui.textSecondary}`}>{t(`${P}.stat_${card.key}`)}</div>
            </div>
          ))}
        </section>

        <section className="px-1">
          <div className="flex items-center gap-2 flex-wrap">
            {tabMeta.map((key) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    active ? "border-blue-500 bg-blue-500/10 text-blue-500" : `${ui.tableBorder} ${ui.textSecondary} ${tabHover}`
                  }`}
                >
                  <span>{t(`${P}.tab_${key}`)}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-blue-500/20 text-blue-500" : `${ui.iconBg} ${ui.textSecondary}`
                    }`}
                  >
                    {tabCounts[key]}
                  </span>
                </button>
              );
            })}
            <label className={`w-full sm:w-auto sm:ml-auto flex items-center gap-2 rounded-md border px-3 py-1.5 ${ui.tableBorder}`}>
              <Search className={`h-3.5 w-3.5 shrink-0 ${ui.textTertiary}`} />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t(`${P}.searchPlaceholder`)}
                aria-label={t(`${P}.searchPlaceholder`)}
                className={`w-full sm:w-[200px] bg-transparent outline-none text-xs ${ui.textPrimary}`}
              />
            </label>
          </div>
        </section>

        <section>
          {loading && items.length === 0 ? (
            <div className={`text-sm ${ui.textSecondary}`}>{t("common.loading")}</div>
          ) : loadFailed && items.length === 0 ? (
            <div className={`text-sm ${ui.textSecondary}`}>
              {t(`${P}.loadError`)}{" "}
              <button type="button" onClick={() => void load()} className="text-blue-500 hover:underline">
                {t(`${P}.retry`)}
              </button>
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <BellOff className={`h-10 w-10 mb-3 ${ui.textTertiary}`} />
              <p className={`text-sm ${ui.textSecondary}`}>{t(`${P}.empty`)}</p>
            </div>
          ) : (
            <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
              {grouped.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className={`px-1 text-[11px] uppercase tracking-wide ${ui.textTertiary}`}>{group.label}</div>
                  <div className={`rounded-xl border overflow-hidden ${ui.tableBorder} ${ui.tableBg}`}>
                    {group.entries.map((item, idx) => {
                      const Icon = iconByItem(item);
                      const rowBorder = !item.read ? unreadStripeClass(item.unread_color) : "border-l-transparent";
                      return (
                        <article
                          key={`${item.id}-${idx}`}
                          onClick={() => void handleMarkRead(item)}
                          className={`group flex flex-wrap sm:flex-nowrap items-start gap-3 px-4 py-3 border-l-[3px] transition-colors ${ui.tableRowHover} ${rowBorder} ${
                            idx > 0 ? `border-t ${ui.tableBorder}` : ""
                          }`}
                        >
                          <div className={`mt-0.5 w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${iconColorBySeverity(item.severity)}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <p className={`text-sm font-medium flex-1 ${ui.textPrimary}`}>{item.title}</p>
                              {!item.read && (
                                <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${unreadDotClass(item.unread_color)}`} />
                              )}
                            </div>
                            <p className={`text-xs mt-1 leading-relaxed break-words ${ui.textSecondary}`}>{item.message}</p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] ${ui.textTertiary}`}>
                                {formatRelativeTime(item.created_at, dateLocale, t(`${P}.yesterday`).toLowerCase())}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${severityTagClass(item.severity)}`}>
                                {t(`${P}.severity_${item.severity}`)}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${ui.iconBg} ${ui.textSecondary}`}>
                                {t(`${P}.tab_${item.category === "users" || item.category === "security" ? item.category : "system"}`)}
                              </span>
                            </div>
                          </div>
                          {item.actions.length > 0 ? (
                            <div className="w-full sm:w-auto shrink-0 flex flex-wrap sm:justify-end gap-1 pl-12 sm:pl-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                              {item.actions.map((action, actionIdx) => (
                                <button
                                  key={`${item.id}-${action.kind}-${actionIdx}`}
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(item, action);
                                  }}
                                  className={`px-2 py-1 rounded-md text-[11px] border disabled:opacity-50 ${
                                    action.kind === "approve_user"
                                      ? "text-green-500 border-green-500/30 hover:bg-green-500/10"
                                      : action.kind === "reject_user"
                                        ? "text-red-500 border-red-500/30 hover:bg-red-500/10"
                                        : `${ui.tableBorder} ${ui.textPrimary} ${ui.tableRowHover}`
                                  }`}
                                >
                                  {actionLabel(action)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-2">
          <div className={`text-xs ${ui.textSecondary}`}>
            {t(`${P}.shown`).replace("{shown}", String(shown)).replace("{total}", String(total))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              aria-label={t(`${P}.prevPage`)}
              className="h-8 min-w-[32px] px-2 rounded-md border border-[#2563eb] bg-[#2563eb] text-xs text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 disabled:hover:bg-[#2563eb]"
            >
              {"<"}
            </button>
            <span className="text-xs px-2 text-[#2563eb]">
              {t(`${P}.page`)} {page}/{pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
              disabled={page >= pages}
              aria-label={t(`${P}.nextPage`)}
              className="h-8 min-w-[32px] px-2 rounded-md border border-[#2563eb] bg-[#2563eb] text-xs text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 disabled:hover:bg-[#2563eb]"
            >
              {">"}
            </button>
          </div>
        </section>
      </div>

      <ConfirmModal
        isOpen={pendingReject !== null}
        title={t(`${P}.rejectConfirmTitle`)}
        message={t(`${P}.rejectConfirmMessage`)}
        confirmText={t(`${P}.reject`)}
        isDangerous
        isLoading={busy}
        onCancel={() => setPendingReject(null)}
        onConfirm={() => {
          if (pendingReject) void runAction(pendingReject.item, pendingReject.action);
        }}
      />
    </div>
  );
}
