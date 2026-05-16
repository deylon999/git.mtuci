import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Copy,
  Eye,
  FolderGit2,
  GitBranch,
  GitFork,
  Github,
  GitCommit,
  GitPullRequest,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import CreateRepositoryModal from "../components/CreateRepositoryModal";
import DeleteRepositoryDialog from "../components/DeleteRepositoryDialog";
import EditRepositoryModal from "../components/EditRepositoryModal";
import {
  deleteStudentRepository,
  getStudentForks,
  getStudentRepositories,
  type StudentRepositoriesStats,
  type StudentRepositoryItem,
} from "../api/studentDashboardApi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { pluralWord } from "../i18n/plural";
import type { Locale } from "../i18n";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme } from "../theme";

const LANG_COLORS: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  java: "#b07219",
  "c++": "#f34b7d",
  cpp: "#f34b7d",
};

const AVATAR_PALETTE = [
  { bg: "rgba(37,99,235,0.15)", color: "#60a5fa" },
  { bg: "rgba(139,92,246,0.15)", color: "#a78bfa" },
  { bg: "rgba(76,175,80,0.15)", color: "#4caf50" },
  { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  { bg: "rgba(226,75,74,0.15)", color: "#e24b4a" },
];

type VisibilityFilter = "all" | "public" | "private" | "course";
type SortKey = "activity" | "date" | "commits" | "name";

function repoInitials(name: string): string {
  const parts = name.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

function formatCommitCount(count: number, approx: boolean, locale: Locale): string {
  const suffix = approx ? "+" : "";
  return `${count}${suffix} ${pluralWord(locale, "student.plural.commits", count)}`;
}

function capitalizeLanguage(lang: string): string {
  if (!lang) return lang;
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

function visibilityBadge(visibility: string, source: string) {
  if (source === "assignment") return { label: "Course", variant: "info" as const };
  if (visibility === "public") return { label: "Public", variant: "ok" as const };
  if (visibility === "course") return { label: "Course", variant: "info" as const };
  return { label: "Private", variant: "gray" as const };
}

interface StudentRepositoriesPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoriesPage({ isDarkTheme = false }: StudentRepositoriesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StudentRepositoriesStats | null>(null);
  const [repos, setRepos] = useState<StudentRepositoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VisibilityFilter>("all");
  const [langFilter, setLangFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("activity");
  const [createOpen, setCreateOpen] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [forkPaths, setForkPaths] = useState<Set<string>>(new Set());
  const [editRepo, setEditRepo] = useState<StudentRepositoryItem | null>(null);
  const [deleteRepo, setDeleteRepo] = useState<StudentRepositoryItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, forks] = await Promise.all([getStudentRepositories(), getStudentForks(200)]);
      setStats(data.stats);
      setRepos(data.repositories);
      setForkPaths(new Set(forks.map((f) => f.fork_repo_path)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("student.errors.loadRepos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (location.pathname === "/repositories/new") {
      setCreateOpen(true);
    }
  }, [location.pathname]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    repos.forEach((r) => {
      if (r.language) set.add(r.language);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [repos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = repos.filter((repo) => {
      if (typeFilter === "public" && repo.visibility !== "public") return false;
      if (typeFilter === "private" && repo.visibility !== "private") return false;
      if (typeFilter === "course" && repo.source !== "assignment" && repo.visibility !== "course") return false;
      if (langFilter !== "all" && (repo.language ?? "") !== langFilter) return false;
      if (!q) return true;
      const hay = [repo.name, repo.description, repo.gitea_path, repo.language, repo.assignment_label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ru");
      if (sort === "commits") return (b.commits_count ?? 0) - (a.commits_count ?? 0);
      if (sort === "date") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return list;
  }, [repos, search, typeFilter, langFilter, sort]);

  const handleCopyClone = async (repo: StudentRepositoryItem) => {
    if (!repo.clone_url) return;
    const text = `git clone ${repo.clone_url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyId(repo.id);
      setTimeout(() => setCopyId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const confirmDelete = async () => {
    if (!deleteRepo) return;
    const repoId = deleteRepo.repository_id ?? deleteRepo.id;
    if (!deleteRepo.can_delete) return;
    setDeletingId(deleteRepo.id);
    try {
      await deleteStudentRepository(repoId);
      setDeleteRepo(null);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("student.errors.deleteRepo"));
    } finally {
      setDeletingId(null);
    }
  };

  const avgCommitsPerDay =
    stats && stats.commits_week > 0 ? (stats.commits_week / 7).toFixed(1) : "0";

  return (
    <div className="w-full flex flex-col gap-3.5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
            {t("student.repos.title")}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
            {loading
              ? t("common.loading")
              : stats
                ? tp("student.repos.subtitleStats", {
                    repos: `${stats.total} ${pluralWord(language, "student.plural.repos", stats.total)}`,
                    commits: `${stats.total_commits} ${pluralWord(language, "student.plural.commits", stats.total_commits)}`,
                  })
                : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title={t("featurePlaceholder.soon")}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium opacity-50 cursor-not-allowed"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
          >
            <Github className="h-3.5 w-3.5" />
            {t("student.repos.importGithub")}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: `${theme.success}18`,
              borderColor: `${theme.success}40`,
              color: theme.success,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("student.repos.create")}
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ backgroundColor: `${theme.danger}12`, borderColor: `${theme.danger}40`, color: theme.danger }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          {
            label: t("student.repos.statTotal"),
            value: stats?.total ?? "—",
            sub:
              stats && stats.repos_week_delta > 0
                ? tp("student.repos.reposWeekDelta", { n: stats.repos_week_delta })
                : stats
                  ? t("student.repos.reposNoNewWeek")
                  : "",
          },
          {
            label: t("student.repos.statPublic"),
            value: stats?.public_count ?? "—",
            sub: t("student.repos.statPublicSub"),
            color: theme.success,
          },
          {
            label: t("student.repos.statPrivate"),
            value: stats ? stats.private_count + stats.course_count : "—",
            sub: t("student.repos.statPrivateSub"),
          },
          {
            label: t("student.repos.statCommitsWeek"),
            value: stats?.commits_week ?? "—",
            sub: tp("student.repos.statCommitsAvg", { avg: avgCommitsPerDay }),
            color: theme.accent2,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border px-3.5 py-3"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <p className="text-xs" style={{ color: theme.text2 }}>
              {card.label}
            </p>
            <p className="mt-0.5 text-xl font-semibold" style={{ color: card.color ?? theme.text }}>
              {loading ? "…" : card.value}
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: theme.text2 }}>
              {card.sub}
            </p>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        <div
          className="flex flex-1 min-w-[200px] items-center gap-2 rounded-lg border px-2.5 py-1.5"
          style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: theme.text3 }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("student.repos.searchPlaceholder")}
            className="w-full bg-transparent text-xs outline-none"
            style={{ color: theme.text }}
          />
        </div>
        <div className="h-5 w-px shrink-0 hidden sm:block" style={{ backgroundColor: theme.border }} />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as VisibilityFilter)}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
        >
          <option value="all">{t("student.repos.filterAllTypes")}</option>
          <option value="public">{t("student.repos.visibilityPublic")}</option>
          <option value="private">{t("student.repos.visibilityPrivate")}</option>
          <option value="course">{t("student.repos.visibilityCourse")}</option>
        </select>
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
        >
          <option value="all">{t("student.repos.filterAllLangs")}</option>
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
        >
          <option value="activity">{t("student.repos.sortActivity")}</option>
          <option value="date">{t("student.repos.sortDate")}</option>
          <option value="commits">{t("student.repos.sortCommits")}</option>
          <option value="name">{t("student.repos.sortName")}</option>
        </select>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className="px-2 py-1.5"
            style={{
              backgroundColor: viewMode === "grid" ? theme.bg4 : theme.bg,
              color: viewMode === "grid" ? theme.text : theme.text2,
            }}
            title={t("student.repos.viewGrid")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="px-2 py-1.5 border-l"
            style={{
              borderColor: theme.border,
              backgroundColor: viewMode === "list" ? theme.bg4 : theme.bg,
              color: viewMode === "list" ? theme.text : theme.text2,
            }}
            title={t("student.repos.viewList")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("student.repos.loading")}
        </div>
      ) : filtered.length === 0 && repos.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border py-16 text-center"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <FolderGit2 className="h-10 w-10" style={{ color: theme.text3 }} />
          <p className="text-sm font-medium" style={{ color: theme.text2 }}>
            {t("student.repos.empty")}
          </p>
          <p className="text-xs max-w-sm" style={{ color: theme.text3 }}>
            {t("student.repos.emptyHint")}
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: `${theme.success}18`,
              borderColor: `${theme.success}40`,
              color: theme.success,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("student.repos.create")}
          </button>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
              : "flex flex-col gap-2"
          }
        >
          {filtered.map((repo) => {
            const av = avatarStyle(repo.id);
            const badge = visibilityBadge(repo.visibility, repo.source);
            const isFork = repo.gitea_path ? forkPaths.has(repo.gitea_path) : false;
            const langKey = (repo.language ?? "").toLowerCase();
            const langColor = LANG_COLORS[langKey] ?? theme.text3;
            const webUrl = repo.gitea_web_url;
            const browseState = {
              name: repo.name,
              giteaPath: repo.gitea_path,
              giteaWebUrl: repo.gitea_web_url,
              cloneUrl: repo.clone_url,
              description: repo.description,
              language: repo.language,
            };
            const openCodeBrowser = () =>
              navigate(`/repositories/${repo.id}/code`, { state: browseState });

            return (
              <article
                  key={repo.id}
                  role="button"
                  tabIndex={0}
                  onClick={openCodeBrowser}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCodeBrowser();
                    }
                  }}
                  className={`flex h-full gap-2.5 rounded-xl border p-4 transition-colors hover:border-opacity-80 cursor-pointer ${
                    viewMode === "list" ? "flex-row items-center" : "flex-col"
                  }`}
                  style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = theme.accent2;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: av.bg, color: av.color }}
                    >
                      {repoInitials(repo.name)}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {isFork ? (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: `${theme.accent}20`, color: theme.accent2 }}
                        >
                          <GitFork className="h-2.5 w-2.5" />
                          Fork
                        </span>
                      ) : null}
                      <span
                        className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor:
                            badge.variant === "ok"
                              ? `${theme.success}20`
                              : badge.variant === "info"
                                ? `${theme.accent}20`
                                : theme.bg4,
                          color:
                            badge.variant === "ok"
                              ? theme.success
                              : badge.variant === "info"
                                ? theme.accent2
                                : theme.text2,
                          border: badge.variant === "gray" ? `1px solid ${theme.border}` : undefined,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-sm font-medium truncate" style={{ color: theme.text }}>
                      {repo.name}
                    </h2>
                    {repo.gitea_path ? (
                      <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: theme.text2 }}>
                        {repo.gitea_path}
                      </p>
                    ) : null}
                  </div>

                  {repo.description || repo.assignment_label ? (
                    <p className="text-xs leading-relaxed line-clamp-2 flex-1" style={{ color: theme.text2 }}>
                      {repo.description ?? repo.assignment_label}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {(repo.clone_url || repo.gitea_path) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleCopyClone(repo);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left font-mono text-[10px] truncate transition-colors"
                      style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text2 }}
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span className="truncate flex-1">
                        {repo.clone_url ?? `git clone …/${repo.gitea_path}.git`}
                      </span>
                      {copyId === repo.id ? (
                        <span className="text-[10px] shrink-0" style={{ color: theme.success }}>
                          {t("common.copied")}
                        </span>
                      ) : null}
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 text-[11px]" style={{ color: theme.text2 }}>
                    {repo.language ? (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: langColor }}
                        />
                        {capitalizeLanguage(repo.language)}
                      </span>
                    ) : null}
                    {repo.commits_count != null ? (
                      <span className="inline-flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {formatCommitCount(repo.commits_count, repo.commits_count_approx, language)}
                      </span>
                    ) : null}
                    {repo.forks_count != null && repo.forks_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.forks_count} {pluralWord(language, "student.plural.forks", repo.forks_count)}
                      </span>
                    ) : null}
                    {repo.open_pr_count != null && repo.open_pr_count > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: theme.warning }}>
                        <GitPullRequest className="h-3 w-3" />
                        {repo.open_pr_count} PR
                      </span>
                    ) : null}
                    {repo.stars_count != null && repo.stars_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {repo.stars_count}{" "}
                        {pluralWord(language, "student.plural.stars", repo.stars_count)}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className="flex items-center justify-between pt-2 border-t"
                    style={{ borderColor: theme.border }}
                  >
                    <span className="text-[10px]" style={{ color: theme.text3 }}>
                      {formatRelativeTime(repo.updated_at, new Date(), language)}
                    </span>
                    <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCodeBrowser();
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                        style={{ borderColor: theme.border, color: theme.text2 }}
                        title={t("student.repos.viewFiles")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {repo.source === "assignment" && repo.course_id && repo.assignment_id ? (
                        <Link
                          to={`/courses/${repo.course_id}/assignments/${repo.assignment_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          title={t("student.repos.goToAssignment")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      ) : repo.repository_id && repo.source === "personal" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditRepo(repo);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          title={t("common.edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : webUrl ? (
                        <a
                          href={`${webUrl}/settings`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          title={t("student.repos.giteaSettings")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {repo.can_delete ? (
                        <button
                          type="button"
                          disabled={deletingId === repo.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteRepo(repo);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-50"
                          style={{ borderColor: theme.border, color: theme.danger }}
                          title={t("common.delete")}
                        >
                          {deletingId === repo.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed p-4 text-center opacity-80 transition-opacity hover:opacity-100"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: theme.bg4 }}
            >
              <Plus className="h-5 w-5" style={{ color: theme.text3 }} />
            </div>
            <p className="text-xs font-medium" style={{ color: theme.text2 }}>
              {t("student.repos.create")}
            </p>
            <p className="text-[11px]" style={{ color: theme.text3 }}>
              {t("student.repos.newProjectHint")}
            </p>
            <span
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: `${theme.success}18`,
                borderColor: `${theme.success}40`,
                color: theme.success,
              }}
            >
              {t("student.repos.createShort")}
            </span>
          </button>
        </div>
      )}

      {!loading && repos.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: theme.text2 }}>
          {t("student.repos.noFilterMatch")}
        </p>
      ) : null}

      <CreateRepositoryModal
        isOpen={createOpen}
        isDarkTheme={isDarkTheme}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void load();
        }}
      />
      {editRepo?.repository_id ? (
        <EditRepositoryModal
          isOpen
          isDarkTheme={isDarkTheme}
          repositoryId={editRepo.repository_id}
          initialName={editRepo.name}
          initialDescription={editRepo.description}
          onClose={() => setEditRepo(null)}
          onSaved={() => void load()}
        />
      ) : null}
      <DeleteRepositoryDialog
        isOpen={deleteRepo != null}
        isDarkTheme={isDarkTheme}
        repoName={deleteRepo?.name ?? ""}
        loading={deletingId != null}
        onClose={() => setDeleteRepo(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
