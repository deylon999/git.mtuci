import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Download,
  Trash2,
  ChevronDown,
  MoreHorizontal,
  Lock,
  Unlock,
  Loader2,
  ExternalLink,
  Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import { CustomCheckbox } from "../components/CustomCheckbox";
import AdminPageHeader from "../components/AdminPageHeader";
import CreateRepositoryModal from "../components/CreateRepositoryModal";
import { API_URL } from "../api/client";
import {
  deleteAdminRepository,
  getAdminRepositories,
  toggleAdminRepositoryBlock,
  type AdminRepository,
} from "../api/adminApi";
import { getSystemInfo } from "../api/systemApi";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getGiteaPublicBase, resolveRepoLinks } from "../utils/giteaLinks";

type Repository = AdminRepository;

interface OverviewStats {
  total_users: number;
  total_students: number;
  total_repositories: number;
  total_commits: number;
  repositories_by_type: {
    public: number;
    private: number;
    course: number;
  };
}

const languageColors: Record<string, string> = {
  Python: "#3b82f6",
  JavaScript: "#eab308",
  TypeScript: "#3178c6",
  Java: "#f97316",
  "C++": "#ec4899",
  C: "#6b7280",
  "C#": "#9333ea",
  Go: "#06b6d4",
  Rust: "#f97316",
  Ruby: "#ef4444",
  PHP: "#8b5cf6",
  Swift: "#f97316",
  Kotlin: "#7c3aed",
  HTML: "#f97316",
  CSS: "#3b82f6",
  SQL: "#6b7280",
};

