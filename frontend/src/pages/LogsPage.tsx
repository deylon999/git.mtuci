import { useState, useEffect, useRef, memo } from "react";
import { useLocation } from "react-router-dom";
import { Search, Download, Trash2, ChevronLeft, ChevronRight, FileX } from "lucide-react";
import { useLogsFilters, useLogsPagination, useLogsData, useLogsStats, useDebounce } from "../hooks/useLogs";
import { exportLogs, deleteOldLogs } from "../api/adminApi";
import ConfirmModal from "../components/ConfirmModal";
import type { LogEntry } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getAdminPageTheme, getAdminNativeSelectProps } from "../layout/adminPageTheme";
import AdminPageHeader from "../components/AdminPageHeader";
import { getLogUserDisplayName, getLogUserInitials } from "../utils/logDisplay";

interface LogsPageProps {
  isDarkTheme?: boolean;
}

interface LogRowProps {
  log: LogEntry;
  isExpanded: boolean;
  isHighlighted: boolean;
  highlightActive: boolean;
  rowId: string;
  onToggle: (id: string) => void;
  isDarkTheme: boolean;
  getLevelBadge: (level: string) => React.ReactNode;
  getStatusBadge: (status: number | null) => React.ReactNode;
  getUserInitials: (log: LogEntry) => string;
  getUserName: (log: LogEntry) => string;
  formatTime: (isoString: string) => string;
  formatFullDate: (isoString: string) => string;
  naLabel: string;
}

