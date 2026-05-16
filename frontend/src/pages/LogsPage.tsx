import { useState, useEffect, useRef, memo } from "react";
import { Search, Download, Trash2, ChevronLeft, ChevronRight, FileX } from "lucide-react";
import { useLogsFilters, useLogsPagination, useLogsData, useLogsStats, useDebounce } from "../hooks/useLogs";
import { exportLogs, deleteOldLogs } from "../api/adminApi";
import ConfirmModal from "../components/ConfirmModal";
import type { LogEntry } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface LogsPageProps {
  isDarkTheme?: boolean;
}

interface LogRowProps {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  isDarkTheme: boolean;
  getLevelBadge: (level: string) => React.ReactNode;
  getStatusBadge: (status: number | null) => React.ReactNode;
  getUserInitials: (log: LogEntry) => string;
  getUserName: (log: LogEntry) => string;
  formatTime: (isoString: string) => string;
  formatFullDate: (isoString: string) => string;
}

const LogRow = memo(function LogRow({
  log,
  isExpanded,
  onToggle,
  isDarkTheme,
  getLevelBadge,
  getStatusBadge,
  getUserInitials,
  getUserName,
  formatTime,
  formatFullDate,
}: LogRowProps) {
  const textMain = isDarkTheme ? "text-white" : "text-gray-900";
  const textMuted = isDarkTheme ? "text-gray-500" : "text-gray-500";
  const hoverBg = isDarkTheme ? "hover:bg-[#1f2937]" : "hover:bg-gray-50";
  const borderColor = isDarkTheme ? "border-[#2d2d2d]" : "border-gray-200";
  const sourceBadgeBg = isDarkTheme ? "bg-gray-500/20 border-gray-500/30 text-gray-300" : "bg-gray-200 border-gray-300 text-gray-600";
  const detailBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-50";

  const isClickable = log.level === "ERROR" || log.level === "WARNING" || log.detail;

  return (
    <>
      <tr
        className={`border-b ${borderColor} ${isClickable ? "cursor-pointer" : ""} ${hoverBg} transition-colors`}
        onClick={() => isClickable && onToggle(log.id)}
        title={formatFullDate(log.created_at)}
      >
        <td className={`px-3 py-2.5 text-xs font-mono ${textMain}`}>{formatTime(log.created_at)}</td>
        <td className="px-3 py-2.5">{getLevelBadge(log.level)}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${sourceBadgeBg}`}>
            {log.source}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-5.5 h-5.5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 bg-blue-500/20 text-blue-400">
              {getUserInitials(log)}
            </div>
            <span className={`text-xs ${textMain}`}>{getUserName(log)}</span>
          </div>
        </td>
        <td className={`px-3 py-2.5 text-xs font-mono ${textMuted} truncate`}>{log.message}</td>
        <td className={`px-3 py-2.5 text-xs font-mono ${textMuted}`}>{log.ip_address}</td>
        <td className="px-3 py-2.5">{getStatusBadge(log.http_status)}</td>
      </tr>
      {isClickable && isExpanded && (
        <tr className={`border-b ${borderColor}`}>
          <td colSpan={7} className="p-0">
            <div className={`p-2 font-mono text-xs ${textMuted} whitespace-pre-wrap ${detailBg}`}>
              {log.detail || `source: ${log.source}\nevent: ${log.message}\nuser: ${log.user_email || "anonymous"}\nip: ${log.ip_address}\nstatus: ${log.http_status || "N/A"}`}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export default function LogsPage({ isDarkTheme = false }: LogsPageProps) {
  const { t, tp } = useUserPreferences();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const {
    level,
    setLevel,
    source,
    setSource,
    search,
    setSearch,
    timeFilter,
    setTimeFilter,
    sort,
    setSort,
    getFilters,
    resetFilters,
  } = useLogsFilters();

  const { limit, setLimit, page, setPage, getPagination, resetPagination } = useLogsPagination(10);

  const debouncedSearch = useDebounce(search, 300);

  const filters = getFilters();
  const pagination = getPagination();

  const { logs, total, loading: logsLoading, error: logsError, refetch: refetchLogs } = useLogsData(filters, pagination);
  const { stats, loading: statsLoading } = useLogsStats();

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getLevelBadge = (level: string) => {
    const styles = {
      ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
      WARN: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      INFO: "bg-green-500/20 text-green-400 border-green-500/30",
      DEBUG: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    const dotColors = {
      ERROR: "bg-red-500",
      WARN: "bg-amber-500",
      INFO: "bg-green-500",
      DEBUG: "bg-blue-500",
    };
    const displayLevel = level === "WARNING" ? "WARN" : level;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${styles[displayLevel as keyof typeof styles]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[displayLevel as keyof typeof dotColors]}`}></span>
        {displayLevel}
      </span>
    );
  };

  const getStatusBadge = (status: number | null) => {
    if (!status) return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">—</span>;
    if (status >= 500) return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">{status}</span>;
    if (status >= 400) return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">{status}</span>;
    if (status >= 200) return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">{status}</span>;
    return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">{status}</span>;
  };

  const getUserInitials = (log: LogEntry) => {
    if (log.user_full_name) {
      return log.user_full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (log.user_email) {
      return log.user_email.slice(0, 2).toUpperCase();
    }
    return "?";
  };

  const getUserName = (log: LogEntry) => {
    return log.user_full_name || log.user_email || "anonymous";
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  const formatFullDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportLogs(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs_${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert(t("admin.logs.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteOldLogs = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteOldLogs(1); // Delete logs older than 1 day for testing
      alert(tp("admin.logs.deletedCount", { n: result.deleted_count }));
      refetchLogs();
    } catch (error) {
      console.error("Delete failed:", error);
      alert(t("admin.logs.deleteFailed"));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleFilterChange = (callback: () => void) => {
    callback();
    resetPagination();
  };

  const totalPages = Math.ceil(total / limit);

  const bgColor = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-50";
  const cardBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const cardBg2 = isDarkTheme ? "#1e1e1e" : "#ffffff";
  const borderColor = isDarkTheme ? "#30363d" : "#e0e0e0";
  const inputBg = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d]" : "bg-gray-100 border-gray-300";
  const textMain = isDarkTheme ? "text-white" : "text-gray-900";
  const textMuted = isDarkTheme ? "text-gray-500" : "text-gray-500";
  const textDim = isDarkTheme ? "text-[#6e7681]" : "text-gray-400";
  const hoverBg = isDarkTheme ? "hover:bg-[#1f2937]" : "hover:bg-gray-200";

  return (
    <div className={`min-h-screen ${bgColor} ${textMain}`}>
      <div className="p-5 max-w-[1600px] mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold">{t("admin.logs.title")}</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>{t("admin.logs.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${cardBg} ${hoverBg} transition-colors disabled:opacity-60`}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? t("admin.logs.exporting") : t("admin.logs.export")}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 transition-colors`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("admin.logs.deleteOld")}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          <div style={{ background: cardBg2, border: `1px solid ${borderColor}`, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: textMuted, marginBottom: "4px" }}>{t("admin.logs.statTotal")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: textMain }}>{stats?.total ?? "-"}</div>
            <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>{t("admin.logs.periodAllTime")}</div>
          </div>
          <div style={{ background: cardBg2, border: `1px solid ${borderColor}`, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: textMuted, marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#e24b4a" }}>{stats?.errors_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
          <div style={{ background: cardBg2, border: `1px solid ${borderColor}`, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: textMuted, marginBottom: "4px" }}>{t("admin.logs.statWarnings")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#f59e0b" }}>{stats?.warnings_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
          <div style={{ background: cardBg2, border: `1px solid ${borderColor}`, borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: textMuted, marginBottom: "4px" }}>{t("admin.logs.statSuccess")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#4caf50" }}>{stats?.success_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={`flex items-center gap-2 p-3 rounded-xl border mb-4 ${cardBg}`}>
          <div className={`flex items-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg border ${inputBg}`}>
            <Search className="w-3.5 h-3.5 text-gray-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("admin.logs.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`bg-transparent border-none outline-none text-xs flex-1 ${textMain} placeholder-gray-500`}
            />
          </div>
          <div className={`w-px h-5 ${isDarkTheme ? "bg-[#30363d]" : "bg-gray-300"}`}></div>
          <select
            value={level}
            onChange={(e) => handleFilterChange(() => setLevel(e.target.value as any))}
            className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${inputBg} ${textMain}`}
          >
            <option value="">{t("admin.logs.allLevels")}</option>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
          <select
            value={source}
            onChange={(e) => handleFilterChange(() => setSource(e.target.value as any))}
            className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${inputBg} ${textMain}`}
          >
            <option value="">{t("admin.logs.allSources")}</option>
            <option value="auth">auth</option>
            <option value="repositories">repositories</option>
            <option value="webhooks">webhooks</option>
            <option value="admin">admin</option>
            <option value="gitea">gitea</option>
            <option value="permissions">permissions</option>
            <option value="courses">courses</option>
          </select>
          <select
            value={timeFilter}
            onChange={(e) => handleFilterChange(() => setTimeFilter(e.target.value as any))}
            className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${inputBg} ${textMain}`}
          >
            <option value="today">{t("admin.logs.periodToday")}</option>
            <option value="hour">{t("admin.logs.periodHour")}</option>
            <option value="week">{t("admin.logs.periodWeek")}</option>
            <option value="month">{t("admin.logs.periodMonth")}</option>
          </select>
          <div className={`w-px h-5 ${isDarkTheme ? "bg-[#30363d]" : "bg-gray-300"}`}></div>
          <select
            value={sort}
            onChange={(e) => handleFilterChange(() => setSort(e.target.value as any))}
            className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${inputBg} ${textMain}`}
          >
            <option value="desc">{t("admin.logs.sortNewFirst")}</option>
            <option value="asc">{t("admin.logs.sortOldFirst")}</option>
          </select>
        </div>

        {/* Table */}
        <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className={`text-sm ${textMuted}`}>{t("common.loading")}</span>
            </div>
          ) : logsError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileX className={`w-12 h-12 ${textMuted} mb-3`} />
              <span className={`text-sm ${textMuted}`}>{logsError}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileX className={`w-12 h-12 ${textMuted} mb-3`} />
              <span className={`text-sm ${textMuted}`}>{t("admin.logs.empty")}</span>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className={`border-b ${isDarkTheme ? "border-[#30363d]" : "border-gray-200"}`}>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[120px]`}>{t("admin.logs.colTime")}</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[90px]`}>{t("admin.logs.colLevel")}</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[110px]`}>{t("admin.logs.colModule")}</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[160px]`}>{t("admin.logs.colUser")}</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted}`}>{t("admin.logs.colMessage")}</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[110px]`}>IP</th>
                    <th className={`text-xs font-semibold uppercase tracking-wider text-left px-3 py-2.5 ${textMuted} w-[70px]`}>{t("admin.logs.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      isExpanded={expandedRows.has(log.id)}
                      onToggle={toggleRow}
                      isDarkTheme={isDarkTheme}
                      getLevelBadge={getLevelBadge}
                      getStatusBadge={getStatusBadge}
                      getUserInitials={getUserInitials}
                      getUserName={getUserName}
                      formatTime={formatTime}
                      formatFullDate={formatFullDate}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className={`flex items-center justify-between px-4 py-3 border-t ${isDarkTheme ? "border-[#2d2d2d]" : "border-gray-200"} text-sm ${textMuted}`}>
                <span>{tp("admin.logs.shownOf", { shown: logs.length, total })}</span>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${isDarkTheme ? "bg-[#0f0f10] border-[#30363d] text-[#8b949e] hover:bg-[#1f2937] hover:text-[#ccd0d4]" : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-900"}`}
                    >
                      ←
                    </button>
                  )}
                  <span className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg">
                    {page}
                  </span>
                  {page < totalPages && (
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${isDarkTheme ? "bg-[#0f0f10] border-[#30363d] text-[#8b949e] hover:bg-[#1f2937] hover:text-[#ccd0d4]" : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-900"}`}
                    >
                      →
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span>{t("admin.logs.perPage")}</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`px-1.5 py-1 rounded border text-xs cursor-pointer ${inputBg} ${textMain}`}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>{t("admin.logs.onPage")}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title={t("admin.logs.deleteTitle")}
        message={t("admin.logs.deleteMessage")}
        confirmText={t("admin.logs.deleteConfirmBtn")}
        cancelText={t("common.cancel")}
        onConfirm={handleDeleteOldLogs}
        onCancel={() => setShowDeleteModal(false)}
        isDangerous={true}
        isLoading={isDeleting}
      />
    </div>
  );
}
