import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Copy,
  Eye,
  FolderGit2,
  GitBranch,
  Github,
  GitCommit,
  GitPullRequest,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import CreateRepositoryModal from "../components/CreateRepositoryModal";
import {
  deleteStudentRepository,
  getStudentRepositories,
  type StudentRepositoriesStats,
  type StudentRepositoryItem,
} from "../api/studentDashboardApi";
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

function pluralCommits(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "коммитов";
  if (mod10 === 1) return "коммит";
  if (mod10 >= 2 && mod10 <= 4) return "коммита";
  return "коммитов";
}

function pluralRepos(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "репозиториев";
  if (mod10 === 1) return "репозиторий";
  if (mod10 >= 2 && mod10 <= 4) return "репозитория";
  return "репозиториев";
}

function formatCommitCount(count: number, approx: boolean): string {
  const suffix = approx ? "+" : "";
  return `${count}${suffix} ${pluralCommits(count)}`;
}

function pluralForks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "форков";
  if (mod10 === 1) return "форк";
  if (mod10 >= 2 && mod10 <= 4) return "форка";
  return "форков";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentRepositories();
      setStats(data.stats);
      setRepos(data.repositories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить репозитории");
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

  const handleDelete = async (repo: StudentRepositoryItem) => {
    const repoId = repo.repository_id ?? repo.id;
    if (!repo.can_delete) return;
    if (!window.confirm(`Удалить репозиторий «${repo.name}»? Это действие нельзя отменить.`)) return;
    setDeletingId(repo.id);
    try {
      await deleteStudentRepository(repoId);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось удалить репозиторий");
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
            Мои репозитории
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
            {loading
              ? "Загрузка…"
              : stats
                ? `${stats.total} ${pluralRepos(stats.total)} · ${stats.total_commits} ${pluralCommits(stats.total_commits)} всего`
                : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Скоро"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium opacity-50 cursor-not-allowed"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
          >
            <Github className="h-3.5 w-3.5" />
            Импорт из GitHub
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
            Создать репозиторий
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
            label: "Всего репозиториев",
            value: stats?.total ?? "—",
            sub:
              stats && stats.repos_week_delta > 0
                ? `+${stats.repos_week_delta} на этой неделе`
                : stats
                  ? "Без новых на этой неделе"
                  : "",
          },
          {
            label: "Публичных",
            value: stats?.public_count ?? "—",
            sub: "Видны всем",
            color: theme.success,
          },
          {
            label: "Приватных / курсовых",
            value: stats ? stats.private_count + stats.course_count : "—",
            sub: "Личные и по заданиям",
          },
          {
            label: "Коммитов за неделю",
            value: stats?.commits_week ?? "—",
            sub: `Среднее ${avgCommitsPerDay}/день`,
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
            placeholder="Поиск по названию, языку, описанию…"
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
          <option value="all">Все типы</option>
          <option value="public">Публичный</option>
          <option value="private">Приватный</option>
          <option value="course">Курсовой / задание</option>
        </select>
        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
        >
          <option value="all">Все языки</option>
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
          <option value="activity">Сортировка: активность</option>
          <option value="date">По дате</option>
          <option value="commits">По коммитам</option>
          <option value="name">По имени</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          Загрузка репозиториев…
        </div>
      ) : filtered.length === 0 && repos.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border py-16 text-center"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <FolderGit2 className="h-10 w-10" style={{ color: theme.text3 }} />
          <p className="text-sm font-medium" style={{ color: theme.text2 }}>
            Пока нет репозиториев
          </p>
          <p className="text-xs max-w-sm" style={{ color: theme.text3 }}>
            Создайте личный репозиторий или откройте задание в курсе — репозиторий появится здесь автоматически.
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
            Создать репозиторий
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((repo) => {
            const av = avatarStyle(repo.id);
            const badge = visibilityBadge(repo.visibility, repo.source);
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
                  className="flex h-full flex-col gap-2.5 rounded-xl border p-4 transition-colors hover:border-opacity-80 cursor-pointer"
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
                          Скопировано
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
                        {formatCommitCount(repo.commits_count, repo.commits_count_approx)}
                      </span>
                    ) : null}
                    {repo.forks_count != null && repo.forks_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.forks_count} {pluralForks(repo.forks_count)}
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
                        {repo.stars_count === 1 ? "звезда" : repo.stars_count < 5 ? "звезды" : "звёзд"}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className="flex items-center justify-between pt-2 border-t"
                    style={{ borderColor: theme.border }}
                  >
                    <span className="text-[10px]" style={{ color: theme.text3 }}>
                      {formatRelativeTime(repo.updated_at)}
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
                        title="Просмотр файлов"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {repo.source === "assignment" && repo.course_id && repo.assignment_id ? (
                        <Link
                          to={`/courses/${repo.course_id}/assignments/${repo.assignment_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          title="Перейти к заданию"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      ) : webUrl ? (
                        <a
                          href={`${webUrl}/settings`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors hover:opacity-90"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          title="Настройки репозитория"
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
                            void handleDelete(repo);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-50"
                          style={{ borderColor: theme.border, color: theme.danger }}
                          title="Удалить"
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
              Создать репозиторий
            </p>
            <p className="text-[11px]" style={{ color: theme.text3 }}>
              Начните новый проект
            </p>
            <span
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: `${theme.success}18`,
                borderColor: `${theme.success}40`,
                color: theme.success,
              }}
            >
              + Создать
            </span>
          </button>
        </div>
      )}

      {!loading && repos.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: theme.text2 }}>
          Ничего не найдено по фильтрам
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
    </div>
  );
}
