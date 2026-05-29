import { useState, useEffect } from "react";
import { RefreshCw, Clock, AlertTriangle, CheckCircle, XCircle, Activity, HardDrive, Database, Server, Zap, TrendingUp, GitBranch } from "lucide-react";
import { getSystemMetrics, getServiceStatus, getBackups, getLogs, createBackup, restartAPI } from "../api/adminApi";
import type { ServiceStatus, SystemMetrics, TableSizeEntry } from "../api/types";
import { getTheme } from "../theme";
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";

const EMPTY = "—";

function displayNum(value: number | null | undefined, format?: (n: number) => string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return format ? format(value) : String(value);
}

function displayStr(value: string | null | undefined): string {
  return value && value.trim() ? value : EMPTY;
}

interface MonitoringPageProps {
  isDarkTheme?: boolean;
}

export default function MonitoringPage({ isDarkTheme = false }: MonitoringPageProps) {
  const { t, tp, language } = useUserPreferences();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [backups, setBackups] = useState<Awaited<ReturnType<typeof getBackups>> | null>(null);
  const [incidents, setIncidents] = useState<Array<{ level: string; message: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [metricsData, statusData, backupsData, errorLogs, warningLogs] = await Promise.all([
        getSystemMetrics().catch(() => null),
        getServiceStatus().catch(() => null),
        getBackups().catch(() => null),
        getLogs({ level: "ERROR" }, { limit: 5, offset: 0 }).catch(() => ({ logs: [] })),
        getLogs({ level: "WARNING" }, { limit: 5, offset: 0 }).catch(() => ({ logs: [] })),
      ]);
      setMetrics(metricsData);
      setServiceStatus(statusData);
      setBackups(backupsData);
      setIncidents([...(errorLogs?.logs || []), ...(warningLogs?.logs || [])].slice(0, 10));
      setFetchError(!metricsData && !statusData);
      setLastUpdate(new Date().toLocaleTimeString(dateLocale));
      setSecondsSinceUpdate(0);
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      await createBackup();
      await fetchData();
      alert(t("admin.monitoring.backupCreated"));
    } catch (error) {
      console.error("Failed to create backup:", error);
      alert(t("admin.monitoring.backupCreateError"));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestartAPI = async () => {
    setRestartLoading(true);
    try {
      const responseData = await restartAPI();
      setShowRestartModal(false);
      if (responseData.status === "warning") {
        alert(responseData.message || t("admin.monitoring.apiRestartWarn"));
      } else {
        alert(t("admin.monitoring.apiRestarted"));
      }
    } catch (error) {
      console.error("Failed to restart API:", error);
      alert(t("admin.monitoring.apiRestartError"));
    } finally {
      setRestartLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsSinceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const theme = getTheme(isDarkTheme);
  const ac = getAdminPageTheme(isDarkTheme).colors;

  const getStatusColor = (status: boolean | undefined) => {
    if (status === undefined) return theme.warning;
    return status ? theme.success : theme.danger;
  };

  const getBadgeStyle = (color: string) => ({
    backgroundColor: `${color}15`,
    color: color,
    border: `1px solid ${color}40`,
  });

  const services = serviceStatus?.services ?? [];
  const topTables: TableSizeEntry[] = metrics?.database?.top_tables ?? [];
  const topTablesMaxMb = Math.max(...topTables.map((t) => t.size_mb), 1);

  const serviceDetail = (svc: (typeof services)[number]) => {
    if (svc.uptime) return tp("admin.monitoring.uptime", { value: svc.uptime });
    if (svc.detail) return svc.detail;
    return EMPTY;
  };

  const headerBtnStyle = {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: "4px",
    fontSize: "11px",
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: "7px",
    border: `${isDarkTheme ? "0.5px" : "1px"} solid ${ac.borderInput}`,
    backgroundColor: ac.cardElevated,
    color: ac.text,
    cursor: "pointer" as const,
  };

  return (
    <div style={{ backgroundColor: ac.pageBg, color: ac.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Page Header — исходная раскладка, без сжатия в max-w-7xl */}
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: ac.pageBg,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: "18px", fontWeight: 600, color: ac.text }}>{t("admin.monitoring.title")}</div>
          <div style={{ fontSize: "12px", color: ac.textSecondary, marginTop: "2px" }}>
            {t("admin.monitoring.subtitle")}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              color: fetchError ? theme.warning : theme.success,
              backgroundColor: fetchError ? `${theme.warning}15` : `${theme.success}15`,
              border: `1px solid ${fetchError ? theme.warning : theme.success}40`,
              borderRadius: "6px",
              padding: "4px 10px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: fetchError ? theme.warning : theme.success,
                animation: loading ? "pulse 1.5s infinite" : undefined,
              }}
            />
            {fetchError ? t("admin.monitoring.degraded") : t("admin.monitoring.live")}
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={backupLoading}
            style={{
              ...headerBtnStyle,
              cursor: backupLoading ? "not-allowed" : "pointer",
              opacity: backupLoading ? 0.5 : 1,
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" style={{ animation: backupLoading ? "spin 1s linear infinite" : "none" }} />
            {backupLoading ? t("admin.dashboard.backupCreating") : t("admin.monitoring.createBackup")}
          </button>
          <button type="button" onClick={() => setShowRestartModal(true)} style={headerBtnStyle}>
            {t("admin.monitoring.restartApi")}
          </button>
          <button type="button" onClick={fetchData} style={headerBtnStyle}>
            <RefreshCw className="h-3.5 w-3.5" style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("admin.monitoring.refresh")}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          backgroundColor: ac.pageBg,
        }}
      >
        {/* Status Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {/* FastAPI */}
          <div style={{
            backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px",
            boxShadow: isDarkTheme ? 'none' : theme.shadow
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${theme.success}15`
            }}>
              <Server style={{ width: "18px", height: "18px", color: theme.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: theme.text2, marginBottom: "2px" }}>FastAPI</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: theme.text }}>
                {serviceStatus?.api ? t("admin.monitoring.online") : t("admin.monitoring.offline")}
              </div>
              <div style={{ fontSize: "10px", color: theme.text2, marginTop: "1px" }}>
                {tp("admin.monitoring.uptime", { value: serviceStatus?.api_uptime || "—" })}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.api))
            }}>
              {serviceStatus?.api ? t("admin.monitoring.statusOk") : t("admin.monitoring.statusErr")}
            </span>
          </div>

          {/* PostgreSQL */}
          <div style={{
            backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px",
            boxShadow: isDarkTheme ? 'none' : theme.shadow
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${theme.success}15`
            }}>
              <Database style={{ width: "18px", height: "18px", color: theme.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: theme.text2, marginBottom: "2px" }}>PostgreSQL</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: theme.text }}>
                {serviceStatus?.db ? t("admin.monitoring.online") : t("admin.monitoring.offline")}
              </div>
              <div style={{ fontSize: "10px", color: theme.text2, marginTop: "1px" }}>
                {serviceStatus?.db_version
                  ? tp("admin.monitoring.dbConnections", {
                      n: metrics?.database?.connections_active ?? 0,
                      version: serviceStatus.db_version,
                    })
                  : `${displayNum(metrics?.database?.connections_active)} ${t("admin.monitoring.connectionsShort")}`}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.db))
            }}>
              {serviceStatus?.db ? t("admin.monitoring.statusOk") : t("admin.monitoring.statusErr")}
            </span>
          </div>

          {/* Gitea */}
          <div style={{
            backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px",
            boxShadow: isDarkTheme ? 'none' : theme.shadow
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${theme.success}15`
            }}>
              <GitBranch style={{ width: "18px", height: "18px", color: theme.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: theme.text2, marginBottom: "2px" }}>Gitea</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: theme.text }}>
                {serviceStatus?.git ? t("admin.monitoring.online") : t("admin.monitoring.offline")}
              </div>
              <div style={{ fontSize: "10px", color: theme.text2, marginTop: "1px" }}>
                {serviceStatus?.git_version
                  ? tp("admin.monitoring.gitRepos", {
                      n: serviceStatus.git_repos_count ?? 0,
                      version: serviceStatus.git_version,
                    })
                  : `${displayNum(serviceStatus?.git_repos_count)} ${t("admin.monitoring.reposShort")}`}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.git))
            }}>
              {serviceStatus?.git ? t("admin.monitoring.statusOk") : t("admin.monitoring.statusErr")}
            </span>
          </div>

          {/* Disk */}
          <div style={{
            backgroundColor: ac.card,
            border: metrics?.disk_percent > 80 ? `${isDarkTheme ? '0.5px' : '1px'} solid ${theme.warning}60` : `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px",
            boxShadow: isDarkTheme ? 'none' : theme.shadow
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${theme.warning}15`
            }}>
              <HardDrive style={{ width: "18px", height: "18px", color: theme.warning, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: theme.text2, marginBottom: "2px" }}>{t("admin.monitoring.diskStorage")}</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: theme.warning }}>
                {tp("admin.monitoring.diskPercent", { n: metrics?.disk_percent || 0 })}
              </div>
              <div style={{ fontSize: "10px", color: theme.text2, marginTop: "1px" }}>
                {tp("admin.monitoring.diskUsage", { used: metrics?.disk_used_gb?.toFixed(1) || 0, total: metrics?.disk_total_gb?.toFixed(1) || 0 })}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(metrics?.disk_percent > 80 ? theme.warning : theme.success)
            }}>
              {metrics?.disk_percent > 80 ? "!" : "OK"}
            </span>
          </div>
        </div>

        {/* Resources + Services */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

          {/* Server Resources */}
          <div style={{ backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: isDarkTheme ? 'none' : theme.shadow }}>
            <div style={{
              padding: "10px 14px", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
              fontSize: "11px", fontWeight: "600", color: theme.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: ac.input
            }}>
              {t("admin.monitoring.serverResources")}
              <span style={{ fontSize: "10px", color: theme.text2, fontWeight: "400" }}>
                {tp("admin.monitoring.updatedAgo", { n: secondsSinceUpdate })}
              </span>
            </div>
            <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* CPU */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: theme.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t("admin.monitoring.cpu")}</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.cpu_percent || 0}%`,
                    backgroundColor: theme.accent2, opacity: 0.8
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.cpu_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* RAM */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: theme.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t("admin.monitoring.ram")}</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.memory_percent || 0}%`,
                    backgroundColor: theme.accent2, opacity: 0.8
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.memory_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* Disk */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: theme.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t("admin.dashboard.disk")}</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.disk_percent || 0}%`,
                    backgroundColor: metrics?.disk_percent > 80 ? theme.warning : theme.accent2,
                    opacity: 0.9
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.disk_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* Network Upload */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: theme.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t("admin.monitoring.networkUp")}</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${(metrics?.network_upload_mbps || 0) * 10}%`, backgroundColor: theme.success, opacity: 0.7
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                  {(metrics?.network_upload_mbps || 0).toFixed(1)}
                </span>
              </div>

              {/* Network Download */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: theme.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t("admin.monitoring.networkDown")}</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${(metrics?.network_download_mbps || 0) * 10}%`, backgroundColor: theme.success, opacity: 0.7
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                  {(metrics?.network_download_mbps || 0).toFixed(1)}
                </span>
              </div>
            </div>

            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.cpuModel")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {displayStr(metrics?.cpu_model)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.ramTotal")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.memory_total_gb?.toFixed(0) || 0} {t("admin.monitoring.gb")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.ramUsed")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.memory_used_gb?.toFixed(1) || 0} {t("admin.monitoring.gb")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.diskTotal")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.disk_total_gb?.toFixed(1) || 0} {t("admin.monitoring.gb")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.diskFree")}</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: metrics?.disk_percent > 80 ? theme.warning : theme.text }}>
                  {metrics?.disk_total_gb != null && metrics?.disk_used_gb != null
                    ? `${(metrics.disk_total_gb - metrics.disk_used_gb).toFixed(1)} ${t("admin.monitoring.gb")}`
                    : EMPTY}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.loadAverage")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.load_avg?.length ? metrics.load_avg.join(" / ") : EMPTY}
                </span>
              </div>
            </div>
          </div>

          {/* Services Status */}
          <div style={{ backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: isDarkTheme ? 'none' : theme.shadow }}>
            <div style={{
              padding: "10px 14px", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
              fontSize: "11px", fontWeight: "600", color: theme.text,
              backgroundColor: ac.input
            }}>
              {t("admin.monitoring.servicesState")}
            </div>

            <div>
              {services.length === 0 ? (
                <div style={{ padding: "14px", fontSize: "12px", color: theme.text2, textAlign: "center" }}>
                  {EMPTY}
                </div>
              ) : (
                services.map((svc, i, arr) => (
                  <div
                    key={svc.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "9px 14px",
                      borderBottom: i < arr.length - 1 ? `1px solid ${ac.border}` : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        backgroundColor: getStatusColor(svc.online),
                      }}
                    />
                    <div style={{ fontSize: "12px", color: theme.text, flex: 1 }}>{svc.name}</div>
                    <span style={{ fontSize: "11px", color: theme.text2 }}>{svc.port}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: "6px",
                        padding: "2px 7px",
                        marginLeft: "8px",
                        fontSize: "10px",
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        ...getBadgeStyle(getStatusColor(svc.online)),
                      }}
                    >
                      {svc.online ? t("admin.monitoring.online") : t("admin.monitoring.offline")}
                    </span>
                    <span style={{ fontSize: "10px", color: theme.text2, marginLeft: "8px", minWidth: "72px", textAlign: "right" }}>
                      {serviceDetail(svc)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: "14px", borderTop: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}` }}>
              <div style={{ padding: "0 0 10px", fontSize: "11px", fontWeight: "500", color: theme.text }}>{t("admin.monitoring.lastBackup")}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.date")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {backups?.last_backup
                    ? new Date(backups.last_backup).toLocaleString(dateLocale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : t("admin.dashboard.noBackupData")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.size")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {backups?.last_backup_size_mb?.toFixed(0) || 0} {t("admin.monitoring.mb")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.status")}</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: backups?.last_backup ? theme.success : theme.warning }}>
                  {backups?.last_backup ? t("admin.monitoring.success") : t("admin.dashboard.noBackupData")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.next")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {displayStr(backups?.next_backup)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* HTTP Requests + DB + Incidents */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>

          {/* HTTP Requests */}
          <div style={{ backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: isDarkTheme ? 'none' : theme.shadow }}>
            <div style={{
              padding: "10px 14px", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
              fontSize: "11px", fontWeight: "600", color: theme.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: ac.input
            }}>
              {t("admin.monitoring.httpRequests")}
              <span style={{ fontSize: "10px", color: theme.text2, fontWeight: "400" }}>{t("admin.monitoring.lastHour")}</span>
            </div>
            <div style={{ padding: "14px 14px 4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                <div style={{ backgroundColor: isDarkTheme ? theme.bgCard : "#d4d4d4", borderRadius: "8px", padding: "8px 10px", boxShadow: theme.shadowSm }}>
                  <div style={{ fontSize: "10px", color: isDarkTheme ? theme.text2 : "#525252", marginBottom: "2px" }}>{t("admin.monitoring.total")}</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: isDarkTheme ? theme.text : "#171717" }}>
                    {metrics?.requests_total_hour?.toLocaleString() || 0}
                  </div>
                </div>
                <div style={{ backgroundColor: isDarkTheme ? theme.bgCard : "#d4d4d4", borderRadius: "8px", padding: "8px 10px", boxShadow: theme.shadowSm }}>
                  <div style={{ fontSize: "10px", color: isDarkTheme ? theme.text2 : "#525252", marginBottom: "2px" }}>{t("admin.monitoring.errors")}</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: theme.danger }}>
                    {metrics?.requests_errors_hour || 0}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.avgResponse")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.avg_response_ms?.toFixed(0) || 0} {t("admin.monitoring.ms")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.p95Response")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.p95_response_ms?.toFixed(0) || 0} {t("admin.monitoring.ms")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.errorRate")}</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.error_rate || 0) > 5 ? theme.danger : (metrics?.error_rate || 0) > 1 ? theme.warning : theme.text }}>
                  {(metrics?.error_rate || 0).toFixed(1)}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.rpsNow")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.rps?.toFixed(1) || 0}
                </span>
              </div>
            </div>
          </div>

          {/* PostgreSQL */}
          <div style={{ backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: isDarkTheme ? 'none' : theme.shadow }}>
            <div style={{
              padding: "10px 14px", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
              fontSize: "11px", fontWeight: "600", color: theme.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: ac.input
            }}>
              {t("admin.monitoring.postgresql")}
              <span style={{ fontSize: "10px", color: theme.text2, fontWeight: "400" }}>v{serviceStatus?.db_version || "16"}</span>
            </div>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.activeConnections")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {displayNum(metrics?.database?.connections_active)} / {displayNum(metrics?.database?.connections_max)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.dbSize")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.size_mb || 0} {t("admin.monitoring.mb")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.tables")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.tables_count || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.queriesPerSec")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.queries_per_sec || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.avgQueryTime")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.avg_query_ms || 0} {t("admin.monitoring.ms")}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.cacheHitRate")}</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.database?.cache_hit_rate || 0) > 95 ? theme.success : theme.text }}>
                  {metrics?.database?.cache_hit_rate?.toFixed(1) || 0}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.deadlocks")}</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.database?.deadlocks || 0) > 0 ? theme.danger : theme.text }}>
                  {metrics?.database?.deadlocks || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: theme.text2 }}>{t("admin.monitoring.lastMigration")}</span>
                <span style={{ color: theme.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {displayStr(metrics?.database?.last_migration)}
                </span>
              </div>
            </div>
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ fontSize: "11px", color: theme.text2, marginBottom: "8px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {t("admin.monitoring.topTables")}
              </div>
              {topTables.length === 0 ? (
                <div style={{ fontSize: "12px", color: theme.text2, textAlign: "center", padding: "8px 0" }}>{EMPTY}</div>
              ) : (
                topTables.map((table, idx) => (
                  <div
                    key={table.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: idx === 0 ? 0 : "5px",
                      fontSize: "11px",
                    }}
                  >
                    <span
                      style={{
                        width: "100px",
                        color: theme.text2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flexShrink: 0,
                      }}
                    >
                      {table.name}
                    </span>
                    <div style={{ flex: 1, height: "6px", backgroundColor: ac.iconBg, borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "3px",
                          width: `${Math.max(8, (table.size_mb / topTablesMaxMb) * 100)}%`,
                          backgroundColor: theme.accent2,
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span style={{ width: "48px", textAlign: "right", color: theme.text2, fontSize: "11px", flexShrink: 0 }}>
                      {table.size}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incidents */}
          <div style={{ backgroundColor: ac.card, border: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: isDarkTheme ? 'none' : theme.shadow }}>
            <div style={{
              padding: "10px 14px", borderBottom: `${isDarkTheme ? '0.5px' : '1px'} solid ${ac.border}`,
              fontSize: "11px", fontWeight: "600", color: theme.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: ac.input
            }}>
              {t("admin.monitoring.incidents")}
              <span style={{ fontSize: "10px", color: theme.text2, fontWeight: "400" }}>{t("admin.monitoring.last24h")}</span>
            </div>
            <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {metrics?.disk_percent > 80 && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px", backgroundColor: theme.warning }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: theme.text, lineHeight: 1.4 }}>
{tp("admin.monitoring.diskAlert", { n: metrics.disk_percent.toFixed(0) })}
                    </div>
                    <div style={{ fontSize: "10px", color: theme.text3, marginTop: "2px" }}>{t("admin.monitoring.active")}</div>
                  </div>
                </div>
              )}

              {serviceStatus && !serviceStatus.frontend && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px", backgroundColor: theme.warning }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: theme.text, lineHeight: 1.4 }}>
                      {t("admin.monitoring.frontendDownAlert")}
                    </div>
                    <div style={{ fontSize: "10px", color: theme.text3, marginTop: "2px" }}>{t("admin.monitoring.active")}</div>
                  </div>
                </div>
              )}

              {!serviceStatus?.api && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px", backgroundColor: theme.danger }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: theme.text, lineHeight: 1.4 }}>
                      {t("admin.monitoring.apiDownAlert")}
                    </div>
                    <div style={{ fontSize: "10px", color: theme.text3, marginTop: "2px" }}>{t("admin.monitoring.active")}</div>
                  </div>
                </div>
              )}

              {incidents.slice(0, 6).map((incident, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px",
                    backgroundColor: incident.level === "ERROR" ? theme.danger : incident.level === "WARNING" ? theme.warning : theme.success
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: theme.text, lineHeight: 1.4 }}>
                      {incident.message}
                    </div>
                    <div style={{ fontSize: "10px", color: theme.text3, marginTop: "2px" }}>
                      {new Date(incident.created_at).toLocaleString(dateLocale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}

              {metrics?.disk_percent != null && metrics.disk_percent <= 80
                && serviceStatus?.api
                && serviceStatus?.db
                && serviceStatus?.git
                && serviceStatus?.frontend
                && incidents.length === 0 && (
                <div style={{ fontSize: "12px", color: theme.text2, textAlign: "center", padding: "20px 0" }}>
                  {t("admin.monitoring.noIncidents")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restart Modal */}
      {showRestartModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: ac.card,
            border: `1px solid ${ac.border}`,
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%"
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", color: theme.text, marginBottom: "12px" }}>
              {t("admin.monitoring.restartConfirmTitle")}
            </div>
            <div style={{ fontSize: "14px", color: theme.text2, marginBottom: "24px", lineHeight: 1.5 }}>
              {t("admin.monitoring.restartConfirmMsg")}
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowRestartModal(false)}
                disabled={restartLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${ac.border}`,
                  backgroundColor: "transparent",
                  color: theme.text,
                  fontSize: "14px",
                  cursor: restartLoading ? "not-allowed" : "pointer",
                  opacity: restartLoading ? 0.5 : 1
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleRestartAPI}
                disabled={restartLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: theme.danger,
                  color: "#fff",
                  fontSize: "14px",
                  cursor: restartLoading ? "not-allowed" : "pointer",
                  opacity: restartLoading ? 0.5 : 1
                }}
              >
                {restartLoading ? t("admin.monitoring.restarting") : t("admin.monitoring.restart")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
