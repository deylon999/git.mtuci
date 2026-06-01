import { useCallback, useEffect, useMemo, useState } from "react";
import { BellOff, CheckCircle2, AlertTriangle, AlertOctagon, Info, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import type { Notification } from "../api/types";
import { getNotifications, invalidateNotificationsCache, markAllNotificationsAsRead } from "../api/notificationsApi";
import AdminPageHeader from "../components/AdminPageHeader";
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";

type Props = {
  isDarkTheme?: boolean;
};

function iconByType(type: Notification["type"]) {
  if (type === "error") return AlertOctagon;
  if (type === "warning") return AlertTriangle;
  if (type === "success") return CheckCircle2;
  return Info;
}

function iconColorByType(type: Notification["type"]) {
  if (type === "error") return "text-red-500";
  if (type === "warning") return "text-yellow-500";
  if (type === "success") return "text-green-500";
  return "text-blue-500";
}

export default function AdminNotificationsPage({ isDarkTheme = true }: Props) {
  const { t, language } = useUserPreferences();
  const ui = getAdminPageTheme(isDarkTheme);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const dateLocale = language === "en" ? "en-US" : "ru-RU";

  const formatDateTime = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 200, bypassCache: true });
      setItems(data);
    } catch {
      toast.error(t("admin.search.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleMarkAll = useCallback(async () => {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    try {
      await markAllNotificationsAsRead();
      invalidateNotificationsCache();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      toast.error(t("admin.dashboard.notificationsClearError"));
    } finally {
      setMarking(false);
    }
  }, [marking, unreadCount, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={`w-full min-h-screen transition-colors ${ui.pageWrapper}`}>
      <div className="w-full max-w-[1280px] mx-auto px-5 py-5 space-y-5">
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.dashboard.notifications")}
          subtitle={t("admin.settings.adminNotificationsHint")}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${ui.tableBorder} ${ui.textSecondary}`}
              >
                <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {t("admin.monitoring.refresh")}
              </button>
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={marking || unreadCount === 0}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${ui.tableBorder} ${ui.textSecondary}`}
              >
                {t("admin.dashboard.clearAll")}
              </button>
            </div>
          }
        />

        <section className={`${ui.cardShell} overflow-hidden`}>
          <div className={`px-4 py-3 border-b ${ui.tableBorder} ${ui.sectionHeaderBg} text-sm ${ui.textSecondary}`}>
            {t("admin.search.totalLabel")}: {items.length} · {unreadCount}
          </div>
          <div className="p-4">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <BellOff className={`h-10 w-10 mb-3 ${ui.textMuted}`} />
                <p className={`text-sm ${ui.textMuted}`}>{t("admin.dashboard.noNotifications")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const Icon = iconByType(item.type);
                  const iconColor = iconColorByType(item.type);
                  return (
                    <article
                      key={item.id}
                      className={`${ui.tableBg} border ${ui.tableBorder} rounded-lg p-3 ${!item.read ? "border-blue-500/40" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 ${iconColor}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${ui.textPrimary}`}>{item.title}</p>
                          <p className={`text-xs mt-1 ${ui.textSecondary}`}>{item.message}</p>
                          <div className={`text-[11px] mt-1 ${ui.textMuted}`}>
                            {formatDateTime(item.created_at)}
                            {item.href ? (
                              <>
                                {" · "}
                                <Link to={item.href} className="text-blue-500 hover:underline">
                                  {t("admin.search.open")}
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
