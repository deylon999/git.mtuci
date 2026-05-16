import RepoFileBrowser from "../../components/RepoFileBrowser";
import { useStudentRepoWorkspaceContext } from "../../context/StudentRepoWorkspaceContext";

interface StudentRepoCodePanelProps {
  isDarkTheme?: boolean;
}

export default function StudentRepoCodePanel({ isDarkTheme = false }: StudentRepoCodePanelProps) {
  const { repoId, meta, summary, loading } = useStudentRepoWorkspaceContext();

  if (!meta) return null;

  return (
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
  );
}
