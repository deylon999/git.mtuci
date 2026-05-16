import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  Eye,
  GitBranch,
  GitCommit,
  GitPullRequest,
  HardDrive,
  Loader2,
  Scale,
  Star,
  Tag,
} from "lucide-react";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { pluralWord } from "../../i18n/plural";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import type { ThemeColors } from "../../theme";

interface RepoProjectSidebarProps {
  theme: ThemeColors;
  loading?: boolean;
  summary: StudentRepoSummary | null;
  repoId?: string;
  activeBranch?: string;
  onGoToReadme?: () => void;
  onOpenLicense?: (path: string) => void;
}

const LANG_COLORS: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  java: "#b07219",
  go: "#00ADD8",
  rust: "#dea584",
  html: "#e34c26",
  css: "#563d7c",
};

function formatCreatedOn(iso: string | null | undefined, dateLocale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" });
}

function formatSizeKb(kb: number | null | undefined): string | null {
  if (kb == null) return null;
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function StatRow({
  icon,
  label,
  theme,
  href,
}: {
  icon: ReactNode;
  label: string;
  theme: ThemeColors;
  href?: string;
}) {
  const inner = (
    <>
      <span className="shrink-0 opacity-80" style={{ color: theme.text2 }}>
        {icon}
      </span>
      <span>{label}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 py-1.5 text-sm hover:underline"
        style={{ color: theme.accent2 }}
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm" style={{ color: theme.text }}>
      {inner}
    </div>
  );
}

function ActionButton({
  theme,
  icon,
  label,
  count,
  onClick,
  href,
}: {
  theme: ThemeColors;
  icon: ReactNode;
  label: string;
  count?: number | null;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
      {count != null && count > 0 ? (
        <span className="tabular-nums opacity-80">{count}</span>
      ) : null}
    </>
  );
  const className =
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-opacity hover:opacity-90 min-w-0";
  const style = {
    borderColor: theme.border,
    backgroundColor: theme.bg4,
    color: theme.text,
  };

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}

export default function RepoProjectSidebar({
  theme,
  loading,
  summary,
  repoId,
  activeBranch,
  onGoToReadme,
  onOpenLicense,
}: RepoProjectSidebarProps) {
  const { t, tp, language } = useUserPreferences();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const lang = summary?.language?.toLowerCase() ?? "";
  const langColor = LANG_COLORS[lang] ?? theme.accent2;
  const createdLabel = formatCreatedOn(summary?.created_at ?? summary?.updated_at, dateLocale);
  const commitLabel = (n: number, approx: boolean) => {
    const suffix = approx ? "+" : "";
    const word = pluralWord(n, {
      one: t("repo.sidebar.commitOne"),
      few: t("repo.sidebar.commitFew"),
      many: t("repo.sidebar.commitMany"),
    });
    return `${n}${suffix} ${word}`;
  };
  const branchWord = (n: number) =>
    pluralWord(n, { one: t("repo.sidebar.branchOne"), few: t("repo.sidebar.branchMany"), many: t("repo.sidebar.branchMany") });
  const tagWord = (n: number) =>
    pluralWord(n, { one: t("repo.sidebar.tagOne"), few: t("repo.sidebar.tagMany"), many: t("repo.sidebar.tagMany") });
  const sizeLabel = formatSizeKb(summary?.size_kb);
  const links = summary?.gitea_links;
  const branch = activeBranch ?? summary?.default_branch ?? "main";

  return (
    <aside
      className="w-full xl:w-[280px] shrink-0 xl:sticky xl:top-4 rounded-xl border overflow-hidden"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
        <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
          {t("repo.sidebar.projectInfo")}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("repo.sidebar.loading")}
        </div>
      ) : (
        <div className="px-4 py-3 flex flex-col gap-4">
          <div className="flex gap-2">
            <ActionButton
              theme={theme}
              icon={<Star className="h-3.5 w-3.5" style={{ color: theme.warning }} />}
              label="Star"
              count={summary?.stars_count}
            />
            <ActionButton
              theme={theme}
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Watch"
              count={summary?.watchers_count}
            />
            <ActionButton
              theme={theme}
              icon={<GitPullRequest className="h-3.5 w-3.5" />}
              label="Fork"
              count={summary?.forks_count}
            />
          </div>

          {summary?.description ? (
            <p className="text-sm leading-relaxed" style={{ color: theme.text2 }}>
              {summary.description}
            </p>
          ) : (
            <p className="text-sm italic" style={{ color: theme.text3 }}>
              {t("repo.sidebar.noDescription")}
            </p>
          )}

          {summary?.language ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: theme.text3 }}>
                {t("repo.sidebar.languages")}
              </p>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                <div className="h-full rounded-full" style={{ width: "100%", backgroundColor: langColor }} />
              </div>
              <p className="mt-1.5 text-xs" style={{ color: theme.text2 }}>
                <span className="font-medium" style={{ color: langColor }}>
                  {summary.language.charAt(0).toUpperCase() + summary.language.slice(1)}
                </span>
                <span style={{ color: theme.text3 }}> · 100%</span>
              </p>
            </div>
          ) : null}

          <div className="border-t pt-3 space-y-0.5" style={{ borderColor: theme.border }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: theme.text3 }}>
              {t("repo.sidebar.repository")}
            </p>
            {summary?.commits_count != null ? (
              repoId ? (
                <Link
                  to={`/repositories/${repoId}/commits`}
                  state={{ branch }}
                  className="flex items-center gap-2.5 py-1.5 text-sm hover:underline"
                  style={{ color: theme.accent2 }}
                >
                  <GitCommit className="h-4 w-4" />
                  {commitLabel(summary.commits_count, summary.commits_count_approx)}
                </Link>
              ) : (
                <StatRow
                  theme={theme}
                  icon={<GitCommit className="h-4 w-4" />}
                  label={commitLabel(summary.commits_count, summary.commits_count_approx)}
                  href={links?.commits}
                />
              )
            ) : null}
            <StatRow
              theme={theme}
              icon={<GitBranch className="h-4 w-4" />}
              label={`${summary?.branches_count ?? 1} ${branchWord(summary?.branches_count ?? 1)}`}
            />
            <StatRow
              theme={theme}
              icon={<Tag className="h-4 w-4" />}
              label={`${summary?.tags_count ?? 0} ${tagWord(summary?.tags_count ?? 0)}`}
            />
            {summary?.open_issues_count != null ? (
              <StatRow
                theme={theme}
                icon={<span className="text-xs font-bold">●</span>}
                label={`${summary.open_issues_count} issues`}
                href={links?.issues}
              />
            ) : null}
            {summary?.open_pr_count != null ? (
              <StatRow
                theme={theme}
                icon={<GitPullRequest className="h-4 w-4" />}
                label={`${summary.open_pr_count} pull requests`}
                href={links?.pulls}
              />
            ) : null}
            {sizeLabel ? (
              <StatRow theme={theme} icon={<HardDrive className="h-4 w-4" />} label={sizeLabel} />
            ) : null}
          </div>

          {(summary?.has_readme || summary?.license_path) && (
            <div className="border-t pt-3 flex flex-col gap-1" style={{ borderColor: theme.border }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: theme.text3 }}>
                {t("repo.sidebar.files")}
              </p>
              {summary.has_readme ? (
                <button
                  type="button"
                  onClick={onGoToReadme}
                  className="flex items-center gap-2.5 py-1.5 text-sm text-left w-full hover:underline"
                  style={{ color: theme.accent2 }}
                >
                  <BookOpen className="h-4 w-4 shrink-0" />
                  README
                </button>
              ) : null}
              {summary.license_path ? (
                <button
                  type="button"
                  onClick={() => onOpenLicense?.(summary.license_path!)}
                  className="flex items-center gap-2.5 py-1.5 text-sm text-left w-full hover:underline"
                  style={{ color: theme.accent2 }}
                >
                  <Scale className="h-4 w-4 shrink-0" />
                  {summary.license_name ?? "LICENSE"}
                </button>
              ) : null}
            </div>
          )}

          {createdLabel ? (
            <div className="border-t pt-3" style={{ borderColor: theme.border }}>
              <p className="text-xs font-semibold mb-1" style={{ color: theme.text }}>
                {t("repo.sidebar.created")}
              </p>
              <p className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                {createdLabel}
              </p>
              {summary?.updated_at ? (
                <p className="text-[11px] mt-1" style={{ color: theme.text3 }}>
                  {tp("repo.sidebar.updatedAt", { time: formatRelativeTime(summary.updated_at) })}
                </p>
              ) : null}
            </div>
          ) : null}

          {repoId ? (
            <Link
              to={`/repositories/${repoId}/commits`}
              state={{ branch }}
              className="block w-full text-center rounded-lg border py-2 text-xs font-medium hover:opacity-90"
              style={{
                borderColor: `${theme.accent}55`,
                backgroundColor: `${theme.accent}14`,
                color: theme.accent2,
              }}
            >
              {t("repo.sidebar.fullCommitHistory")}
            </Link>
          ) : null}

          {summary?.recent_commits && summary.recent_commits.length > 0 ? (
            <div className="border-t pt-3" style={{ borderColor: theme.border }}>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: theme.text }}>
                <GitCommit className="h-3.5 w-3.5" />
                {t("repo.sidebar.recentCommits")}
              </p>
              <ul className="flex flex-col gap-2.5">
                {summary.recent_commits.map((c) => (
                  <li key={c.sha} className="text-xs leading-snug">
                    <p className="font-medium line-clamp-2" style={{ color: theme.text }} title={c.message}>
                      {c.message}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-1.5" style={{ color: theme.text3 }}>
                      {c.author_name ? <span>{c.author_name}</span> : null}
                      {c.committed_at ? (
                        <span>· {formatRelativeTime(c.committed_at)}</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
