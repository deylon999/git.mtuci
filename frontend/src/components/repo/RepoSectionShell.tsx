import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FolderGit2 } from "lucide-react";
import RepoNavTabs, { type RepoNavTabId } from "./RepoNavTabs";
import RepoProjectSidebar from "./RepoProjectSidebar";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import type { StudentRepoMeta } from "../../hooks/useStudentRepoWorkspace";
import type { ThemeColors } from "../../theme";

interface RepoSectionShellProps {
  theme: ThemeColors;
  repoId: string;
  activeTab: RepoNavTabId;
  meta: StudentRepoMeta | null;
  summary: StudentRepoSummary | null;
  loading?: boolean;
  subtitle?: string;
  children: ReactNode;
  onGoToReadme?: () => void;
  onOpenLicense?: (path: string) => void;
}

export default function RepoSectionShell({
  theme,
  repoId,
  activeTab,
  meta,
  summary,
  loading,
  subtitle,
  children,
  onGoToReadme,
  onOpenLicense,
}: RepoSectionShellProps) {
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

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2}, ${theme.success})`,
          }}
        />
        <div className="px-5 py-4 border-b" style={{ borderColor: theme.border }}>
          <div className="flex flex-wrap items-center gap-2">
            <FolderGit2 className="h-5 w-5 shrink-0" style={{ color: theme.accent2 }} />
            <h1 className="text-xl font-bold truncate" style={{ color: theme.text }}>
              {meta?.name ?? "…"}
            </h1>
          </div>
          {meta?.giteaPath ? (
            <p className="text-sm font-mono truncate mt-1" style={{ color: theme.text2 }}>
              {meta.giteaPath}
            </p>
          ) : null}
          {subtitle ? (
            <p className="text-xs mt-1" style={{ color: theme.text3 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <RepoNavTabs
          theme={theme}
          repoId={repoId}
          active={activeTab}
          openIssuesCount={summary?.open_issues_count}
          openPrCount={summary?.open_pr_count}
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
        <div className="flex-1 min-w-0 flex flex-col gap-4">{children}</div>
        <RepoProjectSidebar
          theme={theme}
          loading={loading && !summary}
          summary={summary}
          repoId={repoId}
          activeBranch={summary?.default_branch}
          onGoToReadme={onGoToReadme}
          onOpenLicense={onOpenLicense}
        />
      </div>
    </div>
  );
}
