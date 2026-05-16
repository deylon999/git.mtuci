import { Outlet, useLocation, useParams } from "react-router-dom";
import RepoSectionShell from "../components/repo/RepoSectionShell";
import { StudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import { useStudentRepoWorkspace } from "../hooks/useStudentRepoWorkspace";
import type { RepoNavTabId } from "../components/repo/RepoNavTabs";
import { getTheme } from "../theme";

function tabFromPath(pathname: string): RepoNavTabId {
  if (pathname.includes("/issues")) return "issues";
  if (pathname.includes("/pulls")) return "pulls";
  if (pathname.includes("/wiki")) return "wiki";
  if (pathname.includes("/settings")) return "settings";
  return "code";
}

interface StudentRepositoryLayoutProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryLayout({ isDarkTheme = false }: StudentRepositoryLayoutProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId } = useParams<{ repoId: string }>();
  const location = useLocation();
  const stateMeta = location.state as { name?: string } | null;
  const { meta, summary, loading } = useStudentRepoWorkspace(repoId, stateMeta);
  const activeTab = tabFromPath(location.pathname);

  if (!repoId) return null;

  const showSkeleton = loading && !meta;

  return (
    <StudentRepoWorkspaceContext.Provider
      value={{ repoId, meta, summary, loading, activeTab }}
    >
      <RepoSectionShell
        theme={theme}
        repoId={repoId}
        activeTab={activeTab}
        meta={meta}
        summary={summary}
        loading={loading}
        onGoToReadme={() => {
          document.getElementById("repo-readme")?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        {showSkeleton ? (
          <div
            className="rounded-xl border animate-pulse min-h-[280px]"
            style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
          />
        ) : (
          <Outlet />
        )}
      </RepoSectionShell>
    </StudentRepoWorkspaceContext.Provider>
  );
}
