import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitCommit, Loader2 } from "lucide-react";
import RepoNavTabs from "../components/repo/RepoNavTabs";
import RepoProjectSidebar from "../components/repo/RepoProjectSidebar";
import {
  getStudentRepoCommits,
  getStudentRepoSummary,
  getStudentRepositories,
  type StudentRepoSummary,
} from "../api/studentDashboardApi";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme } from "../theme";

interface BrowseState {
  name: string;
  giteaPath?: string | null;
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

  const [name, setName] = useState(stateMeta?.name ?? "");
  const [branch, setBranch] = useState("main");
  const [commits, setCommits] = useState<
    { sha: string; message: string; author_name: string | null; committed_at: string | null }[]
  >([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StudentRepoSummary | null>(null);

  useEffect(() => {
    setPage(1);
  }, [repoId, branch]);

  useEffect(() => {
    if (!repoId) {
      navigate("/repositories", { replace: true });
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if (!stateMeta?.name) {
          const list = await getStudentRepositories();
          const repo = list.repositories.find((r) => r.id === repoId);
          if (!repo) {
            navigate("/repositories", { replace: true });
            return;
          }
          if (!cancelled) setName(repo.name);
        }
        const [commitsRes, summaryRes] = await Promise.all([
          getStudentRepoCommits(repoId, branch, page),
          getStudentRepoSummary(repoId, branch),
        ]);
        if (cancelled) return;
        setCommits((prev) => (page === 1 ? commitsRes.commits : [...prev, ...commitsRes.commits]));
        setHasMore(commitsRes.has_more);
        setSummary(summaryRes);
        if (summaryRes.default_branch && page === 1) setBranch(summaryRes.default_branch);
      } catch {
        if (!cancelled) navigate("/repositories", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, branch, page, stateMeta, navigate]);

  if (!repoId) return null;

  return (
    <div className="w-full flex flex-col gap-4 max-w-7xl mx-auto">
      <Link
        to="/repositories"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        К репозиториям
      </Link>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <h1 className="text-lg font-bold" style={{ color: theme.text }}>
            {name}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>
            История коммитов · ветка {branch}
          </p>
        </div>
        <RepoNavTabs
          theme={theme}
          repoId={repoId}
          active="code"
          giteaLinks={summary?.gitea_links}
          openIssuesCount={summary?.open_issues_count}
          openPrCount={summary?.open_pr_count}
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
        <div className="flex-1 min-w-0 rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
          {loading && page === 1 ? (
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
          {hasMore && !loading ? (
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

        <RepoProjectSidebar
          theme={theme}
          loading={!summary}
          summary={summary}
          repoId={repoId}
          activeBranch={branch}
        />
      </div>
    </div>
  );
}
