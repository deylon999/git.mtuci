import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Users,
  Briefcase,
  FileText,
  GitFork,
  TrendingUp,
  FileCode,
  Clock,
  Settings,
  AlertCircle,
  BookOpen,
  FolderPlus,
  ClipboardList,
  ClipboardCheck,
  GraduationCap,
  Activity,
  FolderGit2,
  Plus,
} from "lucide-react";
import { getTeacherDashboard } from "../api/teacherDashboardApi";
import { getMe } from "../api/authApi";
import { getUserStats, getSystemMetrics, getServiceStatus } from "../api/adminApi";
import { usePendingCount } from "../context/PendingCountContext";
import { useStudentNavCountsOptional } from "../context/StudentNavCountsContext";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { UserRole } from "../api/types";

interface MenuItem {
  path: string;
  labelKey: string;
  icon: React.ElementType;
  badge?: {
    text: string;
    variant: "red" | "orange";
  };
}

interface MenuSection {
  titleKey: string;
  items: MenuItem[];
}

function buildAdminMenu(): MenuSection[] {
  return [
    { titleKey: "sidebar.overview", items: [{ path: "/admin", labelKey: "sidebar.dashboard", icon: LayoutGrid }] },
    {
      titleKey: "sidebar.users",
      items: [
        { path: "/users", labelKey: "sidebar.allUsers", icon: Users },
        { path: "/roles", labelKey: "sidebar.roles", icon: Briefcase },
      ],
    },
    {
      titleKey: "sidebar.repositories",
      items: [
        { path: "/repositories", labelKey: "sidebar.allRepositories", icon: FileText },
        { path: "/admin/forks", labelKey: "sidebar.forks", icon: GitFork },
        { path: "/admin/activity", labelKey: "sidebar.activity", icon: TrendingUp },
      ],
    },
    {
      titleKey: "sidebar.system",
      items: [
        { path: "/logs", labelKey: "sidebar.logs", icon: FileCode },
        { path: "/admin/monitoring", labelKey: "sidebar.monitoring", icon: Clock },
        { path: "/admin/settings", labelKey: "sidebar.settings", icon: Settings },
      ],
    },
  ];
}

function buildTeacherMenu(): MenuSection[] {
  return [
    { titleKey: "sidebar.main", items: [{ path: "/dashboard", labelKey: "sidebar.dashboard", icon: LayoutGrid }] },
    {
      titleKey: "sidebar.myCourses",
      items: [
        { path: "/teacher/courses", labelKey: "sidebar.allCourses", icon: BookOpen },
        { path: "/courses", labelKey: "sidebar.createCourse", icon: Plus },
      ],
    },
    {
      titleKey: "sidebar.students",
      items: [
        { path: "/teacher/students", labelKey: "sidebar.allStudents", icon: GraduationCap },
        { path: "/teacher/code-review", labelKey: "sidebar.codeReview", icon: ClipboardCheck },
      ],
    },
    {
      titleKey: "sidebar.repositories",
      items: [
        { path: "/teacher/templates", labelKey: "sidebar.templateRepos", icon: FolderGit2 },
        { path: "/teacher/activity", labelKey: "sidebar.studentActivity", icon: Activity },
      ],
    },
    {
      titleKey: "sidebar.account",
      items: [
        { path: "/profile", labelKey: "sidebar.profile", icon: Users },
        { path: "/settings", labelKey: "sidebar.settings", icon: Settings },
      ],
    },
  ];
}

function buildStudentMenu(): MenuSection[] {
  return [
    { titleKey: "sidebar.main", items: [{ path: "/dashboard", labelKey: "sidebar.dashboard", icon: LayoutGrid }] },
    {
      titleKey: "sidebar.myRepositories",
      items: [
        { path: "/repositories", labelKey: "sidebar.allRepositories", icon: FileText },
        { path: "/repositories/forks", labelKey: "sidebar.forks", icon: GitFork },
      ],
    },
    {
      titleKey: "sidebar.study",
      items: [
        { path: "/courses", labelKey: "sidebar.myCoursesStudent", icon: BookOpen },
        { path: "/assignments", labelKey: "sidebar.assignments", icon: ClipboardList },
        { path: "/deadlines", labelKey: "sidebar.deadlines", icon: Clock },
        { path: "/grades", labelKey: "sidebar.grades", icon: TrendingUp },
      ],
    },
    {
      titleKey: "sidebar.account",
      items: [
        { path: "/profile", labelKey: "sidebar.profile", icon: Users },
        { path: "/settings", labelKey: "sidebar.settings", icon: Settings },
      ],
    },
  ];
}

interface SidebarProps {
  isDarkTheme?: boolean;
}

