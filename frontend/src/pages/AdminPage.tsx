import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  GitBranch,
  Clock,
  TrendingUp,
  ArrowRight,
  MoreHorizontal,
  Download,
  Plus,
  Info,
  AlertOctagon,
  GitCommit,
  Cloud,
  RotateCcw,
  Database,
  Mail,
  CheckCircle2,
  AlertTriangle,
  GitPullRequest,
  BellOff,
  X,
  Search,
  Filter,
  type LucideIcon,
} from "lucide-react";
import type { AdminUserRead } from "../api/types";
import {
  getAdminUsers,
  getSystemMetrics,
  getServiceStatus,
  getBackups,
  createBackup,
  getCommitsByFaculty,
  getActiveRepositories,
  getAdminReportsOverview,
  getAdminReviewQueue,
  type AdminReportsOverview,
} from "../api/adminApi";
import { getNotifications } from "../api/notificationsApi";
import type { AdminReviewQueueItem } from "../api/types";
import type { SystemMetrics, ServiceStatus, BackupInfo, FacultyCommitsStat, ActiveRepositoryStat } from "../api/types";
import { usePermissions } from "../hooks/usePermissions";
import toast from "react-hot-toast";
import AdminPageHeader from "../components/AdminPageHeader";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { translate, translateWithParams } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

interface Stats {
  total: number;
  active: number;
  pending: number;
  blocked: number;
}

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  trendUp: boolean;
  icon: React.ElementType;
  isDarkTheme?: boolean;
}

interface AdminPageProps {
  isDarkTheme?: boolean;
}

function ReportsOverviewBlock({
  data,
  isDarkTheme,
}: {
  data: AdminReportsOverview;
  isDarkTheme: boolean;
}) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  return (
    <div
      className="mb-6 rounded-xl border p-4"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      <h2 className="mb-3 text-lg font-semibold" style={{ color: theme.text }}>
        {t("admin.dashboard.overviewTitle")}
      </h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t("admin.dashboard.statUsers"), data.total_users],
          [t("admin.dashboard.statPending"), data.pending_users],
          [t("admin.dashboard.statCourses"), data.total_courses],
          [t("admin.dashboard.statSubmissions"), data.submissions_pending_grade],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-3" style={{ borderColor: theme.border }}>
            <p className="text-xs" style={{ color: theme.text2 }}>
              {label}
            </p>
            <p className="text-xl font-semibold" style={{ color: theme.text }}>
              {value}
            </p>
          </div>
        ))}
      </div>
      {data.courses.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: theme.text2 }}>
              <tr>
                <th className="py-2 text-left">{t("admin.dashboard.colCourse")}</th>
                <th className="py-2 text-left">{t("admin.dashboard.colTeacher")}</th>
                <th className="py-2 text-left">{t("admin.dashboard.colStudents")}</th>
                <th className="py-2 text-left">{t("admin.dashboard.colAssignments")}</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: theme.border }}>
                  <td className="py-2" style={{ color: theme.text }}>
                    {c.title}
                  </td>
                  <td className="py-2" style={{ color: theme.text2 }}>
                    {c.teacher_name}
                  </td>
                  <td className="py-2">{c.students_count}</td>
                  <td className="py-2">{c.assignments_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

interface Notification {
  id: string;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  category: 'server' | 'users' | 'git' | 'edu';
}

function getIcon(type: Notification['type']): LucideIcon {
  switch (type) {
    case 'critical':
      return AlertOctagon;
    case 'warning':
      return AlertTriangle;
    case 'info':
      return Info;
    case 'success':
      return CheckCircle2;
    default:
      return Info;
  }
}

function getNotificationColor(type: Notification['type']): string {
  switch (type) {
    case 'critical':
      return 'text-red-500 bg-red-500';
    case 'warning':
      return 'text-yellow-500 bg-yellow-500';
    case 'info':
      return 'text-blue-500 bg-blue-500';
    case 'success':
      return 'text-green-500 bg-green-500';
    default:
      return 'text-blue-500 bg-blue-500';
  }
}

function StatCard({ title, value, trend, trendUp, icon: Icon, isDarkTheme = true }: StatCardProps) {
  const theme = getTheme(isDarkTheme);

  return (
    <div className="rounded-xl border p-5 transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: theme.text2 }}>{title}</p>
          <p className="mt-2 text-3xl font-bold" style={{ color: theme.text }}>{value}</p>
          <p className="mt-1 text-xs font-medium" style={{ color: trendUp ? theme.accent : theme.danger }}>
            {trendUp ? "↑" : "↓"} {trend}
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ backgroundColor: theme.bg4 }}>
          <Icon className="h-6 w-6" style={{ color: theme.text3 }} />
        </div>
      </div>
    </div>
  );
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const styles = {
    pending: "bg-yellow-500/20 text-yellow-400",
    active: "bg-green-500/20 text-green-400",
    blocked: "bg-red-500/20 text-red-400",
  };
  const labels = {
    pending: t("admin.dashboard.statusPending"),
    active: t("admin.dashboard.statusActive"),
    blocked: t("admin.dashboard.statusBlocked"),
  };
  const style = styles[status as keyof typeof styles] || styles.pending;
  const label = labels[status as keyof typeof labels] || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

