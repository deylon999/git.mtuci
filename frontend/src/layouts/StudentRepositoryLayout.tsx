import { Outlet, useLocation, useParams } from "react-router-dom";
import RepoSectionShell from "../components/repo/RepoSectionShell";
import { StudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import { RepoApiProvider, studentRepoApi, teacherRepoApi } from "../context/RepoApiContext";
import { useStudentRepoWorkspace } from "../hooks/useStudentRepoWorkspace";
import type { RepoNavTabId } from "../components/repo/RepoNavTabs";
import { getTheme } from "../theme";
import { useAuthUser } from "../context/AuthUserContext";

function tabFromPath(pathname: string): RepoNavTabId {
  if (pathname.includes("/branches")) return "branches";
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
  const { user } = useAuthUser();
  const { meta, setMeta, summary, setSummary, loading, error } = useStudentRepoWorkspace(repoId, stateMeta);
  const activeTab = tabFromPath(location.pathname);

  if (!repoId) return null;

  const showSkeleton = loading && !meta;
  const showMissing = !loading && !meta;

  return (
    <RepoApiProvider value={user?.role === "teacher" || user?.role === "laborant" ? teacherRepoApi : studentRepoApi}>
      <StudentRepoWorkspaceContext.Provider
        value={{ repoId, meta, setMeta, summary, setSummary, loading, error, activeTab }}
      >
        <RepoSectionShell
          theme={theme}
          repoId={repoId}
          activeTab={activeTab}
          meta={meta}
          summary={summary}
          loading={loading}
          error={error}
          onGoToReadme={() => {
            document.getElementById("repo-readme")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          {showSkeleton ? (
            <div
              className="rounded-xl border animate-pulse min-h-[280px]"
              style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
            />
          ) : showMissing ? (
            <div
              className="rounded-xl border px-4 py-8 text-sm text-center"
              style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text2 }}
            >
              {error ?? "Repository not found"}
            </div>
          ) : (
            <Outlet />
          )}
        </RepoSectionShell>
      </StudentRepoWorkspaceContext.Provider>
    </RepoApiProvider>
  );
}
