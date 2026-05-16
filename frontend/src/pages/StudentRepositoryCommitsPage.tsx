import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { GitCommit, Loader2 } from "lucide-react";
import RepoSectionShell from "../components/repo/RepoSectionShell";
import { getStudentRepoCommits } from "../api/studentDashboardApi";
import { useStudentRepoWorkspace, type StudentRepoMeta } from "../hooks/useStudentRepoWorkspace";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme } from "../theme";

interface BrowseState extends Partial<StudentRepoMeta> {
  name: string;
  branch?: string;
}

interface StudentRepositoryCommitsPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryCommitsPage({ isDarkTheme = false }: StudentRepositoryCommitsPageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const stateMeta = location.state as BrowseState | null;
  const { meta, summary, loading } = useStudentRepoWorkspace(repoId, stateMeta);

  const [branch, setBranch] = useState(stateMeta?.branch ?? "main");
  const [commits, setCommits] = useState<
    { sha: string; message: string; author_name: string | null; committed_at: string | null }[]
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(true);

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
      try {
        const commitsRes = await getStudentRepoCommits(repoId, branch, page);
        if (cancelled) return;
        setCommits((prev) => (page === 1 ? commitsRes.commits : [...prev, ...commitsRes.commits]));
        setHasMore(commitsRes.has_more);
      } catch {
        if (!cancelled) navigate("/repositories", { replace: true });
      } finally {
        if (!cancelled) setCommitsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, branch, page, navigate]);

  if (!repoId) return null;

  return (
    <RepoSectionShell
      theme={theme}
      repoId={repoId}
      activeTab="code"
      meta={meta}
      summary={summary}
      loading={loading}
      subtitle={`История коммитов · ветка ${branch}`}
    >
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        {commitsLoading && page === 1 ? (
          <div className="flex justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Загрузка коммитов…
          </div>
        ) : commits.length === 0 ? (
          <p className="py-16 text-center text-sm" style={{ color: theme.text2 }}>
            Коммитов пока нет
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
                    {c.committed_at ? <span>{formatRelativeTime(c.committed_at)}</span> : null}
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
              Загрузить ещё
            </button>
          </div>
        ) : null}
      </div>
    </RepoSectionShell>
  );
}
