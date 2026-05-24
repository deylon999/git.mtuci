import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ExternalLink, GitFork, Loader2, RefreshCw, Search } from "lucide-react";
import { getStudentForks, syncStudentFork, type StudentForkItem } from "../api/studentDashboardApi";
import {
  StudentEmptyState,
  StudentErrorBanner,
  StudentLoadingRow,
  StudentPageHeader,
  StudentPageShell,
  StudentToolbar,
} from "../components/student/studentPageUi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface StudentForksPageProps {
  isDarkTheme?: boolean;
}

export default function StudentForksPage({ isDarkTheme = false }: StudentForksPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const syncLabel = (status: string) => {
    if (status === "up_to_date") return t("student.forks.syncUpToDate");
    if (status === "ahead") return t("student.forks.syncAhead");
    if (status === "behind") return t("student.forks.syncBehind");
    return "—";
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StudentForkItem[]>([]);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getStudentForks(100);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("student.errors.loadForks"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      (item.parent_repo_path ?? "").toLowerCase().includes(q)
    );
  });

  const handleSync = async (item: StudentForkItem) => {
    setSyncing(item.id);
    try {
      await syncStudentFork(item.fork_repo_path);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("student.errors.syncFork"));
    } finally {
      setSyncing(null);
    }
  };

  return (
    <StudentPageShell>
      <StudentPageHeader
        theme={theme}
        icon={GitFork}
        title={t("student.forks.title")}
        subtitle={t("student.forks.subtitle")}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("student.forks.refresh")}
          </button>
        }
      />

      <StudentToolbar theme={theme}>
        <Search className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("student.forks.searchPlaceholder")}
          className="flex-1 min-w-[180px] bg-transparent text-sm outline-none"
          style={{ color: theme.text }}
        />
      </StudentToolbar>

      {loading ? (
        <StudentLoadingRow theme={theme} label={t("student.forks.loading")} />
      ) : error ? (
        <StudentErrorBanner message={error} theme={theme} />
      ) : filtered.length === 0 ? (
        <StudentEmptyState
          theme={theme}
          title={items.length === 0 ? t("student.forks.empty") : t("student.forks.notFound")}
          hint={items.length === 0 ? t("student.forks.emptyHint") : t("student.forks.notFoundHint")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border p-4 transition-shadow hover:shadow-md"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold" style={{ color: theme.text }}>
                    {item.name}
                  </h2>
                  <p className="text-xs font-mono mt-0.5" style={{ color: theme.text2 }}>
                    {item.fork_repo_path}
                  </p>
                  {item.parent_repo_path ? (
                    <p className="text-xs mt-1" style={{ color: theme.text3 }}>
                      ← {item.parent_repo_path}
                    </p>
                  ) : null}
                </div>
                <span
                  className="text-xs rounded-md px-2 py-0.5"
                  style={{ backgroundColor: theme.bg4, color: theme.text2 }}
                >
                  {syncLabel(item.sync_status)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: theme.text2 }}>
                {item.ahead_by != null ? <span>{tp("student.forks.aheadBy", { n: item.ahead_by })}</span> : null}
                {item.behind_by != null && item.behind_by > 0 ? (
                  <span style={{ color: theme.warning }}>{tp("student.forks.behindBy", { n: item.behind_by })}</span>
                ) : null}
                {item.open_pr_count != null && item.open_pr_count > 0 ? (
                  <span>{tp("student.forks.openPrs", { n: item.open_pr_count })}</span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.gitea_web_url ? (
                  <a
                    href={item.gitea_web_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs"
                    style={{ borderColor: theme.border, color: theme.accent2 }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("student.forks.open")}
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={syncing === item.id}
                  onClick={() => void handleSync(item)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50"
                  style={{ borderColor: theme.border, color: theme.text }}
                >
                  {syncing === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {t("student.forks.sync")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </StudentPageShell>
  );
}