const LogRow = memo(function LogRow({
  log,
  isExpanded,
  isHighlighted,
  highlightActive,
  rowId,
  onToggle,
  isDarkTheme,
  getLevelBadge,
  getStatusBadge,
  getUserInitials,
  getUserName,
  formatTime,
  formatFullDate,
  naLabel,
}: LogRowProps) {
  const ui = getAdminPageTheme(isDarkTheme);
  const hoverBg = ui.tableRowHover;
  const borderColor = ui.tableBorder;
  const sourceBadgeBg = isDarkTheme ? "bg-gray-500/20 border-gray-500/30 text-gray-300" : "bg-gray-200 border-gray-300 text-gray-600";
  const detailBg = isDarkTheme ? "bg-[#0d0d0d]" : "bg-slate-100";

  const isClickable = log.level === "ERROR" || log.level === "WARNING" || log.detail;

  return (
    <>
      <tr
        id={rowId}
        className={`border-b ${borderColor} ${isClickable ? "cursor-pointer" : ""} ${hoverBg} transition-colors`}
        style={
          isHighlighted
            ? {
                backgroundColor: highlightActive ? ui.colors.hover : "transparent",
                transition: "background-color 320ms ease",
              }
            : undefined
        }
        onClick={() => isClickable && onToggle(log.id)}
        title={formatFullDate(log.created_at)}
      >
        <td className={`px-4 py-3 text-xs font-mono ${ui.tableNameText}`}>{formatTime(log.created_at)}</td>
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
            <span className={`text-xs ${ui.tableNameText}`}>{getUserName(log)}</span>
          </div>
        </td>
        <td className={`px-4 py-3 text-xs font-mono ${ui.tableCellText} truncate`}>{log.message}</td>
        <td className={`px-4 py-3 text-xs font-mono ${ui.tableCellText}`}>{log.ip_address}</td>
        <td className="px-3 py-2.5">{getStatusBadge(log.http_status)}</td>
      </tr>
      {isClickable && isExpanded && (
        <tr className={`border-b ${borderColor}`}>
          <td colSpan={7} className="p-0">
            <div className={`p-2 font-mono text-xs ${ui.tableCellText} whitespace-pre-wrap ${detailBg}`}>
              {log.detail || `source: ${log.source}\nevent: ${log.message}\nuser: ${getUserName(log)}\nip: ${log.ip_address}\nstatus: ${log.http_status || naLabel}`}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export default function LogsPage({ isDarkTheme = false }: LogsPageProps) {
  const { t, tp } = useUserPreferences();
  const location = useLocation();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [highlightActive, setHighlightActive] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledLocationKeyRef = useRef<string | null>(null);
  const flashedLogIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (handledLocationKeyRef.current === location.key) return;
    handledLocationKeyRef.current = location.key;

    const navState = (location.state ?? {}) as { targetPage?: number; highlightLogId?: string };
    if (typeof navState.targetPage === "number" && Number.isFinite(navState.targetPage) && navState.targetPage > 0) {
      setPage(Math.floor(navState.targetPage));
    }
    if (typeof navState.highlightLogId === "string" && navState.highlightLogId.trim()) {
      setHighlightedLogId(navState.highlightLogId);
      setHighlightActive(false);
      flashedLogIdRef.current = null;
    }
  }, [location.key, location.state, setPage]);

  useEffect(() => {
    if (!highlightedLogId || logsLoading) return;
    if (!logs.some((item) => item.id === highlightedLogId)) return;
    if (flashedLogIdRef.current === highlightedLogId) return;

    flashedLogIdRef.current = highlightedLogId;
    const row = document.getElementById(`log-row-${highlightedLogId}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });

    const activateTimer = window.setTimeout(() => {
      setHighlightActive(true);
    }, 20);

    const fadeOutTimer = window.setTimeout(() => {
      setHighlightActive(false);
    }, 2200);

    const cleanupTimer = window.setTimeout(() => {
      setHighlightedLogId((current) => (current === highlightedLogId ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(activateTimer);
      window.clearTimeout(fadeOutTimer);
      window.clearTimeout(cleanupTimer);
    };
  }, [highlightedLogId, logsLoading, logs]);

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
    const normalizedLevel = level === "WARN" ? "WARNING" : level.toUpperCase();
    const styles: Record<string, string> = {
      ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
      WARNING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      INFO: "bg-green-500/20 text-green-400 border-green-500/30",
      DEBUG: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    const dotColors: Record<string, string> = {
      ERROR: "bg-red-500",
      WARNING: "bg-amber-500",
      INFO: "bg-green-500",
      DEBUG: "bg-blue-500",
    };
    const displayLevel = normalizedLevel;
    const badgeClass = styles[normalizedLevel] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
    const dotClass = dotColors[normalizedLevel] ?? "bg-gray-400";
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${badgeClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
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

  const unknownUserLabel = t("admin.logs.unknownUser");
  const naLabel = t("admin.logs.na");

  const getUserInitials = (log: LogEntry) => getLogUserInitials(log, unknownUserLabel);

  const getUserName = (log: LogEntry) => getLogUserDisplayName(log, unknownUserLabel);

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

  const ui = getAdminPageTheme(isDarkTheme);
  const c = ui.colors;
  const cardBg = `${ui.tableBg} border ${ui.tableBorder}`;
  const inputBg = ui.inputBg;
  const hoverBg = ui.tableRowHover;
  const adminSelect = getAdminNativeSelectProps(isDarkTheme);
  const adminSelectCompact = getAdminNativeSelectProps(isDarkTheme, "compact");

  return (
    <div className={`min-h-screen ${ui.pageWrapper}`}>
      <div className="w-full py-6 px-6 pb-20 space-y-6">
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.logs.title")}
          subtitle={t("admin.logs.subtitle")}
          actions={
            <>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors shadow-sm ${ui.cardBg} ${ui.cardHover} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Download className="h-4 w-4" />
                {isExporting ? t("admin.logs.exporting") : t("admin.logs.export")}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
                {t("admin.logs.deleteOld")}
              </button>
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: "12px", padding: "20px" }}>
            <div style={{ fontSize: "11px", color: c.textMuted, marginBottom: "4px" }}>{t("admin.logs.statTotal")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: c.text }}>{stats?.total ?? "-"}</div>
            <div style={{ fontSize: "10px", color: c.textMuted, marginTop: "3px" }}>{t("admin.logs.periodAllTime")}</div>
          </div>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: "12px", padding: "20px" }}>
            <div style={{ fontSize: "11px", color: c.textMuted, marginBottom: "4px" }}>{t("admin.logs.statErrorsToday")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#e24b4a" }}>{stats?.errors_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: c.textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: "12px", padding: "20px" }}>
            <div style={{ fontSize: "11px", color: c.textMuted, marginBottom: "4px" }}>{t("admin.logs.statWarnings")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#f59e0b" }}>{stats?.warnings_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: c.textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: "12px", padding: "20px" }}>
            <div style={{ fontSize: "11px", color: c.textMuted, marginBottom: "4px" }}>{t("admin.logs.statSuccess")}</div>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "#4caf50" }}>{stats?.success_today ?? "-"}</div>
            <div style={{ fontSize: "10px", color: c.textMuted, marginTop: "3px" }}>{t("admin.logs.periodToday")}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${cardBg}`}>
          <div className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border ${inputBg}`}>
            <Search className={`h-4 w-4 shrink-0 ${ui.tableHeaderText}`} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("admin.logs.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`bg-transparent border-none outline-none text-sm flex-1 ${ui.tableNameText} ${isDarkTheme ? "placeholder-[#6e7681]" : "placeholder-slate-400"}`}
            />
          </div>
          <div className={`w-px h-5 shrink-0 ${isDarkTheme ? "bg-[#2d2d2d]" : "bg-slate-300"}`} />
          <select
            value={level}
            onChange={(e) => handleFilterChange(() => setLevel(e.target.value as any))}
            className={adminSelect.className}
            style={adminSelect.style}
          >
            <option value="" style={adminSelect.optionStyle}>{t("admin.logs.allLevels")}</option>
            <option value="ERROR" style={adminSelect.optionStyle}>ERROR</option>
            <option value="WARNING" style={adminSelect.optionStyle}>WARNING</option>
            <option value="INFO" style={adminSelect.optionStyle}>INFO</option>
            <option value="DEBUG" style={adminSelect.optionStyle}>DEBUG</option>
          </select>
          <select
            value={source}
            onChange={(e) => handleFilterChange(() => setSource(e.target.value as any))}
            className={adminSelect.className}
            style={adminSelect.style}
          >
            <option value="" style={adminSelect.optionStyle}>{t("admin.logs.allSources")}</option>
            <option value="auth" style={adminSelect.optionStyle}>{t("admin.logs.sourceAuth")}</option>
            <option value="repositories" style={adminSelect.optionStyle}>{t("admin.logs.sourceRepositories")}</option>
            <option value="webhooks" style={adminSelect.optionStyle}>{t("admin.logs.sourceWebhooks")}</option>
            <option value="admin" style={adminSelect.optionStyle}>admin</option>
            <option value="gitea" style={adminSelect.optionStyle}>gitea</option>
            <option value="permissions" style={adminSelect.optionStyle}>permissions</option>
            <option value="courses" style={adminSelect.optionStyle}>courses</option>
          </select>
          <select
            value={timeFilter}
            onChange={(e) => handleFilterChange(() => setTimeFilter(e.target.value as any))}
            className={adminSelect.className}
            style={adminSelect.style}
          >
            <option value="today" style={adminSelect.optionStyle}>{t("admin.logs.periodToday")}</option>
            <option value="hour" style={adminSelect.optionStyle}>{t("admin.logs.periodHour")}</option>
            <option value="week" style={adminSelect.optionStyle}>{t("admin.logs.periodWeek")}</option>
            <option value="month" style={adminSelect.optionStyle}>{t("admin.logs.periodMonth")}</option>
          </select>
          <div className={`w-px h-5 shrink-0 ${isDarkTheme ? "bg-[#2d2d2d]" : "bg-slate-300"}`} />
          <select
            value={sort}
            onChange={(e) => handleFilterChange(() => setSort(e.target.value as any))}
            className={adminSelect.className}
            style={adminSelect.style}
          >
            <option value="desc" style={adminSelect.optionStyle}>{t("admin.logs.sortNewFirst")}</option>
            <option value="asc" style={adminSelect.optionStyle}>{t("admin.logs.sortOldFirst")}</option>
          </select>
        </div>

        {/* Table */}
        <div className={`rounded-xl border overflow-hidden ${cardBg}`}>
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className={`text-sm ${ui.tableCellText}`}>{t("common.loading")}</span>
            </div>
          ) : logsError ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileX className={`w-12 h-12 ${ui.tableHeaderText} mb-3`} />
              <span className={`text-sm ${ui.tableCellText}`}>{logsError}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileX className={`w-12 h-12 ${ui.tableHeaderText} mb-3`} />
              <span className={`text-sm ${ui.tableCellText}`}>{t("admin.logs.empty")}</span>
            </div>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className={`border-b ${ui.tableBorder} ${ui.sectionHeaderBg}`}>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[120px]`}>{t("admin.logs.colTime")}</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[90px]`}>{t("admin.logs.colLevel")}</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[110px]`}>{t("admin.logs.colModule")}</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[160px]`}>{t("admin.logs.colUser")}</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText}`}>{t("admin.logs.colMessage")}</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[110px]`}>IP</th>
                    <th className={`text-xs font-medium uppercase tracking-wider text-left px-4 py-3 ${ui.tableHeaderText} w-[70px]`}>{t("admin.logs.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      isExpanded={expandedRows.has(log.id)}
                      isHighlighted={highlightedLogId === log.id}
                      highlightActive={highlightActive}
                      rowId={`log-row-${log.id}`}
                      onToggle={toggleRow}
                      isDarkTheme={isDarkTheme}
                      getLevelBadge={getLevelBadge}
                      getStatusBadge={getStatusBadge}
                      getUserInitials={getUserInitials}
                      getUserName={getUserName}
                      formatTime={formatTime}
                      formatFullDate={formatFullDate}
                      naLabel={naLabel}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className={`flex items-center justify-between px-4 py-3 border-t ${ui.tableBorder} text-sm ${ui.tableCellText}`}>
                <span>{tp("admin.logs.shownOf", { shown: logs.length, total })}</span>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${ui.paginationBtn}`}
                    >
                      ←
                    </button>
                  )}
                  <span className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg">
                    {page}
                  </span>
                  {page < totalPages && (
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${ui.paginationBtn}`}
                    >
                      →
                    </button>
                  )}
                </div>
                <div className={`flex items-center gap-2 ${ui.tableCellText}`}>
                  <span>{t("admin.logs.perPage")}</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className={adminSelectCompact.className}
                    style={adminSelectCompact.style}
                  >
                    <option value={10} style={adminSelectCompact.optionStyle}>10</option>
                    <option value={25} style={adminSelectCompact.optionStyle}>25</option>
                    <option value={50} style={adminSelectCompact.optionStyle}>50</option>
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
