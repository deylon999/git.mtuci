import { useLocation, useNavigate, useParams } from "react-router-dom";
import RepoFileBrowser from "../components/RepoFileBrowser";
import RepoSectionShell from "../components/repo/RepoSectionShell";
import { useStudentRepoWorkspace, type StudentRepoMeta } from "../hooks/useStudentRepoWorkspace";
import { getTheme } from "../theme";

interface BrowseState extends Partial<StudentRepoMeta> {
  name: string;
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
  const { meta, summary, loading } = useStudentRepoWorkspace(repoId, stateMeta);

  if (!repoId || loading && !meta) {
    return (
      <div className="flex items-center justify-center py-20 text-sm" style={{ color: theme.text2 }}>
        Загрузка репозитория…
      </div>
    );
  }

  if (!meta) return null;

  return (
    <RepoSectionShell
      theme={theme}
      repoId={repoId}
      activeTab="code"
      meta={meta}
      summary={summary}
      loading={loading}
      onGoToReadme={() => {
        document.getElementById("repo-readme")?.scrollIntoView({ behavior: "smooth" });
      }}
      onOpenLicense={(path) => navigate(`/repositories/${repoId}/code`, { state: { ...meta, openFile: path } })}
    >
      <RepoFileBrowser
        repoId={repoId}
        isDarkTheme={isDarkTheme}
        repoDisplayName={meta.name}
        giteaPath={meta.giteaPath}
        giteaWebUrl={meta.giteaWebUrl}
        cloneUrl={meta.cloneUrl}
        repoDescription={meta.description}
        repoLanguage={meta.language}
        embedded
        externalSummary={summary}
        externalSummaryLoading={loading}
      />
    </RepoSectionShell>
  );
}