export default function Sidebar({ isDarkTheme = true }: SidebarProps) {
  console.log("[Sidebar] Component rendering");
  const location = useLocation();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { pendingCount, setPendingCount } = usePendingCount();
  const studentNav = useStudentNavCountsOptional();
  const [hasSystemIssues, setHasSystemIssues] = useState(false);
  const [teacherPending, setTeacherPending] = useState(0);
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);

  useEffect(() => {
    if (userRole !== "student") return;
    void studentNav?.refreshSidebarCounts();
  }, [userRole, studentNav?.refreshSidebarCounts]);

  useEffect(() => {
    console.log("[Sidebar] useEffect triggered");
    let cancelled = false;
    async function loadMe() {
      try {
        console.log("[Sidebar] Fetching /auth/me...");
        const me = await getMe({ force: true });
        console.log("[Sidebar] User role from API:", me.role, "| full response:", me);
        if (!cancelled) {
          setUserRole(me.role);
        }
      } catch (e) {
        console.error("[Sidebar] Failed to load user:", e);
        if (!cancelled) setUserRole(null);
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userRole !== "teacher" && userRole !== "laborant") return;
    let cancelled = false;
    void getTeacherDashboard()
      .then((d) => {
        if (!cancelled) setTeacherPending(d.pending_grading);
      })
      .catch(() => {
        if (!cancelled) setTeacherPending(0);
      });
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  // Load pending users count for admin
  useEffect(() => {
    if (userRole !== "admin") return;
    let cancelled = false;
    async function loadPendingCount() {
      try {
        const stats = await getUserStats();
        if (!cancelled) {
          setPendingCount(stats.pending);
        }
      } catch (e) {
        console.error("[Sidebar] Failed to load pending count:", e);
      }
    }
    loadPendingCount();
    return () => {
      cancelled = true;
    };
  }, [userRole, setPendingCount]);

  // Check for system issues (CPU/RAM/Disk > 80% or services offline)
  useEffect(() => {
    if (userRole !== "admin") return;
    let cancelled = false;
    async function checkSystemHealth() {
      try {
        const [metrics, status] = await Promise.all([
          getSystemMetrics().catch(() => null),
          getServiceStatus().catch(() => null),
        ]);

        if (!cancelled) {
          const hasIssues =
            (metrics?.cpu_percent ?? 0) > 80 ||
            (metrics?.memory_percent ?? 0) > 80 ||
            (metrics?.disk_percent ?? 0) > 80 ||
            !status?.api ||
            !status?.db ||
            !status?.git;
          setHasSystemIssues(hasIssues);
        }
      } catch (e) {
        console.error("[Sidebar] Failed to check system health:", e);
      }
    }
    checkSystemHealth();
    // Check every 30 seconds
    const interval = setInterval(checkSystemHealth, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userRole]);

  /** Служебные разделы под /repositories — не подсвечивают «Все репозитории». */
  const REPO_LIST_UTILITY_SEGMENTS = new Set(["new", "forks"]);

  const isActive = (path: string) => {
    const pathname = location.pathname;
    if (pathname === path) return true;

    if (path === "/repositories") {
      if (!pathname.startsWith("/repositories/")) return false;
      const first = pathname.slice("/repositories/".length).split("/")[0];
      if (!first || REPO_LIST_UTILITY_SEGMENTS.has(first)) return false;
      return true;
    }

    if (path === "/repositories/new" || path === "/repositories/forks") {
      return pathname === path;
    }

    return pathname.startsWith(`${path}/`);
  };

  const menuSections = useMemo(() => {
    if (userRole === "admin") return buildAdminMenu();
    if (userRole === "teacher" || userRole === "laborant") {
      return buildTeacherMenu().map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.path === "/teacher/code-review" && teacherPending > 0) {
            return { ...item, badge: { text: String(teacherPending), variant: "red" as const } };
          }
          return item;
        }),
      }));
    }
    if (userRole !== "student") return buildStudentMenu();
    const sidebar = studentNav?.sidebar;
    return buildStudentMenu().map((section) => ({
      ...section,
      items: section.items.map((item) => {
        let badge = item.badge;
        if (item.path === "/courses" && sidebar && sidebar.courses_count > 0) {
          badge = { text: String(sidebar.courses_count), variant: "orange" };
        }
        if (item.path === "/assignments" && sidebar && sidebar.assignments_pending > 0) {
          badge = { text: String(sidebar.assignments_pending), variant: "red" };
        }
        return { ...item, badge };
      }),
    }));
  }, [userRole, studentNav?.sidebar, teacherPending, t]);

  // While loading, show nothing or student menu to avoid flashing admin menu
  if (userRole === null) {
    console.log("[Sidebar] Role is null, showing loading state");
    return (
      <aside className={`w-[260px] flex-shrink-0 h-full border-r`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
        <div className={`p-4 text-sm`} style={{ color: theme.text2 }}>{t("common.loading")}</div>
      </aside>
    );
  }

  console.log("[Sidebar] Rendering menu for role:", userRole, "sections count:", menuSections.length);

  return (
    <aside className={`w-[260px] flex-shrink-0 h-full border-r`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <nav className="p-4">
        {menuSections.map((section) => (
          <div key={section.titleKey} className="mb-6">
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-3`} style={{ color: theme.text2 }}>
              {t(section.titleKey)}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? `border-l-2 border-blue-500`
                          : ``
                      }`}
                      style={{
                        backgroundColor: active ? theme.hoverBg : 'transparent',
                        color: active ? theme.accent : theme.text2
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5`} style={{ color: active ? theme.accent : theme.text3 }} />
                        <span>{t(item.labelKey)}</span>
                      </div>
                      {/* Pending users badge for "Все пользователи" */}
                      {item.path === "/users" && pendingCount > 0 && (
                        <span
                          className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold bg-red-500 text-white"
                        >
                          {pendingCount}
                        </span>
                      )}
                      {item.path !== "/users" && item.badge && (
                        <span
                          className={`flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold ${
                            item.badge.variant === "red"
                              ? "bg-red-500 text-white"
                              : "bg-orange-500 text-white"
                          }`}
                        >
                          {item.badge.text}
                        </span>
                      )}
                      {item.path === "/admin/monitoring" && hasSystemIssues && (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
