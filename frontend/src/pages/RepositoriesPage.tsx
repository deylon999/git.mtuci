import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  Download,
  Trash2,
  ChevronDown,
  Star,
  MoreHorizontal,
  Lock,
  Unlock,
  Loader2,
} from "lucide-react";
import { CustomCheckbox } from "../components/CustomCheckbox";
import { API_URL } from "../api/client";
import { getAdminRepositories } from "../api/adminApi";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface Repository {
  id: string;
  name: string;
  description: string | null;
  gitea_repo_name: string | null;
  clone_url: string | null;
  owner_id: string;
  owner_full_name: string | null;
  commits_count: number;
  is_public: boolean;
  repo_type: "public" | "private" | "course";
  language: string | null;
  is_blocked: boolean;
  faculty_id: string | null;
  created_at: string;
  updated_at: string;
}

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

function getTypeBadge(type: Repository["repo_type"], t: (key: string) => string) {
  const styles = {
    public: "bg-emerald-500/15 text-emerald-400",
    private: "bg-gray-500/15 text-gray-400",
    course: "bg-blue-500/15 text-blue-400",
  };
  const labels = {
    public: t("repo.visibility.public"),
    private: t("repo.visibility.private"),
    course: t("repo.visibility.course"),
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
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

function Dropdown({ label, value, options, onChange, isDarkTheme = true }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isDarkTheme?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const dropdownBtnBg = isDarkTheme ? "bg-[#1e1e1e] hover:bg-[#2d2d2d]" : "bg-gray-100 hover:bg-gray-200";
  const dropdownBtnText = isDarkTheme ? "text-gray-300" : "text-gray-700";
  const dropdownIconColor = isDarkTheme ? "text-gray-500" : "text-gray-400";
  const dropdownBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const dropdownItemHover = isDarkTheme ? "hover:bg-[#2d2d2d]" : "hover:bg-gray-200";
  const dropdownItemText = isDarkTheme ? "text-gray-300" : "text-gray-700";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${dropdownBtnBg} ${dropdownBtnText}`}
      >
        {options.find((o: {value: string, label: string}) => o.value === value)?.label || label}
        <ChevronDown className={`h-4 w-4 ${dropdownIconColor} transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute top-full left-0 mt-1 rounded-lg shadow-lg z-50 min-w-[140px] border ${dropdownBg}`}>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm ${dropdownItemHover} transition-colors ${
                  value === option.value ? "text-blue-400" : dropdownItemText
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
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
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
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
        repo_type: typeFilter || undefined,
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
      const response = await fetch(`${API_URL}/admin/repositories/${repoId}/toggle-block`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to toggle block status");
      }

      const updatedRepo = await response.json();

      // Update locally without refetching
      setRepositories((prev) =>
        prev.map((repo) =>
          repo.id === repoId ? { ...repo, is_blocked: updatedRepo.is_blocked } : repo
        )
      );
    } catch (err) {
      console.error("Toggle block error:", err);
    } finally {
      setTogglingId(null);
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
      <div className={`h-full flex items-center justify-center ${isDarkTheme ? "bg-[#0f0f10] text-white" : "bg-gray-50 text-gray-900"}`}>
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
  const cardBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d]" : "bg-slate-100 border-slate-200 shadow-sm";
  const cardBgLight = isDarkTheme ? "bg-[#0d0d0d]" : "bg-slate-200";
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const textSecondary = isDarkTheme ? "text-gray-500" : "text-slate-500";
  const textTertiary = isDarkTheme ? "text-[#8b949e]" : "text-slate-400";
  const inputBg = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d]" : "bg-slate-200 border-slate-300";
  const inputText = isDarkTheme ? "text-[#ccd0d4]" : "text-slate-900";
  const inputPlaceholder = isDarkTheme ? "placeholder-[#6e7681]" : "placeholder-slate-400";
  const tableHeaderText = isDarkTheme ? "text-[#6e7681]" : "text-slate-400";
  const tableRowHover = isDarkTheme ? "hover:bg-[#1f2937]" : "hover:bg-slate-100";
  const tableBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-slate-200";
  const btnBg = isDarkTheme ? "bg-[#0f0f10] border-[#30363d] hover:bg-[#1f2937]" : "bg-slate-100 border-slate-200 hover:bg-slate-200";
  const btnText = isDarkTheme ? "text-[#8b949e]" : "text-slate-500";
  const btnTextHover = isDarkTheme ? "hover:text-[#ccd0d4]" : "hover:text-slate-900";

  return (
    <div className={`h-full overflow-y-auto ${pageBg}`}>
      <div className="w-full py-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className={`text-2xl font-bold ${textPrimary}`}>{t("repo.repositories.title")}</h1>
            <span className={`text-sm ${textSecondary}`}>{tp("repo.repositories.reposCount", { n: totalCount })}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${btnBg} ${btnText} ${btnTextHover}`}>
              <Download className="h-4 w-4" />
              {t("repo.repositories.exportCsv")}
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-all">
              <Plus className="h-4 w-4" />
              {t("repo.repositories.createRepo")}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {getStatsData().map((stat) => (
            <div key={stat.label} className={`${cardBg} border rounded-xl p-4`}>
              <p className={`text-xs ${tableHeaderText} mb-1`}>{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${tableHeaderText}`} />
              <input
                type="text"
                placeholder={t("repo.repositories.searchPlaceholder")}
                className={`w-64 pl-10 pr-4 py-1.5 ${inputBg} rounded-lg text-sm ${inputText} ${inputPlaceholder} focus:outline-none focus:border-[#484f58] transition-colors`}
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
            <button className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors">
              <Trash2 className="h-4 w-4" />
              {t("repo.repositories.deleteSelected")}
            </button>
          )}
        </div>

        {/* Table */}
        <div className={`${cardBg} rounded-xl overflow-hidden`}>
          <table className="w-full">
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
            <tbody className={`divide-y ${tableBorder}`}>
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
                    className={`${tableRowHover} transition-colors ${repo.is_blocked ? "opacity-60" : ""}`}
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
                          <p className={`font-medium text-sm ${inputText}`}>
                            {repo.name}
                            {repo.is_blocked && (
                              <span className="ml-2 text-red-400 text-xs">{t("repo.repositories.blockedSuffix")}</span>
                            )}
                          </p>
                          <p className={`text-xs ${tableHeaderText}`}>{repo.gitea_repo_name || repo.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">{getTypeBadge(repo.repo_type, t)}</td>
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
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleBlock(repo.id)}
                        disabled={togglingId === repo.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          repo.is_blocked
                            ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                            : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        }`}
                      >
                        {togglingId === repo.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : repo.is_blocked ? (
                          <>
                            <Lock className="h-3 w-3" />
                            {t("repo.repositories.statusBlocked")}
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3 w-3" />
                            {t("repo.repositories.statusActive")}
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <button className={`p-1 ${btnBg} rounded transition-colors`}>
                        <MoreHorizontal className={`h-4 w-4 ${tableHeaderText}`} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
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
    </div>
  );
}
