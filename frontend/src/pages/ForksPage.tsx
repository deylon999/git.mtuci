import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getAdminForks, type AdminForkEvent } from "../api/adminApi";
import { getAdminPageTheme } from "../layout/adminPageTheme";
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

  const ui = getAdminPageTheme(isDarkTheme);
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
    <div className={`h-full overflow-y-auto ${ui.pageWrapper}`}>
      <div className="w-full py-6 px-6 pb-20 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <AdminPageHeader isDarkTheme={isDarkTheme} title={t("admin.forks.title")} />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors shadow-sm ${ui.cardBg} ${ui.cardHover}`}
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {t("admin.forks.exportCsv")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map(([title, value]) => (
            <div key={title} className={`rounded-xl border p-5 ${ui.tableBg} ${ui.tableBorder}`}>
              <p className={`text-sm mb-1 ${ui.tableHeaderText}`}>{title}</p>
              <p className={`text-2xl font-bold ${ui.textPrimary}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-xl border ${ui.tableBg} ${ui.tableBorder}`}>
          <div className={`flex flex-wrap items-center gap-3 border-b p-4 ${ui.tableBorder}`}>
            <div className={`flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${ui.inputBg}`}>
              <Search className={`h-4 w-4 ${ui.tableHeaderText}`} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`w-full bg-transparent text-sm outline-none ${ui.tableNameText} placeholder-[#6e7681]`}
                placeholder={t("admin.forks.searchPlaceholder")}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className={`rounded-lg border px-3 py-2 text-sm ${ui.inputBg} ${ui.tableNameText}`}
            >
              <option value="all">{t("admin.forks.filterAll")}</option>
              <option value="fork">{t("admin.forks.filterForkOnly")}</option>
              <option value="repo_created">{t("admin.forks.filterCreateOnly")}</option>
            </select>
            <span className={`text-sm ${ui.tableCellText}`}>
              {tp("admin.forks.uniqueUsers", { n: stats.unique_users })}
            </span>
          </div>

          {loading ? (
            <p className={`p-4 text-sm ${ui.tableCellText}`}>{t("common.loading")}</p>
          ) : error ? (
            <p className="p-4 text-sm text-red-500">{error}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className={`text-xs font-medium uppercase tracking-wider ${ui.tableHeaderText}`}>
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
                  <tr key={row.id} className={`border-t ${ui.tableBorder} ${ui.tableRowHover} transition-colors`}>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${ui.tableNameText}`}>{row.user_full_name}</p>
                      <p className={`text-xs ${ui.tableHeaderText}`}>
                        {row.user_login || row.user_id}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-400">
                        {eventLabel[row.event_type]}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${ui.tableCellText}`}>{row.source_repo || "—"}</td>
                    <td className={`px-4 py-3 ${ui.tableCellText}`}>{row.target_repo || "—"}</td>
                    <td className={`px-4 py-3 ${ui.tableCellText}`}>
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
