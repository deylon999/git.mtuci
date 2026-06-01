import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";

type Props = {
  isDarkTheme?: boolean;
};

type FilterTab = "all" | "unread" | "users" | "system" | "security";

const PAGE_SIZE = 20;

function pluralRu(value: number, one: string, few: string, many: string): string {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isToday(date: Date): boolean {
  return startOfDay(date) === startOfDay(new Date());
}

function isYesterday(date: Date): boolean {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(now) - startOfDay(date)) / dayMs) === 1;
}

function formatDateOnly(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

function formatRelativeTime(value: string, locale: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (isToday(date)) {
    if (diffMs < hourMs) {
      const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
      return language === "ru"
        ? `${minutes} ${pluralRu(minutes, "минуту", "минуты", "минут")} назад`
        : `${minutes} min ago`;
    }
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return language === "ru"
      ? `${hours} ${pluralRu(hours, "час", "часа", "часов")} назад`
      : `${hours} h ago`;
  }
  if (isYesterday(date)) {
    const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    return language === "ru" ? `вчера, ${time}` : `yesterday, ${time}`;
  }
  if (diffMs <= 30 * dayMs) {
    const days = Math.max(1, Math.floor(diffMs / dayMs));
    return language === "ru"
      ? `${days} ${pluralRu(days, "день", "дня", "дней")} назад`
      : `${days} days ago`;
  }
  return formatDateOnly(value, locale);
}

function iconByItem(item: AdminNotificationItem) {
  if (item.category === "users") return UserPlus;
  if (item.category === "security") return Lock;
  if (item.title.toLowerCase().includes("вебхук") || item.title.toLowerCase().includes("webhook")) return Upload;
  if (item.title.toLowerCase().includes("диск") || item.title.toLowerCase().includes("disk")) return Database;
  if (item.severity === "critical") return AlertOctagon;
  if (item.severity === "warning") return AlertTriangle;
  if (item.severity === "success") return CheckCircle2;
  return Info;
}

function iconColorBySeverity(severity: AdminNotificationItem["severity"]) {
  if (severity === "critical") return "text-red-400 bg-red-500/10";
  if (severity === "warning") return "text-yellow-400 bg-yellow-500/10";
  if (severity === "success") return "text-green-400 bg-green-500/10";
  return "text-blue-400 bg-blue-500/10";
}

function unreadStripeClass(color: AdminNotificationItem["unread_color"]) {
  if (color === "red") return "border-l-red-500";
  if (color === "yellow") return "border-l-yellow-500";
  return "border-l-blue-500";
}

function severityTag(item: AdminNotificationItem, language: string): string {
  if (language === "ru") {
    if (item.severity === "critical") return "Критично";
    if (item.severity === "warning") return "Предупреждение";
    if (item.severity === "success") return "Успешно";
    return "Информация";
  }
  if (item.severity === "critical") return "Critical";
  if (item.severity === "warning") return "Warning";
  if (item.severity === "success") return "Success";
  return "Info";
}

function severityTagClass(severity: AdminNotificationItem["severity"]): string {
  if (severity === "critical") return "bg-red-500/15 text-red-400";
  if (severity === "warning") return "bg-yellow-500/15 text-yellow-400";
  if (severity === "success") return "bg-green-500/15 text-green-400";
  return "bg-blue-500/15 text-blue-400";
}

function categoryLabel(category: AdminNotificationItem["category"], language: string): string {
  if (language === "ru") {
    if (category === "users") return "Пользователи";
    if (category === "security") return "Безопасность";
    return "Система";
  }
  if (category === "users") return "Users";
  if (category === "security") return "Security";
  return "System";
}

export default function AdminNotificationsPage({ isDarkTheme = true }: Props) {
  const { t, language } = useUserPreferences();
  const navigate = useNavigate();
  const ui = getAdminPageTheme(isDarkTheme);
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const labels = useMemo(
    () =>
      language === "ru"
        ? {
            subtitle: "Системные события, требующие вашего внимания",
            readAll: "Прочитать все",
            clearRead: "Очистить прочитанные",
            total: "Всего",
            unread: "Непрочитанных",
            actionRequired: "Требуют действия",
            critical: "Критических",
            shown: "Показано",
            of: "из",
            all: "Все",
            users: "Пользователи",
            system: "Система",
            security: "Безопасность",
            searchPlaceholder: "Поиск уведомлений...",
            today: "Сегодня",
            yesterday: "Вчера",
            earlier: "Ранее",
            open: "Открыть",
            noNotifications: "Уведомлений пока нет",
            markedRead: "Уведомление отмечено как прочитанное",
            readAllDone: "Все уведомления отмечены как прочитанные",
            readAllError: "Не удалось отметить уведомления",
            clearReadDone: "Прочитанные уведомления очищены",
            clearReadError: "Не удалось очистить прочитанные",
            actionDone: "Действие выполнено",
            actionError: "Не удалось выполнить действие",
            approve: "Принять",
            reject: "Отклонить",
            retry: "Повторить",
            page: "Страница",
          }
        : {
            subtitle: "System events that require your attention",
            readAll: "Read all",
            clearRead: "Clear read",
            total: "Total",
            unread: "Unread",
            actionRequired: "Requires action",
            critical: "Critical",
            shown: "Shown",
            of: "of",
            all: "All",
            users: "Users",
            system: "System",
            security: "Security",
            searchPlaceholder: "Search notifications...",
            today: "Today",
            yesterday: "Yesterday",
            earlier: "Earlier",
            open: "Open",
            noNotifications: "No notifications yet",
            markedRead: "Notification marked as read",
            readAllDone: "All notifications marked as read",
            readAllError: "Could not mark notifications",
            clearReadDone: "Read notifications cleared",
            clearReadError: "Could not clear read notifications",
            actionDone: "Action completed",
            actionError: "Action failed",
            approve: "Approve",
            reject: "Reject",
            retry: "Retry",
            page: "Page",
          },
    [language],
  );

  const [tab, setTab] = useState<FilterTab>("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [tabCounts, setTabCounts] = useState<Record<FilterTab, number>>({
    all: 0,
    unread: 0,
    users: 0,
    system: 0,
    security: 0,
  });
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    actionRequired: 0,
    critical: 0,
  });

  const currentQuery = searchText.trim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listQuery = {
        page,
        limit: PAGE_SIZE,
        q: currentQuery || undefined,
        ...(tab === "unread" ? { unread: true } : {}),
        ...(tab === "users" ? { category: "users" as const } : {}),
        ...(tab === "system" ? { category: "system" as const } : {}),
        ...(tab === "security" ? { category: "security" as const } : {}),
      };
      const [listRes, statsRes] = await Promise.all([
        getAdminNotifications(listQuery),
        getAdminNotificationsStats(currentQuery || undefined),
      ]);

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
      toast.error(t("admin.search.loadError"));
    } finally {
      setLoading(false);
    }
  }, [page, tab, currentQuery, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, currentQuery]);

  const grouped = useMemo(() => {
    const out: Array<{ key: "today" | "yesterday" | "earlier"; label: string; entries: AdminNotificationItem[] }> = [];
    const map = new Map<string, AdminNotificationItem[]>();

    for (const item of items) {
      const date = new Date(item.created_at);
      if (Number.isNaN(date.getTime())) {
        const key = "earlier";
        map.set(key, [...(map.get(key) ?? []), item]);
        continue;
      }
      const key = isToday(date) ? "today" : isYesterday(date) ? "yesterday" : "earlier";
      map.set(key, [...(map.get(key) ?? []), item]);
    }

    for (const key of ["today", "yesterday", "earlier"] as const) {
      const entries = map.get(key) ?? [];
      if (entries.length === 0) continue;
      let label = labels.earlier;
      if (key === "today") {
        label = `${labels.today} — ${formatDateOnly(entries[0].created_at, dateLocale)}`;
      } else if (key === "yesterday") {
        label = `${labels.yesterday} — ${formatDateOnly(entries[0].created_at, dateLocale)}`;
      }
      out.push({ key, label, entries });
    }
    return out;
  }, [items, labels.today, labels.yesterday, labels.earlier, dateLocale]);

  const handleMarkRead = useCallback(
    async (item: AdminNotificationItem) => {
      if (item.read || item.virtual) return;
      try {
        await markNotificationAsRead(item.id);
        setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, read: true, unread_color: null } : entry)));
      } catch {
        toast.error(labels.readAllError);
      }
    },
    [labels.readAllError],
  );

  const handleAction = useCallback(
    async (item: AdminNotificationItem, action: AdminNotificationItem["actions"][number]) => {
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
        } else if (action.kind === "retry_webhook") {
          const repoId = action.payload?.repo_id;
          const webhookId = action.payload?.webhook_id;
          if (!repoId || !webhookId) throw new Error("Missing webhook payload");
          await redeliverWebhook(repoId, webhookId);
        } else if (action.kind === "open_link") {
          const href = action.href ?? item.href;
          if (href) navigate(href);
          return;
        } else {
          const href = action.href ?? item.href;
          if (href) navigate(href);
          return;
        }
        toast.success(labels.actionDone);
        await load();
      } catch {
        toast.error(labels.actionError);
      } finally {
        setBusy(false);
      }
    },
    [busy, labels.actionDone, labels.actionError, navigate, load],
  );

  const handleReadAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsAsRead();
      toast.success(labels.readAllDone);
      await load();
    } catch {
      toast.error(labels.readAllError);
    } finally {
      setBusy(false);
    }
  }, [busy, labels.readAllDone, labels.readAllError, load]);

  const handleClearRead = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearReadAdminNotifications();
      toast.success(labels.clearReadDone);
      await load();
    } catch {
      toast.error(labels.clearReadError);
    } finally {
      setBusy(false);
    }
  }, [busy, labels.clearReadDone, labels.clearReadError, load]);

  const shown = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  const tabMeta: Array<{ key: FilterTab; label: string }> = [
    { key: "all", label: labels.all },
    { key: "unread", label: labels.unread },
    { key: "users", label: labels.users },
    { key: "system", label: labels.system },
    { key: "security", label: labels.security },
  ];

  return (
    <div className={`w-full min-h-screen transition-colors ${ui.pageWrapper}`}>
      <div className="w-full max-w-full mx-auto px-5 py-5 space-y-5">
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.dashboard.notifications")}
          subtitle={labels.subtitle}
          subtitleBelow
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleReadAll()}
                disabled={busy || stats.unread === 0}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${ui.tableBorder} ${ui.textSecondary}`}
              >
                {labels.readAll}
              </button>
              <button
                type="button"
                onClick={() => void handleClearRead()}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${ui.tableBorder} ${ui.textSecondary}`}
              >
                {labels.clearRead}
              </button>
            </div>
          }
        />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`${ui.cardShell} px-4 py-3 overflow-hidden`}>
            <div className="-mx-4 -mt-3 mb-3 h-1 bg-blue-500" />
            <div className="text-2xl font-semibold text-white">{stats.total}</div>
            <div className={`text-xs mt-1 ${ui.textSecondary}`}>{labels.total}</div>
          </div>
          <div className={`${ui.cardShell} px-4 py-3 overflow-hidden`}>
            <div className="-mx-4 -mt-3 mb-3 h-1 bg-blue-500" />
            <div className="text-2xl font-semibold text-blue-400">{stats.unread}</div>
            <div className={`text-xs mt-1 ${ui.textSecondary}`}>{labels.unread}</div>
          </div>
          <div className={`${ui.cardShell} px-4 py-3 overflow-hidden`}>
            <div className="-mx-4 -mt-3 mb-3 h-1 bg-yellow-500" />
            <div className="text-2xl font-semibold text-yellow-400">{stats.actionRequired}</div>
            <div className={`text-xs mt-1 ${ui.textSecondary}`}>{labels.actionRequired}</div>
          </div>
          <div className={`${ui.cardShell} px-4 py-3 overflow-hidden`}>
            <div className="-mx-4 -mt-3 mb-3 h-1 bg-red-500" />
            <div className="text-2xl font-semibold text-red-400">{stats.critical}</div>
            <div className={`text-xs mt-1 ${ui.textSecondary}`}>{labels.critical}</div>
          </div>
        </section>

        <section className="px-1">
          <div className="flex items-center gap-2 flex-wrap">
            {tabMeta.map((meta) => {
              const active = tab === meta.key;
              return (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => setTab(meta.key)}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : `border-[#2d2d2d] ${ui.textSecondary} hover:text-white`
                  }`}
                >
                  <span>{meta.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-blue-500/20 text-blue-300" : "bg-[#2d2d2d] text-[#8b949e]"
                    }`}
                  >
                    {tabCounts[meta.key]}
                  </span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 rounded-md border border-[#2d2d2d] px-3 py-1.5 bg-[#111111]">
              <Search className="h-3.5 w-3.5 text-[#6e7681]" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="w-[200px] bg-transparent outline-none text-xs text-white placeholder:text-[#6e7681]"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden">
          <div>
            {loading ? (
              <div className={`text-sm ${ui.textSecondary}`}>{t("common.loading")}</div>
            ) : grouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <BellOff className={`h-10 w-10 mb-3 ${ui.textTertiary}`} />
                <p className={`text-sm ${ui.textSecondary}`}>{labels.noNotifications}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <div className="px-1 text-[11px] uppercase tracking-wide text-[#6e7681]">{group.label}</div>
                    <div className="rounded-xl border border-[#2d2d2d] overflow-hidden bg-[#111111]">
                      {group.entries.map((item, idx) => {
                        const Icon = iconByItem(item);
                        const iconTheme = iconColorBySeverity(item.severity);
                        const rowBorder = !item.read ? unreadStripeClass(item.unread_color) : "border-l-transparent";
                        return (
                          <article
                            key={`${item.id}-${idx}`}
                            onClick={() => void handleMarkRead(item)}
                            className={`group flex items-start gap-3 px-4 py-3 border-l-[3px] ${rowBorder} ${
                              idx > 0 ? "border-t border-t-[#232323]" : ""
                            }`}
                          >
                            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center ${iconTheme}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${ui.textPrimary}`}>{item.title}</p>
                              <p className={`text-xs mt-1 leading-relaxed ${ui.textSecondary}`}>{item.message}</p>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] ${ui.textTertiary}`}>
                                  {formatRelativeTime(item.created_at, dateLocale, language)}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${severityTagClass(item.severity)}`}>
                                  {severityTag(item, language)}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2a2a2a] text-[#9ca3af]">
                                  {categoryLabel(item.category, language)}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-2 min-w-[130px]">
                              {!item.read && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                              <div className="flex flex-wrap justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.actions.map((action, actionIdx) => (
                                  <button
                                    key={`${item.id}-${action.kind}-${actionIdx}`}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleAction(item, action);
                                    }}
                                    className={`px-2 py-1 rounded-md text-[11px] border border-[#2d2d2d] text-[#ccd0d4] ${
                                      action.kind === "approve_user"
                                        ? "text-green-400 border-green-500/30 hover:bg-green-500/10"
                                        : action.kind === "reject_user"
                                          ? "text-red-400 border-red-500/30 hover:bg-red-500/10"
                                          : "hover:bg-[#252525]"
                                    }`}
                                  >
                                    {action.kind === "open_link"
                                      ? labels.open
                                      : action.kind === "approve_user"
                                        ? labels.approve
                                        : action.kind === "reject_user"
                                          ? labels.reject
                                          : action.kind === "retry_webhook"
                                            ? labels.retry
                                            : action.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex items-center justify-between">
          <div className={`text-xs ${ui.textSecondary}`}>
            {labels.shown} {shown} {labels.of} {total}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="h-8 min-w-[32px] px-2 rounded-md border border-[#2d2d2d] text-xs text-[#8b949e] disabled:opacity-50"
            >
              {"<"}
            </button>
            <span className={`text-xs px-2 ${ui.textSecondary}`}>
              {labels.page} {page}/{pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
              disabled={page >= pages}
              className="h-8 min-w-[32px] px-2 rounded-md border border-[#2d2d2d] text-xs text-[#8b949e] disabled:opacity-50"
            >
              {">"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
