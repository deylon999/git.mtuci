import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import RepoFileBrowser from "../components/RepoFileBrowser";
import { getStudentRepositories } from "../api/studentDashboardApi";
import { getTheme } from "../theme";

interface BrowseState {
  name: string;
  giteaPath?: string | null;
  giteaWebUrl?: string | null;
  cloneUrl?: string | null;
  description?: string | null;
  language?: string | null;
}

interface StudentRepositoryBrowsePageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryBrowsePage({ isDarkTheme = false }: StudentRepositoryBrowsePageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const stateMeta = location.state as BrowseState | null;

  const [meta, setMeta] = useState<BrowseState | null>(stateMeta);
  const [loadingMeta, setLoadingMeta] = useState(!stateMeta);

  useEffect(() => {
    if (!repoId) {
      navigate("/repositories", { replace: true });
      return;
    }
    if (stateMeta) {
      setMeta(stateMeta);
      setLoadingMeta(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoadingMeta(true);
      try {
        const data = await getStudentRepositories();
        if (cancelled) return;
        const repo = data.repositories.find((r) => r.id === repoId);
        if (!repo) {
          navigate("/repositories", { replace: true });
          return;
        }
        setMeta({
          name: repo.name,
          giteaPath: repo.gitea_path,
          giteaWebUrl: repo.gitea_web_url,
          cloneUrl: repo.clone_url,
          description: repo.description,
          language: repo.language,
        });
      } catch {
        if (!cancelled) navigate("/repositories", { replace: true });
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, stateMeta, navigate]);

  if (loadingMeta || !meta || !repoId) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm" style={{ color: theme.text2 }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Загрузка репозитория…
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 max-w-7xl mx-auto">
      <Link
        to="/repositories"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        К репозиториям
      </Link>

      <RepoFileBrowser
        repoId={repoId}
        isDarkTheme={isDarkTheme}
        repoDisplayName={meta.name}
        giteaPath={meta.giteaPath}
        giteaWebUrl={meta.giteaWebUrl}
        cloneUrl={meta.cloneUrl}
        repoDescription={meta.description}
        repoLanguage={meta.language}
      />
    </div>
  );
}
