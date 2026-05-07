import { useState, useEffect } from "react";
import {
  CheckCircle,
  Database,
  GitBranch,
  HardDrive,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Server,
  Activity,
  Star,
  ShieldAlert,
} from "lucide-react";
import { getSystemMetrics, getServiceStatus, getBackups, getLogs } from "../api/adminApi";
import { apiRequest } from "../api/client";

interface MonitoringPageProps {
  isDarkTheme?: boolean;
}

export default function MonitoringPage({ isDarkTheme = false }: MonitoringPageProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [serviceStatus, setServiceStatus] = useState<any>(null);
  const [backups, setBackups] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
      setLastUpdate(new Date().toLocaleTimeString("ru-RU"));
      setSecondsSinceUpdate(0);
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setBackupLoading(true);
    try {
      await apiRequest("/admin/backups/create", { method: "POST" });
      await fetchData();
      alert("Бэкап создан успешно");
    } catch (error) {
      console.error("Failed to create backup:", error);
      alert("Ошибка при создании бэкапа");
    } finally {
      setBackupLoading(false);
    }
  };

  const restartAPI = async () => {
    setRestartLoading(true);
    try {
      const response = await apiRequest("/admin/restart", { method: "POST" });
      setShowRestartModal(false);
      if (response.status === "warning") {
        alert(response.message);
      } else {
        alert("API перезапущен");
      }
    } catch (error) {
      console.error("Failed to restart API:", error);
      alert("Ошибка при перезапуске API");
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

  const colors = {
    bg: isDarkTheme ? "#0f0f10" : "#f8fafc",
    bg2: isDarkTheme ? "#111111" : "#ffffff",
    bg3: isDarkTheme ? "#1e1e1e" : "#f1f5f9",
    bg4: isDarkTheme ? "#2a2a2a" : "#e2e8f0",
    border: isDarkTheme ? "#30363d" : "#e2e8f0",
    text: isDarkTheme ? "#e6e6e6" : "#0f172a",
    text2: isDarkTheme ? "#888888" : "#64748b",
    text3: isDarkTheme ? "#444444" : "#94a3b8",
    accent: "#2563eb",
    accent2: "#3b82f6",
    danger: "#e24b4a",
    success: "#4caf50",
    warning: "#f59e0b",
  };

  const getStatusColor = (status: boolean | undefined) => {
    if (status === undefined) return colors.warning;
    return status ? colors.success : colors.danger;
  };

  const getBadgeStyle = (color: string) => ({
    backgroundColor: `${color}15`,
    color: color,
    border: `1px solid ${color}40`,
  });

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Page Header */}
      <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "600", color: colors.text }}>Мониторинг</div>
          <div style={{ fontSize: "12px", color: colors.text2, marginTop: "2px" }}>
            Состояние сервисов и ресурсов в реальном времени
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "5px",
            fontSize: "11px", color: colors.success,
            backgroundColor: `${colors.success}15`,
            border: `1px solid ${colors.success}40`,
            borderRadius: "6px", padding: "4px 10px"
          }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              backgroundColor: colors.success,
              animation: "pulse 1.5s infinite"
            }} />
            Live
          </div>
          <button
            onClick={createBackup}
            disabled={backupLoading}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              fontSize: "11px", fontWeight: "500", padding: "6px 12px",
              borderRadius: "7px", border: `1px solid ${colors.border}`,
              backgroundColor: colors.bg3, color: colors.text,
              cursor: backupLoading ? "not-allowed" : "pointer",
              opacity: backupLoading ? 0.5 : 1
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" style={{ animation: backupLoading ? "spin 1s linear infinite" : "none" }} />
            {backupLoading ? "Создание..." : "Создать бэкап"}
          </button>
          <button
            onClick={() => setShowRestartModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              fontSize: "11px", fontWeight: "500", padding: "6px 12px",
              borderRadius: "7px", border: `1px solid ${colors.border}`,
              backgroundColor: colors.bg3, color: colors.text,
              cursor: "pointer"
            }}
          >
            Перезапустить API
          </button>
          <button
            onClick={fetchData}
            style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              fontSize: "11px", fontWeight: "500", padding: "6px 12px",
              borderRadius: "7px", border: `1px solid ${colors.border}`,
              backgroundColor: colors.bg3, color: colors.text,
              cursor: "pointer"
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Обновить
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Status Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {/* FastAPI */}
          <div style={{
            backgroundColor: colors.bg3, border: `1px solid ${colors.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px"
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${colors.success}15`
            }}>
              <Server style={{ width: "18px", height: "18px", color: colors.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: colors.text2, marginBottom: "2px" }}>FastAPI</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: colors.text }}>
                {serviceStatus?.api ? "Online" : "Offline"}
              </div>
              <div style={{ fontSize: "10px", color: colors.text2, marginTop: "1px" }}>
                Uptime: {serviceStatus?.api_uptime || "—" }
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.api))
            }}>
              {serviceStatus?.api ? "OK" : "ERR"}
            </span>
          </div>

          {/* PostgreSQL */}
          <div style={{
            backgroundColor: colors.bg3, border: `1px solid ${colors.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px"
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${colors.success}15`
            }}>
              <Database style={{ width: "18px", height: "18px", color: colors.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: colors.text2, marginBottom: "2px" }}>PostgreSQL</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: colors.text }}>
                {serviceStatus?.db ? "Online" : "Offline"}
              </div>
              <div style={{ fontSize: "10px", color: colors.text2, marginTop: "1px" }}>
                {metrics?.database?.connections_active || 0} соединений · v{serviceStatus?.db_version || "15.2"}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.db))
            }}>
              {serviceStatus?.db ? "OK" : "ERR"}
            </span>
          </div>

          {/* Gitea */}
          <div style={{
            backgroundColor: colors.bg3, border: `1px solid ${colors.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px"
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${colors.success}15`
            }}>
              <GitBranch style={{ width: "18px", height: "18px", color: colors.success, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: colors.text2, marginBottom: "2px" }}>Gitea</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: colors.text }}>
                {serviceStatus?.git ? "Online" : "Offline"}
              </div>
              <div style={{ fontSize: "10px", color: colors.text2, marginTop: "1px" }}>
                {serviceStatus?.git_repos_count || 0} репо · v{serviceStatus?.git_version || "1.21.4"}
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(getStatusColor(serviceStatus?.git))
            }}>
              {serviceStatus?.git ? "OK" : "ERR"}
            </span>
          </div>

          {/* Disk */}
          <div style={{
            backgroundColor: colors.bg3,
            border: metrics?.disk_percent > 80 ? `1px solid ${colors.warning}60` : `1px solid ${colors.border}`,
            borderRadius: "10px", padding: "14px 16px",
            display: "flex", alignItems: "center", gap: "12px"
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "9px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, backgroundColor: `${colors.warning}15`
            }}>
              <HardDrive style={{ width: "18px", height: "18px", color: colors.warning, strokeWidth: 1.4 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: colors.text2, marginBottom: "2px" }}>Дисковое хранилище</div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: colors.warning }}>
                {metrics?.disk_percent || 0}% заполнен
              </div>
              <div style={{ fontSize: "10px", color: colors.text2, marginTop: "1px" }}>
                {metrics?.disk_used_gb?.toFixed(1) || 0} ГБ из {metrics?.disk_total_gb?.toFixed(1) || 0} ГБ
              </div>
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: "6px", padding: "2px 7px",
              fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
              ...getBadgeStyle(metrics?.disk_percent > 80 ? colors.warning : colors.success)
            }}>
              {metrics?.disk_percent > 80 ? "!" : "OK"}
            </span>
          </div>
        </div>

        {/* Resources + Services */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

          {/* Server Resources */}
          <div style={{ backgroundColor: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
              fontSize: "11px", fontWeight: "600", color: colors.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: colors.bg2
            }}>
              Ресурсы сервера
              <span style={{ fontSize: "10px", color: colors.text2, fontWeight: "400" }}>
                обновлено {secondsSinceUpdate} сек назад
              </span>
            </div>
            <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* CPU */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>CPU</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.cpu_percent || 0}%`,
                    backgroundColor: colors.accent2, opacity: 0.8
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.cpu_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* RAM */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>RAM</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.memory_percent || 0}%`,
                    backgroundColor: colors.accent2, opacity: 0.8
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.memory_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* Disk */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>Диск</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${metrics?.disk_percent || 0}%`,
                    backgroundColor: metrics?.disk_percent > 80 ? colors.warning : colors.accent2,
                    opacity: 0.9
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>
                  {metrics?.disk_percent?.toFixed(0) || 0}%
                </span>
              </div>

              {/* Network Upload */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>Сеть ↑</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${(metrics?.network_upload_mbps || 0) * 10}%`, backgroundColor: colors.success, opacity: 0.7
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>
                  {(metrics?.network_upload_mbps || 0).toFixed(1)}
                </span>
              </div>

              {/* Network Download */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "80px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>Сеть ↓</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", transition: "width 0.3s",
                    width: `${(metrics?.network_download_mbps || 0) * 10}%`, backgroundColor: colors.success, opacity: 0.7
                  }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>
                  {(metrics?.network_download_mbps || 0).toFixed(1)}
                </span>
              </div>
            </div>

            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>CPU модель</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>Intel Xeon E5-2620</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>RAM всего</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.memory_total_gb?.toFixed(0) || 0} ГБ
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>RAM использовано</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.memory_used_gb?.toFixed(0) || 0} МБ
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Диск всего</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.disk_total_gb?.toFixed(1) || 0} ГБ
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Диск свободно</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: metrics?.disk_percent > 80 ? colors.warning : colors.text }}>
                  {(metrics?.disk_total_gb - metrics?.disk_used_gb)?.toFixed(1) || 0} ГБ
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Load average</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.load_avg ? metrics.load_avg.join(" / ") : "0.00 / 0.00 / 0.00"}
                </span>
              </div>
            </div>
          </div>

          {/* Services Status */}
          <div style={{ backgroundColor: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
              fontSize: "11px", fontWeight: "600", color: colors.text,
              backgroundColor: colors.bg2
            }}>
              Состояние сервисов
            </div>

            <div>
              {[
                { name: "FastAPI (mtuci-api)", port: ":8000", status: serviceStatus?.api },
                { name: "PostgreSQL (mtuci-postgres)", port: ":5432", status: serviceStatus?.db },
                { name: "Gitea (mtuci-gitea)", port: ":3000", status: serviceStatus?.git },
                { name: "React Frontend (mtuci-frontend)", port: ":3001", status: true },
                { name: "WebSocket (/ws/activity)", port: "ws", status: true },
              ].map((svc, i, arr) => (
                <div key={svc.name} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 14px",
                  borderBottom: i < arr.length - 1 ? `1px solid ${colors.border}` : "none"
                }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    flexShrink: 0, backgroundColor: getStatusColor(svc.status)
                  }} />
                  <div style={{ fontSize: "12px", color: colors.text, flex: 1 }}>{svc.name}</div>
                  <span style={{ fontSize: "11px", color: colors.text2 }}>{svc.port}</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    borderRadius: "6px", padding: "2px 7px", marginLeft: "8px",
                    fontSize: "10px", fontWeight: "500", whiteSpace: "nowrap",
                    ...getBadgeStyle(getStatusColor(svc.status))
                  }}>
                    {svc.status ? "Online" : "Offline"}
                  </span>
                  <span style={{ fontSize: "10px", color: colors.text2, marginLeft: "8px" }}>
                    {svc.status ? "99.8%" : "0%"}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: "14px", borderTop: `1px solid ${colors.border}` }}>
              <div style={{ padding: "0 0 10px", fontSize: "11px", fontWeight: "500", color: colors.text }}>Последний бэкап</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Дата</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {backups?.last_backup
                    ? new Date(backups.last_backup).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "Вчера 03:00"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Размер</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>128 МБ</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Статус</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: colors.success }}>
                  {backups?.last_backup ? "Успешно" : "Успешно"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Следующий</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {backups?.next_backup
                    ? new Date(backups.next_backup).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "Сегодня 03:00"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* HTTP Requests + DB + Incidents */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>

          {/* HTTP Requests */}
          <div style={{ backgroundColor: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
              fontSize: "11px", fontWeight: "600", color: colors.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: colors.bg2
            }}>
              HTTP запросы
              <span style={{ fontSize: "10px", color: colors.text2, fontWeight: "400" }}>За последний час</span>
            </div>
            <div style={{ padding: "14px 14px 4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                <div style={{ backgroundColor: colors.bg2, borderRadius: "8px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: colors.text2, marginBottom: "2px" }}>Всего</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: colors.text }}>
                    {metrics?.requests_total_hour?.toLocaleString() || 0}
                  </div>
                </div>
                <div style={{ backgroundColor: colors.bg2, borderRadius: "8px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: colors.text2, marginBottom: "2px" }}>Ошибок</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: colors.danger }}>
                    {metrics?.requests_errors_hour || 0}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "60px", padding: "0 14px" }}>
              {[30, 45, 38, 60, 55, 72, 80, 68, 90, 100, 85, 75].map((h, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: "2px 2px 0 0",
                  backgroundColor: `${colors.accent}35`,
                  minHeight: 0, height: `${h}%`
                }} />
              ))}
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Avg response</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.avg_response_ms?.toFixed(0) || 0} мс
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>P95 response</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.p95_response_ms?.toFixed(0) || 0} мс
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Error rate</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.error_rate || 0) > 5 ? colors.danger : (metrics?.error_rate || 0) > 1 ? colors.warning : colors.text }}>
                  {(metrics?.error_rate || 0).toFixed(1)}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>RPS (сейчас)</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.rps?.toFixed(1) || 0}
                </span>
              </div>
            </div>
          </div>

          {/* PostgreSQL */}
          <div style={{ backgroundColor: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
              fontSize: "11px", fontWeight: "600", color: colors.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: colors.bg2
            }}>
              PostgreSQL
              <span style={{ fontSize: "10px", color: colors.text2, fontWeight: "400" }}>v15.2</span>
            </div>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Активных соединений</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.connections_active || 0} / {metrics?.database?.connections_max || 100}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Размер БД</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.size_mb || 0} МБ
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Таблиц</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.tables_count || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Запросов/сек</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.queries_per_sec || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Avg query time</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.avg_query_ms || 0} мс
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Cache hit rate</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.database?.cache_hit_rate || 0) > 95 ? colors.success : colors.text }}>
                  {metrics?.database?.cache_hit_rate?.toFixed(1) || 0}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${colors.border}`, fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Deadlocks</span>
                <span style={{ fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px", color: (metrics?.database?.deadlocks || 0) > 0 ? colors.danger : colors.text }}>
                  {metrics?.database?.deadlocks || 0}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", fontSize: "12px" }}>
                <span style={{ color: colors.text2 }}>Последняя миграция</span>
                <span style={{ color: colors.text, fontWeight: "500", fontFamily: "'Courier New', monospace", fontSize: "11px" }}>
                  {metrics?.database?.last_migration || "—"}
                </span>
              </div>
            </div>
            <div style={{ padding: "0 14px 14px" }}>
              <div style={{ fontSize: "11px", color: colors.text2, marginBottom: "8px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Топ таблиц по размеру
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                <span style={{ width: "100px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>activity_log</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "3px", width: "80%", backgroundColor: colors.accent2, opacity: 0.6 }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>82МБ</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", fontSize: "11px" }}>
                <span style={{ width: "100px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>repositories</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "3px", width: "45%", backgroundColor: colors.accent2, opacity: 0.6 }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>46МБ</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", fontSize: "11px" }}>
                <span style={{ width: "100px", color: colors.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>users</span>
                <div style={{ flex: 1, height: "6px", backgroundColor: colors.bg4, borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "3px", width: "22%", backgroundColor: colors.accent2, opacity: 0.6 }} />
                </div>
                <span style={{ width: "35px", textAlign: "right", color: colors.text2, fontSize: "11px", flexShrink: 0 }}>23МБ</span>
              </div>
            </div>
          </div>

          {/* Incidents */}
          <div style={{ backgroundColor: colors.bg3, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `1px solid ${colors.border}`,
              fontSize: "11px", fontWeight: "600", color: colors.text,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              backgroundColor: colors.bg2
            }}>
              Инциденты и алерты
              <span style={{ fontSize: "10px", color: colors.text2, fontWeight: "400" }}>Последние 24ч</span>
            </div>
            <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {metrics?.disk_percent > 80 && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px", backgroundColor: colors.warning }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: colors.text, lineHeight: 1.4 }}>
                      Диск заполнен на {metrics.disk_percent.toFixed(0)}% — рекомендуется очистить старые логи или расширить хранилище
                    </div>
                    <div style={{ fontSize: "10px", color: colors.text3, marginTop: "2px" }}>Активно</div>
                  </div>
                </div>
              )}

              {!serviceStatus?.api && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px", backgroundColor: colors.danger }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: colors.text, lineHeight: 1.4 }}>
                      FastAPI недоступен
                    </div>
                    <div style={{ fontSize: "10px", color: colors.text3, marginTop: "2px" }}>Активно</div>
                  </div>
                </div>
              )}

              {incidents.slice(0, 6).map((incident, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, marginTop: "3px",
                    backgroundColor: incident.level === "ERROR" ? colors.danger : incident.level === "WARNING" ? colors.warning : colors.success
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", color: colors.text, lineHeight: 1.4 }}>
                      {incident.message}
                    </div>
                    <div style={{ fontSize: "10px", color: colors.text3, marginTop: "2px" }}>
                      {new Date(incident.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}

              {metrics?.disk_percent <= 80 && serviceStatus?.api && serviceStatus?.db && serviceStatus?.git && incidents.length === 0 && (
                <div style={{ fontSize: "12px", color: colors.text2, textAlign: "center", padding: "20px 0" }}>
                  Нет активных инцидентов
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
            backgroundColor: colors.bg3,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%"
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", color: colors.text, marginBottom: "12px" }}>
              Перезапустить API?
            </div>
            <div style={{ fontSize: "14px", color: colors.text2, marginBottom: "24px", lineHeight: 1.5 }}>
              Сервис будет недоступен ~10 секунд.
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowRestartModal(false)}
                disabled={restartLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.border}`,
                  backgroundColor: "transparent",
                  color: colors.text,
                  fontSize: "14px",
                  cursor: restartLoading ? "not-allowed" : "pointer",
                  opacity: restartLoading ? 0.5 : 1
                }}
              >
                Отмена
              </button>
              <button
                onClick={restartAPI}
                disabled={restartLoading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: colors.danger,
                  color: "#fff",
                  fontSize: "14px",
                  cursor: restartLoading ? "not-allowed" : "pointer",
                  opacity: restartLoading ? 0.5 : 1
                }}
              >
                {restartLoading ? "Перезапуск..." : "Перезапустить"}
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