function getTypeBadge(type: Repository["repo_type"], t: (key: string) => string, isDarkTheme: boolean) {
  const styles = {
    public: isDarkTheme ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700",
    private: isDarkTheme ? "bg-gray-500/20 text-gray-400" : "bg-gray-100 text-gray-700",
    course: isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700",
  };
  const labels = {
    public: t("repo.visibility.public"),
    private: t("repo.visibility.private"),
    course: t("repo.visibility.course"),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function getRepoStatusBadge(isBlocked: boolean, isDarkTheme: boolean, t: (key: string) => string) {
  if (isBlocked) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
          isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700"
        }`}
      >
        {t("admin.dashboard.statusBlocked")}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        isDarkTheme ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700"
      }`}
    >
      {t("admin.dashboard.statusActive")}
    </span>
  );
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function downloadRepositoriesCsv(
  repos: Repository[],
  labels: {
    name: string;
    giteaName: string;
    type: string;
    language: string;
    owner: string;
    commits: string;
    status: string;
    cloneUrl: string;
    createdAt: string;
    statusActive: string;
    statusBlocked: string;
    typePublic: string;
    typePrivate: string;
    typeCourse: string;
  },
) {
  const typeLabel = (type: Repository["repo_type"]) => {
    if (type === "public") return labels.typePublic;
    if (type === "private") return labels.typePrivate;
    return labels.typeCourse;
  };

  const header = [
    labels.name,
    labels.giteaName,
    labels.type,
    labels.language,
    labels.owner,
    labels.commits,
    labels.status,
    labels.cloneUrl,
    labels.createdAt,
  ];

  const rows = repos.map((repo) => [
    repo.name,
    repo.gitea_repo_name ?? "",
    typeLabel(repo.repo_type),
    repo.language ?? "",
    repo.owner_full_name ?? "",
    repo.commits_count,
    repo.is_blocked ? labels.statusBlocked : labels.statusActive,
    repo.clone_url ?? "",
    repo.created_at,
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `repositories_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function getInitials(fullName: string | null): string {
  if (!fullName) return "??";
  const parts = fullName.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return fullName.slice(0, 2).toUpperCase();
}

function formatDate(
  dateStr: string,
  t: (key: string) => string,
  tp: (key: string, params?: Record<string, string | number | null | undefined>) => string,
  dateLocale: string,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("repo.repositories.justNow");
  if (diffMins < 60) return tp("repo.repositories.minutesAgo", { n: diffMins });
  if (diffHours < 24) return tp("repo.repositories.hoursAgo", { n: diffHours });
  if (diffDays === 1) return t("repo.repositories.yesterday");
  if (diffDays < 7) return tp("repo.repositories.daysAgo", { n: diffDays });
  return date.toLocaleDateString(dateLocale);
}

const FLOATING_MENU_Z_BACKDROP = 200;
const FLOATING_MENU_Z_PANEL = 201;

function computeFloatingMenuPosition(
  anchor: HTMLElement,
  menuWidth: number,
  menuHeightEstimate: number,
): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect();
  const margin = 6;
  let top = rect.bottom + margin;
  let left = rect.right - menuWidth;

  if (top + menuHeightEstimate > window.innerHeight - 8) {
    top = rect.top - menuHeightEstimate - margin;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
  top = Math.max(8, top);

  return { top, left };
}

function Dropdown({ label, value, options, onChange, isDarkTheme = true }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isDarkTheme?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const dropdownBtnBg = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d]" : "bg-gray-100 border-gray-300";
  const dropdownBtnText = isDarkTheme ? "text-[#ccd0d4]" : "text-slate-900";
  const dropdownIconColor = isDarkTheme ? "text-[#8b949e]" : "text-slate-500";
  const dropdownBg = isDarkTheme ? "bg-[#111111] border-[#2d2d2d]" : "bg-slate-100 border-slate-200";
  const dropdownItemHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-200";
  const dropdownItemText = isDarkTheme ? "text-[#8b949e]" : "text-slate-500";

  const selectedLabel = options.find((o) => o.value === value)?.label || label;

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex max-w-[10.5rem] items-center gap-2 border px-3 py-2 rounded-lg text-sm transition-colors ${dropdownBtnBg} ${dropdownBtnText}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 ${dropdownIconColor} transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div
          className={`absolute top-full left-0 z-50 mt-1.5 w-40 overflow-hidden rounded-xl border shadow-xl ${dropdownBg}`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full whitespace-nowrap px-3 py-2 text-left text-sm transition-colors ${
                value === option.value
                  ? isDarkTheme
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-blue-100 text-blue-700"
                  : `${dropdownItemText} ${dropdownItemHover}`
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface RepositoriesPageProps {
  isDarkTheme?: boolean;
}

export default function RepositoriesPage({ isDarkTheme = true }: RepositoriesPageProps) {
  const { t, tp, language } = useUserPreferences();
  const { user } = useAuthUser();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const [giteaBase, setGiteaBase] = useState(getGiteaPublicBase);
  // Data states
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [languageFilter, setLanguageFilter] = useState<string>("");
  const [blockedFilter, setBlockedFilter] = useState<string>("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Selection states
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<{
    repoId: string;
    top: number;
    left: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (!openRowMenu) return;
    const close = () => setOpenRowMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openRowMenu]);

  useEffect(() => {
    void getSystemInfo()
      .then((info) => {
        if (info.gitea_public_url?.trim()) {
          setGiteaBase(info.gitea_public_url.trim().replace(/\/$/, ""));
        }
      })
      .catch(() => {
        /* остаётся VITE_GITEA_PUBLIC_URL или localhost:3000 */
      });
  }, []);

  // Fetch stats
  useEffect(() => {
    fetchStats();
  }, []);

  // Fetch repositories when filters change
  useEffect(() => {
    fetchRepositories();
  }, [typeFilter, languageFilter, blockedFilter, limit, offset]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats/overview`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminRepositories({
        skip: offset,
        limit,
        repo_type: (typeFilter || undefined) as AdminRepository["repo_type"] | undefined,
        language: languageFilter || undefined,
        is_blocked: blockedFilter === "true" ? true : blockedFilter === "false" ? false : undefined,
      });
      setRepositories(data);
      // Estimate total from stats for now
      setTotalCount(stats?.total_repositories || data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async (repoId: string) => {
    setTogglingId(repoId);
    try {
      const updatedRepo = await toggleAdminRepositoryBlock(repoId);
      setRepositories((prev) =>
        prev.map((repo) =>
          repo.id === repoId ? { ...repo, is_blocked: updatedRepo.is_blocked } : repo
        )
      );
      toast.success(
        updatedRepo.is_blocked
          ? t("repo.repositories.blockSuccess")
          : t("repo.repositories.unblockSuccess"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("repo.repositories.blockError"));
    } finally {
      setTogglingId(null);
    }
  };

  const deleteRepo = async (repoId: string, repoName: string) => {
    if (!window.confirm(tp("repo.repositories.deleteConfirm", { name: repoName }))) {
      return;
    }
    setDeletingId(repoId);
    try {
      await deleteAdminRepository(repoId);
      setRepositories((prev) => prev.filter((repo) => repo.id !== repoId));
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        next.delete(repoId);
        return next;
      });
      setTotalCount((prev) => Math.max(0, prev - 1));
      toast.success(t("repo.repositories.deleteSuccess"));
      void fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("repo.repositories.deleteError"));
    } finally {
      setDeletingId(null);
      setOpenRowMenu(null);
    }
  };

  const deleteSelected = async () => {
    if (selectedRepos.size === 0) return;
    if (!window.confirm(tp("repo.repositories.deleteSelectedConfirm", { n: selectedRepos.size }))) {
      return;
    }
    setBulkDeleting(true);
    const ids = [...selectedRepos];
    try {
      for (const id of ids) {
        await deleteAdminRepository(id);
      }
      setRepositories((prev) => prev.filter((repo) => !selectedRepos.has(repo.id)));
      setSelectedRepos(new Set());
      setSelectAll(false);
      setTotalCount((prev) => Math.max(0, prev - ids.length));
      toast.success(t("repo.repositories.deleteSelectedSuccess"));
      reloadRepositories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("repo.repositories.deleteError"));
      reloadRepositories();
    } finally {
      setBulkDeleting(false);
    }
  };

  const reloadRepositories = () => {
    void fetchRepositories();
    void fetchStats();
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const repos = await getAdminRepositories({
        skip: 0,
        limit: 10_000,
        repo_type: (typeFilter || undefined) as AdminRepository["repo_type"] | undefined,
        language: languageFilter || undefined,
        is_blocked: blockedFilter === "true" ? true : blockedFilter === "false" ? false : undefined,
      });
      downloadRepositoriesCsv(repos, {
        name: t("repo.repositories.colRepository"),
        giteaName: "Gitea",
        type: t("admin.repositories.colType"),
        language: t("repo.repositories.colLanguage"),
        owner: t("admin.repositories.colOwner"),
        commits: t("repo.repositories.colCommits"),
        status: t("admin.repositories.colStatus"),
        cloneUrl: "Clone URL",
        createdAt: t("admin.forks.colDate"),
        statusActive: t("admin.dashboard.statusActive"),
        statusBlocked: t("admin.dashboard.statusBlocked"),
        typePublic: t("repo.visibility.public"),
        typePrivate: t("repo.visibility.private"),
        typeCourse: t("repo.visibility.course"),
      });
      toast.success(t("repo.repositories.exportSuccess"));
    } catch {
      toast.error(t("repo.repositories.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedRepos(new Set());
    } else {
      setSelectedRepos(new Set(repositories.map((r) => r.id)));
    }
    setSelectAll(!selectAll);
  };

  const toggleRepo = (id: string) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRepos(newSelected);
    setSelectAll(newSelected.size === repositories.length);
  };

  const getStatsData = () => {
    if (!stats) return [];
    const blockedCount = repositories.filter((r) => r.is_blocked).length; // Approximate
    return [
      { label: t("repo.repositories.statTotal"), value: stats.total_repositories, color: isDarkTheme ? "text-white" : "text-gray-900" },
      { label: t("repo.repositories.statPublic"), value: stats.repositories_by_type.public, color: "text-emerald-400" },
      { label: t("repo.repositories.statPrivate"), value: stats.repositories_by_type.private, color: "text-gray-400" },
      { label: t("repo.repositories.statCourse"), value: stats.repositories_by_type.course, color: "text-blue-400" },
      { label: t("repo.repositories.statBlocked"), value: blockedCount, color: "text-red-400" },
    ];
  };

  const typeOptions = [
    { value: "", label: t("repo.repositories.filterAllTypes") },
    { value: "public", label: t("repo.visibility.public") },
    { value: "private", label: t("repo.visibility.private") },
    { value: "course", label: t("repo.visibility.course") },
  ];

  const blockedOptions = [
    { value: "", label: t("repo.repositories.filterAllStatuses") },
    { value: "false", label: t("repo.repositories.filterActive") },
    { value: "true", label: t("repo.repositories.filterBlocked") },
  ];

  const limitOptions = [
    { value: "10", label: "10" },
    { value: "20", label: "20" },
    { value: "50", label: "50" },
    { value: "100", label: "100" },
  ];

  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (error) {
    return (
      <div className={`min-h-[40vh] flex items-center justify-center ${isDarkTheme ? "bg-[#0f0f10] text-white" : "bg-gray-50 text-gray-900"}`}>
        <div className="text-center">
          <p className="text-red-400 mb-2">{t("repo.repositories.loadError")}</p>
          <p className={isDarkTheme ? "text-[#8b949e]" : "text-gray-500"}>{error}</p>
          <button
            onClick={fetchRepositories}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg text-sm"
          >
            {t("repo.repositories.retry")}
          </button>
        </div>
      </div>
    );
  }

  const pageBg = isDarkTheme ? "bg-[#0f0f10] text-white" : "bg-slate-50 text-slate-900";
  const cardBg = isDarkTheme ? "bg-[#111111]" : "bg-slate-100 shadow-sm";
  const headerActionBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-slate-100 border-slate-200 shadow-sm";
  const headerActionHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-200";
  const filterInputBg = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d]" : "bg-gray-100 border-gray-300";
  const cardBgLight = isDarkTheme ? "bg-[#0d0d0d]" : "bg-slate-200";
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const textSecondary = isDarkTheme ? "text-gray-500" : "text-slate-500";
  const textTertiary = isDarkTheme ? "text-[#8b949e]" : "text-slate-400";
  const inputBg = filterInputBg;
  const inputText = isDarkTheme ? "text-[#ccd0d4]" : "text-slate-900";
  const inputPlaceholder = isDarkTheme ? "placeholder-[#6e7681]" : "placeholder-slate-400";
  const tableHeaderText = isDarkTheme ? "text-[#6e7681]" : "text-slate-400";
  const tableRowBg = isDarkTheme ? "bg-[#111111]" : "";
  const tableRowHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-100";
  const tableBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-slate-200";
  const btnBg = isDarkTheme ? "bg-[#111111] border-[#30363d] hover:bg-[#252525]" : "bg-slate-100 border-slate-200 hover:bg-slate-200";
  const btnText = isDarkTheme ? "text-[#8b949e]" : "text-slate-500";
  const btnTextHover = isDarkTheme ? "hover:text-[#ccd0d4]" : "hover:text-slate-900";
  const actionBtnHover = isDarkTheme ? "hover:bg-[#30363d] hover:text-[#ccd0d4]" : "hover:bg-gray-300 hover:text-gray-900";
  const actionBtnColor = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const menuItemText = isDarkTheme ? "text-[#ccd0d4]" : "text-slate-900";
  const menuItemHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-200";

  return (
    <div className={pageBg}>
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-20">
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("repo.repositories.title")}
          subtitle={tp("repo.repositories.reposCount", { n: totalCount })}
          actions={
            <>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExportCsv()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors shadow-sm ${headerActionBg} ${headerActionHover} ${exporting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Download className="h-4 w-4" />
                {exporting ? t("repo.repositories.exporting") : t("repo.repositories.exportCsv")}
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm ${isDarkTheme ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
              >
                <Plus className="h-4 w-4" />
                {t("repo.repositories.createRepo")}
              </button>
            </>
          }
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {getStatsData().map((stat) => (
            <div key={stat.label} className={`${cardBg} rounded-xl p-4 border ${tableBorder}`}>
              <p className={`text-xs ${tableHeaderText} mb-1`}>{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className={`${cardBg} rounded-xl p-4 border ${tableBorder} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${tableHeaderText}`} />
              <input
                type="text"
                placeholder={t("repo.repositories.searchPlaceholder")}
                className={`w-64 pl-10 pr-4 py-2 ${filterInputBg} rounded-lg text-sm ${inputText} ${inputPlaceholder} focus:outline-none focus:border-[#484f58] transition-colors`}
              />
            </div>
            <div className="flex items-center gap-2">
              <Dropdown
                label={t("repo.repositories.filterAllTypes")}
                value={typeFilter}
                options={typeOptions}
                onChange={setTypeFilter}
                isDarkTheme={isDarkTheme}
              />
              <Dropdown
                label={t("repo.repositories.filterAllStatuses")}
                value={blockedFilter}
                options={blockedOptions}
                onChange={setBlockedFilter}
                isDarkTheme={isDarkTheme}
              />
            </div>
          </div>
          {selectedRepos.size > 0 && (
            <button
              type="button"
              disabled={bulkDeleting}
              onClick={() => void deleteSelected()}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {tp("repo.repositories.deleteSelected", { n: selectedRepos.size })}
            </button>
          )}
        </div>

        {/* Table */}
        <div className={`${cardBg} rounded-xl border ${tableBorder} overflow-hidden`}>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className={`border-b ${tableBorder}`}>
                <th className="w-10 py-3 px-4">
                  <CustomCheckbox checked={selectAll} onChange={toggleSelectAll} isDarkTheme={isDarkTheme} />
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("repo.repositories.colRepository")}
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("admin.repositories.colType")}
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("repo.repositories.colLanguage")}
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("admin.repositories.colOwner")}
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("repo.repositories.colCommits")}
                </th>
                <th className={`py-3 px-4 text-left text-xs font-medium ${tableHeaderText} uppercase tracking-wider`}>
                  {t("admin.repositories.colStatus")}
                </th>
                <th className="w-10 py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Loader2 className={`h-8 w-8 animate-spin mx-auto ${tableHeaderText}`} />
                  </td>
                </tr>
              ) : repositories.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`py-12 text-center ${tableHeaderText}`}>
                    {t("repo.repositories.notFound")}
                  </td>
                </tr>
              ) : (
                repositories.map((repo) => (
                  <tr
                    key={repo.id}
                    className={`border-b ${tableBorder} last:border-b-0 ${tableRowBg} ${tableRowHover} transition-colors ${repo.is_blocked ? "opacity-60" : ""}`}
                  >
                    <td className="py-3 px-4">
                      <CustomCheckbox
                        checked={selectedRepos.has(repo.id)}
                        onChange={() => toggleRepo(repo.id)}
                        isDarkTheme={isDarkTheme}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded ${cardBgLight} flex items-center justify-center text-xs font-medium ${inputText}`}>
                          {getInitials(repo.owner_full_name)}
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${inputText}`}>{repo.name}</p>
                          <p className={`text-xs ${tableHeaderText}`}>{repo.gitea_repo_name || repo.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">{getTypeBadge(repo.repo_type, t, isDarkTheme)}</td>
                    <td className="py-3 px-4">
                      {repo.language ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: languageColors[repo.language] || "#6b7280" }}
                          />
                          <span className={`text-sm ${textTertiary}`}>{repo.language}</span>
                        </div>
                      ) : (
                        <span className={`text-sm ${tableHeaderText}`}>—</span>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-sm ${textTertiary}`}>
                      {repo.owner_full_name || "—"}
                    </td>
                    <td className={`py-3 px-4 text-sm font-semibold ${inputText}`}>
                      {repo.commits_count}
                    </td>
                    <td className="py-3 px-4">{getRepoStatusBadge(repo.is_blocked, isDarkTheme, t)}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (openRowMenu?.repoId === repo.id) {
                            setOpenRowMenu(null);
                            return;
                          }
                          const pos = computeFloatingMenuPosition(e.currentTarget, 208, 132);
                          setOpenRowMenu({ repoId: repo.id, ...pos });
                        }}
                        className={`p-1.5 rounded-lg ${actionBtnHover} ${actionBtnColor} transition-colors`}
                        aria-label={t("repo.repositories.actionsMenu")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${tableHeaderText}`}>
            {tp("repo.repositories.shownOf", { shown: repositories.length, total: totalCount })}
          </p>
          <div className="flex items-center gap-2">
            {currentPage > 1 && (
              <button
                onClick={() => setOffset((p) => Math.max(0, p - limit))}
                className={`px-3 py-1.5 ${btnBg} ${btnText} text-sm font-medium rounded-lg transition-colors`}
              >
                ←
              </button>
            )}
            <span className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg">
              {currentPage}
            </span>
            {currentPage < totalPages && (
              <button
                onClick={() => setOffset((p) => p + limit)}
                className={`px-3 py-1.5 ${btnBg} ${btnText} text-sm font-medium rounded-lg transition-colors`}
              >
                →
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${tableHeaderText}`}>{t("repo.repositories.perPage")}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
              className={`${inputBg} rounded-lg text-sm ${btnText} py-1 px-2 focus:outline-none focus:border-[#484f58]`}
            >
              {limitOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className={`text-sm ${tableHeaderText}`}>{t("repo.repositories.onPage")}</span>
          </div>
        </div>
      </div>

      {openRowMenu &&
        (() => {
          const menuRepo = repositories.find((r) => r.id === openRowMenu.repoId);
          if (!menuRepo) return null;
          return createPortal(
            <>
              <div
                className="fixed inset-0"
                style={{ zIndex: FLOATING_MENU_Z_BACKDROP }}
                onClick={() => setOpenRowMenu(null)}
              />
              <div
                className={`fixed w-52 ${cardBg} border ${tableBorder} rounded-xl shadow-xl overflow-hidden py-1`}
                style={{
                  zIndex: FLOATING_MENU_Z_PANEL,
                  top: openRowMenu.top,
                  left: openRowMenu.left,
                }}
              >
                <button
                  type="button"
                  disabled={togglingId === menuRepo.id}
                  onClick={() => {
                    void toggleBlock(menuRepo.id);
                    setOpenRowMenu(null);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors disabled:opacity-50 ${menuItemText} ${menuItemHover}`}
                >
                  {togglingId === menuRepo.id ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : menuRepo.is_blocked ? (
                    <Unlock className="h-4 w-4 shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0" />
                  )}
                  {menuRepo.is_blocked
                    ? t("repo.repositories.actionUnblock")
                    : t("repo.repositories.actionBlock")}
                </button>
                {(() => {
                  const { webUrl, cloneUrl } = resolveRepoLinks(menuRepo, { giteaBase });
                  return (
                    <>
                      {webUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            window.open(webUrl, "_blank", "noopener,noreferrer");
                            setOpenRowMenu(null);
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${menuItemText} ${menuItemHover}`}
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          {t("repo.repositories.actionOpen")}
                        </button>
                      ) : null}
                      {cloneUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(cloneUrl).then(() => {
                              toast.success(t("repo.repositories.copyCloneSuccess"));
                              setOpenRowMenu(null);
                            });
                          }}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${menuItemText} ${menuItemHover}`}
                        >
                          <Copy className="h-4 w-4 shrink-0" />
                          {t("repo.repositories.actionCopyClone")}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
                <button
                  type="button"
                  disabled={deletingId === menuRepo.id}
                  onClick={() => {
                    void deleteRepo(menuRepo.id, menuRepo.name);
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors disabled:opacity-50 text-red-400 ${isDarkTheme ? "hover:bg-red-500/10" : "hover:bg-red-50"}`}
                >
                  {deletingId === menuRepo.id ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0" />
                  )}
                  {t("repo.repositories.actionDelete")}
                </button>
              </div>
            </>,
            document.body,
          );
        })()}

      <CreateRepositoryModal
        isOpen={createModalOpen}
        isDarkTheme={isDarkTheme}
        onClose={() => setCreateModalOpen(false)}
        onCreated={reloadRepositories}
      />
    </div>
  );
}
