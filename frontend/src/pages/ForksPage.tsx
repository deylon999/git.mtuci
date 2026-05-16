import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getAdminForks, type AdminForkEvent } from "../api/adminApi";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface ForksPageProps {
  isDarkTheme?: boolean;
}

export default function ForksPage({ isDarkTheme = false }: ForksPageProps) {
  const { t, tp, language } = useUserPreferences();
  const [events, setEvents] = useState<AdminForkEvent[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    forks_count: 0,
    created_count: 0,
    today_count: 0,
    unique_users: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "fork" | "repo_created">("all");

  const eventLabel = useMemo(
    (): Record<AdminForkEvent["event_type"], string> => ({
      fork: t("admin.forks.eventFork"),
      repo_created: t("admin.forks.eventCreated"),
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminForks({
          limit: 200,
          event_type: typeFilter === "all" ? undefined : typeFilter,
        });
        if (!cancelled) {
          setEvents(data.events);
          setStats(data.stats);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("admin.forks.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [typeFilter, t]);

  const filtered = useMemo(
    () =>
      events.filter((row) => {
        const q = query.toLowerCase();
        if (!q) return true;
        return (
          (row.user_full_name ?? "").toLowerCase().includes(q) ||
          (row.source_repo ?? "").toLowerCase().includes(q) ||
          (row.target_repo ?? "").toLowerCase().includes(q) ||
          (row.user_login ?? "").toLowerCase().includes(q)
        );
      }),
    [events, query],
  );

  const theme = getTheme(isDarkTheme);
  const dateLocale = language === "en" ? "en-US" : "ru-RU";

  const statCards = [
    [t("admin.forks.statTotal"), stats.total],
    [t("admin.forks.statForks"), stats.forks_count],
    [t("admin.forks.statCreated"), stats.created_count],
    [t("admin.forks.statToday"), stats.today_count],
  ] as const;

  const tableHeaders = [
    t("admin.forks.colUser"),
    t("admin.forks.colType"),
    t("admin.forks.colSource"),
    t("admin.forks.colTarget"),
    t("admin.forks.colDate"),
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="mx-auto max-w-[2100px] px-6 py-6 pb-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <AdminPageHeader isDarkTheme={isDarkTheme} title={t("admin.forks.title")} />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="h-8 rounded-md border px-3 text-xs"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {t("admin.forks.exportCsv")}
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map(([title, value]) => (
            <div
              key={title}
              className="rounded-xl border p-4"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <p className="text-xs" style={{ color: theme.text2 }}>
                {title}
              </p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
          <div
            className="flex flex-wrap items-center gap-2 border-b border-inherit p-3"
            style={{ borderColor: theme.border }}
          >
            <div
              className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-md border px-2"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
            >
              <Search className="h-3.5 w-3.5" style={{ color: theme.text2 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: theme.text }}
                placeholder={t("admin.forks.searchPlaceholder")}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="h-8 rounded-md border px-2 text-xs"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
            >
              <option value="all">{t("admin.forks.filterAll")}</option>
              <option value="fork">{t("admin.forks.filterForkOnly")}</option>
              <option value="repo_created">{t("admin.forks.filterCreateOnly")}</option>
            </select>
            <span className="text-xs" style={{ color: theme.text2 }}>
              {tp("admin.forks.uniqueUsers", { n: stats.unique_users })}
            </span>
          </div>

          {loading ? (
            <p className="p-4 text-sm">{t("common.loading")}</p>
          ) : error ? (
            <p className="p-4 text-sm text-red-500">{error}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase" style={{ color: theme.text2 }}>
                <tr>
                  {tableHeaders.map((h) => (
                    <th key={h} className="px-3 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((row) => (
                  <tr key={row.id} className="border-t border-inherit" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.user_full_name}</p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {row.user_login || row.user_id}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-[#1f6feb]/20 px-2 py-1 text-xs text-[#58a6ff]">
                        {eventLabel[row.event_type]}
                      </span>
                    </td>
                    <td className="px-3 py-3">{row.source_repo || "—"}</td>
                    <td className="px-3 py-3">{row.target_repo || "—"}</td>
                    <td className="px-3 py-3" style={{ color: theme.text2 }}>
                      {new Date(row.created_at).toLocaleString(dateLocale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
