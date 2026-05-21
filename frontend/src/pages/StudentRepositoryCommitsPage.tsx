import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { GitCommit, Loader2 } from "lucide-react";
import { getStudentRepoCommits } from "../api/studentDashboardApi";
import { useStudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface StudentRepositoryCommitsPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryCommitsPage({ isDarkTheme = false }: StudentRepositoryCommitsPageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId, summary, error: workspaceError } = useStudentRepoWorkspaceContext();
  const { t, tp, language } = useUserPreferences();

  const [branch, setBranch] = useState(summary?.default_branch ?? "main");
  const [commits, setCommits] = useState<
    { sha: string; message: string; author_name: string | null; committed_at: string | null }[]
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(true);
  const [commitsError, setCommitsError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [repoId, branch]);

  useEffect(() => {
    if (summary?.default_branch) setBranch(summary.default_branch);
  }, [summary?.default_branch]);

  useEffect(() => {
    if (!repoId) return;
    let cancelled = false;
    async function load() {
      setCommitsLoading(true);
      setCommitsError(null);
      try {
        const commitsRes = await getStudentRepoCommits(repoId, branch, page);
        if (cancelled) return;
        setCommits((prev) => (page === 1 ? commitsRes.commits : [...prev, ...commitsRes.commits]));
        setHasMore(commitsRes.has_more);
      } catch (e) {
        if (!cancelled) {
          setCommitsError(e instanceof Error ? e.message : t("repo.commits.loadError"));
          if (page === 1) setCommits([]);
        }
      } finally {
        if (!cancelled) setCommitsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, branch, page, t]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      {workspaceError ? (
        <div
          className="px-4 py-3 text-sm border-b"
          style={{ borderColor: theme.border, color: theme.danger }}
        >
          {workspaceError}
        </div>
      ) : null}
      {commitsError ? (
        <div
          className="px-4 py-3 text-sm border-b"
          style={{ borderColor: theme.border, color: theme.danger }}
        >
          {commitsError}
        </div>
      ) : null}
      {commitsLoading && page === 1 ? (
        <div className="flex justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("repo.commits.loading")}
        </div>
      ) : commits.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: theme.text2 }}>
          {t("repo.commits.empty")}
        </p>
      ) : (
        <ul>
          {commits.map((c) => (
            <li
              key={`${c.sha}-${c.committed_at}`}
              className="flex gap-3 px-4 py-3 border-t"
              style={{ borderColor: theme.border }}
            >
              <GitCommit className="h-4 w-4 shrink-0 mt-0.5" style={{ color: theme.text3 }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {c.message}
                </p>
                <p className="text-xs mt-1 flex flex-wrap gap-x-2" style={{ color: theme.text3 }}>
                  {c.author_name ? <span>{c.author_name}</span> : null}
                  {c.committed_at ? (
                    <span>{formatRelativeTime(c.committed_at, new Date(), language)}</span>
                  ) : null}
                  {c.sha ? <span className="font-mono">{c.sha}</span> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore && !commitsLoading ? (
        <div className="p-4 border-t text-center" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="text-sm font-medium hover:underline"
            style={{ color: theme.accent2 }}
          >
            {t("repo.commits.loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
