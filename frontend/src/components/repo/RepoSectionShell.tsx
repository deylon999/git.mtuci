import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FolderGit2, GitCommit, Globe, Lock, Settings, GitPullRequest } from "lucide-react";
import RepoNavTabs, { type RepoNavTabId } from "./RepoNavTabs";
import RepoProjectSidebar from "./RepoProjectSidebar";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import type { StudentRepoMeta } from "../../hooks/useStudentRepoWorkspace";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import RepoCloneMenuButton from "./RepoCloneMenuButton";
import { useEffect, useState } from "react";
import { getStudentRepoUnmergedBranches } from "../../api/studentDashboardApi";

interface RepoSectionShellProps {
  theme: ThemeColors;
  repoId: string;
  activeTab: RepoNavTabId;
  meta: StudentRepoMeta | null;
  summary: StudentRepoSummary | null;
  loading?: boolean;
  error?: string | null;
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
  error,
  subtitle,
  children,
  onGoToReadme,
  onOpenLicense,
}: RepoSectionShellProps) {
  const { t } = useUserPreferences();
  const [unmergedBranches, setUnmergedBranches] = useState<string[]>([]);
  const baseBranch = summary?.default_branch ?? "main";
  const isBlocked = !!summary?.is_blocked;

  useEffect(() => {
    let cancelled = false;
    if (!repoId || isBlocked) {
      setUnmergedBranches([]);
      return;
    }
    getStudentRepoUnmergedBranches(repoId, baseBranch, 50)
      .then((rows) => {
        if (!cancelled) setUnmergedBranches(rows);
      })
      .catch(() => {
        if (!cancelled) setUnmergedBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, baseBranch, isBlocked]);

  return (
    <div className="w-full flex flex-col gap-4 max-w-7xl mx-auto">
      <Link
        to="/repositories"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("repo.shell.backToRepos")}
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FolderGit2 className="h-5 w-5 shrink-0" style={{ color: theme.accent2 }} />
                  <h1 className="text-xl font-bold truncate" style={{ color: theme.text }}>
                    {meta?.name ?? "…"}
                  </h1>
                  {meta?.visibility ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase"
                      style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg4 }}
                    >
                      {meta.visibility === "public" ? t("student.repos.visibilityPublic") : t("student.repos.visibilityPrivate")}
                    </span>
                  ) : null}
                  {meta?.visibility === "private" ? (
                    <Lock className="h-4 w-4 opacity-70" style={{ color: theme.text3 }} />
                  ) : (
                    <Globe className="h-4 w-4 opacity-70" style={{ color: theme.text3 }} />
                  )}
                </div>
                {meta?.giteaPath ? (
                  <p className="text-sm font-mono truncate mt-1" style={{ color: theme.text2 }}>
                    {meta.giteaPath}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs" style={{ color: theme.text3 }}>
                  {summary?.language ? <span>{summary.language}</span> : null}
                  {summary?.commits_count != null ? (
                    <span className="inline-flex items-center gap-1">
                      <GitCommit className="h-3.5 w-3.5" />
                      {summary.commits_count}
                      {summary.commits_count_approx ? "+" : ""}
                    </span>
                  ) : null}
                  {summary?.stars_count != null ? <span>★ {summary.stars_count}</span> : null}
                </div>
                {subtitle ? (
                  <p className="text-xs mt-1" style={{ color: theme.text3 }}>
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <RepoCloneMenuButton
                  theme={theme}
                  repoId={repoId}
                  cloneUrl={meta?.cloneUrl}
                  giteaWebUrl={meta?.giteaWebUrl}
                  pageUrl={typeof window !== "undefined" ? window.location.href : null}
                  disabled={isBlocked}
                  size="sm"
                />
                <Link
                  to={`/repositories/${repoId}/settings`}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:opacity-90"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  {t("repo.tabs.settings")}
                </Link>
                {unmergedBranches.length > 0 ? (
                  <Link
                    to={`/repositories/${repoId}/pulls`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:opacity-90"
                    style={{
                      borderColor: `${theme.accent}55`,
                      backgroundColor: `${theme.accent}14`,
                      color: theme.accent2,
                      opacity: isBlocked ? 0.55 : 1,
                      pointerEvents: isBlocked ? "none" : "auto",
                    }}
                    title={unmergedBranches.slice(0, 6).join(", ")}
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    {t("repo.section.createPr")}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <RepoNavTabs
          theme={theme}
          repoId={repoId}
          active={activeTab}
          openIssuesCount={summary?.open_issues_count}
          openPrCount={summary?.open_pr_count}
        />
      </div>

      {isBlocked ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: theme.warning,
            backgroundColor: `${theme.warning}18`,
            color: theme.text,
          }}
        >
          {t("repo.settings.blockedReadOnly")}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: theme.danger,
            backgroundColor: `${theme.danger}18`,
            color: theme.text,
          }}
        >
          {error}
        </div>
      ) : null}

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
          courseHref={
            meta?.source === "assignment" && meta.courseId && meta.assignmentId
              ? `/courses/${meta.courseId}/assignments/${meta.assignmentId}`
              : null
          }
          assignmentLabel={meta?.assignmentLabel ?? null}
        />
      </div>
    </div>
  );
}