export default function AdminPage({ isDarkTheme = true }: AdminPageProps) {
  const { t, tp, language } = useUserPreferences();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const [activeTab, setActiveTab] = useState("overview");
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRead[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, pending: 0, blocked: 0 });
  const [systemStatus, setSystemStatus] = useState<{ api: "online" | "offline"; db: "online" | "offline" }>({ api: "offline", db: "offline" });
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [facultyStats, setFacultyStats] = useState<FacultyCommitsStat[]>([]);
  const [facultyStatsLoading, setFacultyStatsLoading] = useState(false);
  const [activeRepositories, setActiveRepositories] = useState<ActiveRepositoryStat[]>([]);
  const [activeRepositoriesLoading, setActiveRepositoriesLoading] = useState(false);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reviewQueue, setReviewQueue] = useState<AdminReviewQueueItem[]>([]);
  const [reportsOverview, setReportsOverview] = useState<AdminReportsOverview | null>(null);

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setFacultyStatsLoading(true);
    setActiveRepositoriesLoading(true);
    try {
      const [list, sysMetrics, svcStatus, backups, facultyData, repoData, reports, reviewData, appNotifs] =
        await Promise.all([
        getAdminUsers(),
        getSystemMetrics().catch(() => null),
        getServiceStatus().catch(() => null),
        getBackups().catch(() => null),
        getCommitsByFaculty().catch(() => []),
        getActiveRepositories(5).catch(() => []),
        getAdminReportsOverview().catch(() => null),
        getAdminReviewQueue(5).catch(() => []),
        getNotifications().catch(() => []),
      ]);
      setUsers(list);
      setStats({
        total: list.length,
        active: list.filter((u) => !u.is_blocked).length,
        pending: list.filter((u) => u.is_pending).length,
        blocked: list.filter((u) => u.is_blocked).length,
      });
      setMetrics(sysMetrics);
      setServiceStatus(svcStatus);
      setBackupInfo(backups);
      setFacultyStats(facultyData);
      setActiveRepositories(repoData);
      setReportsOverview(reports);
      setReviewQueue(reviewData);

      const loc = getI18nLocale();
      const justNow = translate(loc, "time.justNow");

      const inboxNotifications: Notification[] = appNotifs.slice(0, 10).map((n) => ({
        id: n.id,
        type:
          n.type === "error"
            ? "critical"
            : n.type === "warning"
              ? "warning"
              : n.type === "success"
                ? "success"
                : "info",
        title: n.title,
        message: n.message,
        timestamp: new Date(n.created_at).toLocaleString(loc === "en" ? "en-US" : "ru-RU"),
        category: "edu",
      }));

      const metricNotifications: Notification[] = [];

      if (sysMetrics) {
        const newNotifications: Notification[] = [];

        if (sysMetrics.disk_percent >= 85) {
          newNotifications.push({
            id: `disk-${Date.now()}`,
            type: sysMetrics.disk_percent >= 95 ? "critical" : "warning",
            title: translate(loc, "admin.dashboard.alertDiskFull"),
            message: translateWithParams(loc, "admin.dashboard.alertDiskFullMsg", { n: sysMetrics.disk_percent }),
            timestamp: justNow,
            category: "server",
          });
        }

        if (sysMetrics.memory_percent >= 90) {
          newNotifications.push({
            id: `mem-${Date.now()}`,
            type: "critical",
            title: translate(loc, "admin.dashboard.alertRamHigh"),
            message: translateWithParams(loc, "admin.dashboard.alertRamHighMsg", { n: sysMetrics.memory_percent }),
            timestamp: justNow,
            category: "server",
          });
        }

        if (sysMetrics.cpu_percent >= 95) {
          newNotifications.push({
            id: `cpu-${Date.now()}`,
            type: "warning",
            title: translate(loc, "admin.dashboard.alertCpuHigh"),
            message: translateWithParams(loc, "admin.dashboard.alertCpuHighMsg", { n: sysMetrics.cpu_percent }),
            timestamp: justNow,
            category: "server",
          });
        }

        if (svcStatus && !svcStatus.git) {
          newNotifications.push({
            id: `git-${Date.now()}`,
            type: "critical",
            title: translate(loc, "admin.dashboard.alertGitDown"),
            message: translate(loc, "admin.dashboard.alertGitDownMsg"),
            timestamp: justNow,
            category: "git",
          });
        }
        
        metricNotifications.push(...newNotifications);
      }
      setNotifications([...inboxNotifications, ...metricNotifications]);
      setSystemStatus({
        api: svcStatus?.api ? "online" : "offline",
        db: svcStatus?.db ? "online" : "offline",
      });
    } catch {
      setSystemStatus({ api: "offline", db: "offline" });
    } finally {
      setLoading(false);
      setFacultyStatsLoading(false);
      setActiveRepositoriesLoading(false);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRepoDropdown && !(event.target as Element).closest('.repo-dropdown-container')) {
        setShowRepoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRepoDropdown]);

  const handleCreateBackup = useCallback(async () => {
    setBackupLoading(true);
    try {
      const result = await createBackup();
      // Refresh backup info
      const backups = await getBackups();
      setBackupInfo(backups);
      // Add notification
      const loc = getI18nLocale();
      const justNow = translate(loc, "time.justNow");
      const newNotification: Notification = {
        id: Date.now().toString(),
        type: "success",
        title: translate(loc, "admin.dashboard.backupCreatedTitle"),
        message: translateWithParams(loc, "admin.dashboard.backupCreatedMsg", { file: result.file }),
        timestamp: justNow,
        category: "server",
      };
      setNotifications((prev) => [newNotification, ...prev]);
      toast.success(t("admin.dashboard.backupSuccess"));
    } catch (err) {
      const loc = getI18nLocale();
      const justNow = translate(loc, "time.justNow");
      const errorNotification: Notification = {
        id: Date.now().toString(),
        type: "critical",
        title: translate(loc, "admin.dashboard.backupErrorTitle"),
        message: err instanceof Error ? err.message : t("admin.dashboard.backupFailed"),
        timestamp: justNow,
        category: "server",
      };
      setNotifications((prev) => [errorNotification, ...prev]);
      toast.error(err instanceof Error ? err.message : t("admin.dashboard.backupError"));
    } finally {
      setBackupLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Calculate weekly trends (compare current week vs previous week)
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const isInRange = (date: string, start: Date, end: Date) => {
    const d = new Date(date);
    return d >= start && d < end;
  };

  // Current week (last 7 days)
  const currentNew = users.filter((u) => isInRange(u.created_at, oneWeekAgo, now)).length;
  const currentActive = users.filter((u) => !u.is_blocked && isInRange(u.created_at, oneWeekAgo, now)).length;
  const currentPending = users.filter((u) => u.is_pending && isInRange(u.created_at, oneWeekAgo, now)).length;
  const currentBlocked = users.filter((u) => u.is_blocked && isInRange(u.created_at, oneWeekAgo, now)).length;

  // Previous week (7-14 days ago)
  const prevNew = users.filter((u) => isInRange(u.created_at, twoWeeksAgo, oneWeekAgo)).length;
  const prevActive = users.filter((u) => !u.is_blocked && isInRange(u.created_at, twoWeeksAgo, oneWeekAgo)).length;
  const prevPending = users.filter((u) => u.is_pending && isInRange(u.created_at, twoWeeksAgo, oneWeekAgo)).length;
  const prevBlocked = users.filter((u) => u.is_blocked && isInRange(u.created_at, twoWeeksAgo, oneWeekAgo)).length;

  const formatTrend = (current: number, previous: number) => {
    const diff = current - previous;
    const sign = diff >= 0 ? "+" : "";
    return tp("admin.dashboard.trendWeek", { sign, n: diff });
  };

  const statCards = [
    { title: t("admin.dashboard.cardTotal"), value: stats.total.toLocaleString(), trend: formatTrend(currentNew, prevNew), trendUp: currentNew >= prevNew, icon: Users },
    { title: t("admin.dashboard.cardActive"), value: stats.active.toLocaleString(), trend: formatTrend(currentActive, prevActive), trendUp: currentActive >= prevActive, icon: GitBranch },
    { title: t("admin.dashboard.cardPending"), value: stats.pending.toLocaleString(), trend: formatTrend(currentPending, prevPending), trendUp: currentPending >= prevPending, icon: TrendingUp },
    { title: t("admin.dashboard.cardBlocked"), value: stats.blocked.toLocaleString(), trend: formatTrend(currentBlocked, prevBlocked), trendUp: currentBlocked >= prevBlocked, icon: Clock },
  ];

  const theme = getTheme(isDarkTheme);

  return (
    <div className="h-full overflow-auto transition-colors">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <AdminPageHeader
            isDarkTheme={isDarkTheme}
            title={t("admin.dashboard.title")}
            subtitle={`API: ${systemStatus.api === "online" ? "● Online" : "● Offline"} | DB: ${systemStatus.db === "online" ? "● Online" : "● Offline"}`}
            actions={
              <>
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={{ backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text2 }}
                >
                  <Download className="h-4 w-4" />
                  {t("admin.dashboard.exportReport")}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {t("admin.dashboard.newCourse")}
                </button>
              </>
            }
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
          {statCards.map((stat) => (
            <StatCard key={stat.title} {...stat} isDarkTheme={isDarkTheme} />
          ))}
        </div>

        {reportsOverview ? (
          <ReportsOverviewBlock data={reportsOverview} isDarkTheme={isDarkTheme} />
        ) : null}

        {/* Bottom Row - 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
          {/* Left - New Users Table (60%) */}
          <div className="lg:col-span-3 rounded-xl border shadow-sm transition-colors"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="p-5 flex items-center justify-between border-b"
            style={{ borderColor: theme.border }}>
              <h2 className="text-lg font-semibold transition-colors"
              style={{ color: theme.text }}>{t("admin.dashboard.newUsers")}</h2>
              <Link to="/users" className="group text-sm flex items-center gap-1 font-medium"
              style={{ color: theme.accent }}>
                {t("admin.dashboard.viewAll")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="text-sm text-center py-8"
                style={{ color: theme.text2 }}>{t("common.loading")}</div>
              ) : (
                <table className="w-auto">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-3 pr-8 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: theme.text2 }}>{t("admin.dashboard.colName")}</th>
                      <th className="pb-3 pr-8 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: theme.text2 }}>{t("admin.dashboard.colGroup")}</th>
                      <th className="pb-3 pr-8 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: theme.text2 }}>{t("admin.dashboard.colRole")}</th>
                      <th className="pb-3 pr-8 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: theme.text2 }}>{t("admin.dashboard.colDate")}</th>
                      <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-left"
                      style={{ color: theme.text2 }}>{t("admin.dashboard.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, rowIdx) => (
                      <tr
                        key={user.id}
                        className="transition-colors"
                        style={rowIdx > 0 ? { borderTop: `1px solid ${theme.border}` } : undefined}
                      >
                        <td className="py-3 pr-8">
                          <div>
                            <p className="text-sm font-medium"
                            style={{ color: theme.text }}>{user.full_name}</p>
                            <p className="text-xs"
                            style={{ color: theme.text2 }}>{user.email}</p>
                          </div>
                        </td>
                        <td className="py-3 pr-8 text-sm"
                        style={{ color: theme.text3 }}>{user.group_name || "—"}</td>
                        <td className="py-3 pr-8">
                          <span className="text-sm capitalize"
                          style={{ color: theme.text3 }}>
                            {user.role === "admin" ? t("admin.users.roleShortAdmin") : user.role === "teacher" ? t("admin.users.roleShortTeacher") : user.role === "laborant" ? t("admin.users.roleShortLaborant") : t("admin.users.roleShortStudent")}
                          </span>
                        </td>
                        <td className="py-3 pr-8 text-sm"
                        style={{ color: theme.text3 }}>
                          {user.created_at && !isNaN(new Date(user.created_at).getTime())
                            ? new Date(user.created_at).toLocaleDateString(dateLocale)
                            : "—"}
                        </td>
                        <td className="py-3 text-left first:rounded-l-lg last:rounded-r-lg">
                          {getStatusBadge(user.is_blocked ? "blocked" : user.is_pending ? "pending" : "active", t)}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm"
                        style={{ color: theme.text2 }}>{t("admin.dashboard.noData")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right - Active Repositories (40%) */}
          <div className="lg:col-span-2 rounded-xl border shadow-sm transition-colors"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="p-5 flex items-center justify-between border-b"
            style={{ borderColor: theme.border }}>
              <h2 className="text-lg font-semibold transition-colors"
              style={{ color: theme.text }}>{t("admin.dashboard.activeRepos")}</h2>
              <div className="relative repo-dropdown-container">
                <button
                  onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                  className="transition-colors"
                  style={{ color: theme.text3 }}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {showRepoDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border backdrop-blur-md shadow-lg z-50"
                  style={{ backgroundColor: theme.bg3 + 'F0', borderColor: theme.border + '80' }}>
                    <div className="p-1.5 space-y-0.5">
                      {hasPermission("repo_create") && (
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors"
                        style={{ color: theme.text2 }}>
                          <Plus className="h-4 w-4"
                          style={{ color: theme.text3 }} />
                          {t("admin.dashboard.createRepo")}
                        </button>
                      )}
                      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors"
                      style={{ color: theme.text2 }}>
                        <Search className="h-4 w-4"
                        style={{ color: theme.text3 }} />
                        {t("admin.dashboard.searchProject")}
                      </button>
                      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors"
                      style={{ color: theme.text2 }}>
                        <Filter className="h-4 w-4"
                        style={{ color: theme.text3 }} />
                        {t("admin.dashboard.filterFaculty")}
                      </button>
                      <div className="h-px mx-1"
                      style={{ backgroundColor: theme.border + '80' }} />
                      <button
                        onClick={() => { setActiveRepositoriesLoading(true); load(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors"
                        style={{ color: theme.text2 }}>
                        <RotateCcw className="h-4 w-4"
                        style={{ color: theme.text3 }} />
                        {t("admin.dashboard.refreshList")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {activeRepositoriesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : activeRepositories.length === 0 ? (
                  <div className="text-center py-8"
                  style={{ color: theme.text2 }}>
                    {t("admin.dashboard.noActiveRepos")}
                  </div>
                ) : (
                  activeRepositories.map((repo) => (
                    <div key={repo.id} className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition-colors">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold ${repo.color}`}>
                        {repo.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate"
                        style={{ color: theme.text }}>{repo.name}</p>
                        <p className="text-xs"
                        style={{ color: theme.text2 }}>{repo.author} • {tp("admin.dashboard.commitsCount", { n: repo.commits })}</p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${repo.is_public ? isDarkTheme ? "text-green-400 bg-green-500/20" : "text-green-700 bg-green-100" : isDarkTheme ? "text-gray-300 bg-gray-500/20" : "text-gray-700 bg-gray-100"}`}>
                        {repo.is_public ? "Public" : "Private"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Third Row - 3 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Notifications */}
          <div className="rounded-xl border shadow-sm transition-colors"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="p-5 flex items-center justify-between border-b"
            style={{ borderColor: theme.border }}>
              <h2 className="text-lg font-semibold transition-colors"
              style={{ color: theme.text }}>{t("admin.dashboard.notifications")}</h2>
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: theme.text2 }}
                >
                  <X className="h-3 w-3" />
                  {t("admin.dashboard.clearAll")}
                </button>
              )}
            </div>
            <div className="p-5">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12"
                style={{ color: theme.text3 }}>
                  <BellOff className="h-10 w-10 mb-3 opacity-50" />
                  <p className="text-sm">{t("admin.dashboard.noNotifications")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const Icon = getIcon(notification.type);
                    const colorClass = getNotificationColor(notification.type);
                    return (
                      <div
                        key={notification.id}
                        className="flex items-start gap-3 rounded-lg p-3 -mx-2 transition-colors"
                      >
                        <div className="mt-0.5">
                          <div className={`h-2 w-2 rounded-full ${colorClass.split(' ')[1]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium"
                            style={{ color: theme.text }}>
                              {notification.title}
                            </p>
                            <Icon className={`h-4 w-4 flex-shrink-0 ${colorClass.split(' ')[0]}`} />
                          </div>
                          <p className="text-xs mt-0.5"
                          style={{ color: theme.text2 }}>
                            {notification.message}
                          </p>
                          <p className="text-xs mt-1"
                          style={{ color: theme.text3 }}>
                            {notification.timestamp} • {notification.category}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Commits by Department */}
          <div className="rounded-xl border shadow-sm transition-colors"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="p-5 border-b"
            style={{ borderColor: theme.border }}>
              <h2 className="text-lg font-semibold transition-colors"
              style={{ color: theme.text }}>{t("admin.dashboard.commitsByFaculty")}</h2>
            </div>
            <div className="p-5">
              <div className="space-y-4 mb-6">
                {facultyStatsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : facultyStats.length === 0 ? (
                  <div className="text-center py-8"
                  style={{ color: theme.text2 }}>
                    {t("admin.dashboard.noCommitData")}
                  </div>
                ) : (
                  facultyStats.map((dept) => (
                    <div key={dept.short_name} className="rounded-lg p-2 -mx-2 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm"
                        style={{ color: theme.text3 }}>{dept.faculty}</span>
                        <span className="text-sm font-semibold"
                        style={{ color: theme.text }}>{dept.commits}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: theme.bg4 }}>
                        <div className={`h-full rounded-full ${dept.color}`} style={{ width: `${(dept.commits / Math.max(...facultyStats.map(s => s.commits))) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t pt-4"
              style={{ borderColor: theme.border }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"
                style={{ color: theme.text }}>
                  <GitPullRequest className="h-4 w-4"
                  style={{ color: theme.text2 }} />
                  {t("admin.dashboard.codeReviewQueue")}
                </h3>
                <div className="space-y-2">
                  {reviewQueue.length === 0 ? (
                    <p className="text-sm py-2" style={{ color: theme.text2 }}>
                      {t("admin.dashboard.noReviewQueue")}
                    </p>
                  ) : (
                    reviewQueue.map((item) => {
                      const icon =
                        item.urgency === "urgent"
                          ? AlertOctagon
                          : item.urgency === "today"
                            ? Clock
                            : CheckCircle2;
                      const iconColor =
                        item.urgency === "urgent"
                          ? "text-red-500"
                          : item.urgency === "today"
                            ? "text-yellow-500"
                            : "text-green-500";
                      const statusLabel =
                        item.urgency === "urgent"
                          ? t("admin.dashboard.urgent")
                          : item.urgency === "today"
                            ? t("admin.dashboard.today")
                            : t("admin.dashboard.normal");
                      const statusClass =
                        item.urgency === "urgent"
                          ? isDarkTheme
                            ? "bg-red-500/20 text-red-400"
                            : "bg-red-100 text-red-700"
                          : item.urgency === "today"
                            ? isDarkTheme
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-yellow-100 text-yellow-700"
                            : isDarkTheme
                              ? "bg-green-500/20 text-green-400"
                              : "bg-green-100 text-green-700";
                      return (
                        <div
                          key={item.repo_label}
                          className="flex items-center justify-between rounded-xl p-3 transition-colors"
                          style={{ backgroundColor: theme.bg4 }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {(() => {
                              const Icon = icon;
                              return <Icon className={`h-4 w-4 flex-shrink-0 ${iconColor}`} />;
                            })()}
                            <div>
                              <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                                {item.repo_label}
                              </p>
                              <p className="text-xs" style={{ color: theme.text2 }}>
                                {tp("admin.dashboard.pendingSubmissions", { n: item.pending_count })}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="rounded-xl border shadow-sm transition-colors"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="p-5 border-b"
            style={{ borderColor: theme.border }}>
              <h2 className="text-lg font-semibold transition-colors"
              style={{ color: theme.text }}>{t("admin.dashboard.systemState")}</h2>
            </div>
            <div className="p-5">
              {/* Progress bars */}
              <div className="space-y-4 mb-6">
                {metrics ? [
                  { label: "CPU", value: Math.round(metrics.cpu_percent), color: "bg-blue-500" },
                  { label: "RAM", value: Math.round(metrics.memory_percent), color: "bg-green-500" },
                  { label: t("admin.dashboard.disk"), value: Math.round(metrics.disk_percent), color: "bg-red-500" },
                ].map((metric) => (
                  <div key={metric.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm"
                      style={{ color: theme.text3 }}>{metric.label}</span>
                      <span className="text-sm font-medium"
                      style={{ color: theme.text }}>{metric.value}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: theme.bg4 }}>
                      <div className={`h-full rounded-full ${metric.color} ${metric.value > 80 ? "brightness-110" : ""}`} style={{ width: `${metric.value}%` }} />
                    </div>
                  </div>
                )) : (
                  <div className="text-sm"
                  style={{ color: theme.text2 }}>{t("admin.dashboard.loadingMetrics")}</div>
                )}
              </div>

              {/* Service status */}
              <div className="space-y-3 mb-6">
                {[
                  { icon: GitBranch, label: t("admin.dashboard.gitService"), status: serviceStatus?.git ? "Online" : "Offline", statusColor: serviceStatus?.git ? isDarkTheme ? "text-green-400" : "text-green-600" : isDarkTheme ? "text-red-400" : "text-red-600" },
                  { icon: Database, label: t("admin.dashboard.dbLabel"), status: serviceStatus?.db ? "Online" : "Offline", statusColor: serviceStatus?.db ? isDarkTheme ? "text-green-400" : "text-green-600" : isDarkTheme ? "text-red-400" : "text-red-600" },
                  { icon: Mail, label: "API", status: serviceStatus?.api ? "Online" : "Offline", statusColor: serviceStatus?.api ? isDarkTheme ? "text-green-400" : "text-green-600" : isDarkTheme ? "text-red-400" : "text-red-600" },
                ].map((svc) => (
                  <div key={svc.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svc.icon className="h-4 w-4"
                      style={{ color: theme.text2 }} />
                      <span className="text-sm"
                      style={{ color: theme.text3 }}>{svc.label}</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: svc.statusColor }}>
                      {svc.status === "Online" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {svc.status}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4"
                    style={{ color: theme.text2 }} />
                    <span className="text-sm"
                    style={{ color: theme.text3 }}>{t("admin.dashboard.backupLabel")}</span>
                  </div>
                  <span className="text-xs"
                  style={{ color: theme.text2 }}>
                    {backupInfo?.last_backup || t("admin.dashboard.noBackupData")}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-4 border-t"
              style={{ borderColor: theme.border }}>
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDarkTheme ? "bg-[#2d2d2d] border-[#3d3d3d] text-gray-300 hover:bg-[#3d3d3d]" : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"}`}
                >
                  <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? t("admin.dashboard.refreshing") : t("admin.dashboard.refreshData")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={backupLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Database className={`h-4 w-4 ${backupLoading ? "animate-pulse" : ""}`} />
                  {backupLoading ? t("admin.dashboard.backupCreating") : t("admin.dashboard.backupNow")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
