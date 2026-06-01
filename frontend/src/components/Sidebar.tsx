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
import { useAuthUser } from "../context/AuthUserContext";
import { usePermissions } from "../context/PermissionsContext";
import { getUserStats, getSystemMetrics, getServiceStatus } from "../api/adminApi";
import { usePendingCount } from "../context/PendingCountContext";
import { useStudentNavCountsOptional } from "../context/StudentNavCountsContext";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { UserRole } from "../api/types";
import { useRoleMode } from "../context/RoleModeContext";

interface MenuItem {
  path: string;
  labelKey: string;
  icon: React.ElementType;
  permission?: string;
  anyPermission?: string[];
  badge?: {
    text: string;
    variant: "red" | "orange";
  };
}

function itemVisible(
  item: MenuItem,
  hasPermission: (id: string) => boolean,
  hasAnyPermission: (...ids: string[]) => boolean,
): boolean {
  if (item.permission) return hasPermission(item.permission);
  if (item.anyPermission?.length) return hasAnyPermission(...item.anyPermission);
  return true;
}

function filterMenuSections(
  sections: MenuSection[],
  hasPermission: (id: string) => boolean,
  hasAnyPermission: (...ids: string[]) => boolean,
): MenuSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => itemVisible(item, hasPermission, hasAnyPermission)),
    }))
    .filter((section) => section.items.length > 0);
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
        { path: "/users", labelKey: "sidebar.allUsers", icon: Users, permission: "user_view" },
        { path: "/roles", labelKey: "sidebar.roles", icon: Briefcase },
      ],
    },
    {
      titleKey: "sidebar.repositories",
      items: [
        { path: "/repositories", labelKey: "sidebar.allRepositories", icon: FileText, permission: "repo_view" },
        { path: "/admin/forks", labelKey: "sidebar.forks", icon: GitFork, permission: "repo_view" },
        { path: "/admin/activity", labelKey: "sidebar.activity", icon: TrendingUp, permission: "settings_view" },
      ],
    },
    {
      titleKey: "sidebar.system",
      items: [
        { path: "/logs", labelKey: "sidebar.logs", icon: FileCode, permission: "logs_view" },
        { path: "/admin/monitoring", labelKey: "sidebar.monitoring", icon: Clock, permission: "settings_view" },
        { path: "/admin/settings", labelKey: "sidebar.settings", icon: Settings, permission: "settings_edit" },
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
        { path: "/teacher/courses", labelKey: "sidebar.allCourses", icon: BookOpen, permission: "assignment_view" },
        { path: "/courses?create=1", labelKey: "sidebar.createCourse", icon: Plus, permission: "assignment_create" },
      ],
    },
    {
      titleKey: "sidebar.students",
      items: [
        { path: "/teacher/students", labelKey: "sidebar.allStudents", icon: GraduationCap, permission: "user_view" },
        {
          path: "/teacher/code-review",
          labelKey: "sidebar.codeReview",
          icon: ClipboardCheck,
          anyPermission: ["grade_edit", "repo_view_students", "lab_accept"],
        },
      ],
    },
    {
      titleKey: "sidebar.repositories",
      items: [
        { path: "/teacher/templates", labelKey: "sidebar.templateRepos", icon: FolderGit2, permission: "repo_view" },
        { path: "/teacher/activity", labelKey: "sidebar.studentActivity", icon: Activity, permission: "repo_view_students" },
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

function buildLaborantMenu(includePersonal: boolean): MenuSection[] {
  const sections: MenuSection[] = [
    { titleKey: "sidebar.main", items: [{ path: "/dashboard", labelKey: "sidebar.dashboard", icon: LayoutGrid }] },
    {
      titleKey: "sidebar.myCourses",
      items: [
        { path: "/teacher/courses", labelKey: "sidebar.allCourses", icon: BookOpen, permission: "assignment_view" },
        {
          path: "/teacher/code-review",
          labelKey: "sidebar.codeReview",
          icon: ClipboardCheck,
          anyPermission: ["grade_edit", "repo_view_students", "lab_accept"],
        },
      ],
    },
    {
      titleKey: "sidebar.students",
      items: [{ path: "/teacher/students", labelKey: "sidebar.allStudents", icon: GraduationCap, permission: "user_view" }],
    },
    {
      titleKey: "sidebar.repositories",
      items: [
        { path: "/teacher/student-repositories", labelKey: "sidebar.studentRepos", icon: FolderGit2, permission: "repo_view_students" },
        { path: "/teacher/activity", labelKey: "sidebar.studentActivity", icon: Activity, permission: "repo_view_students" },
      ],
    },
  ];
  if (includePersonal) {
    sections.push({
      titleKey: "sidebar.personal",
      items: [
        { path: "/repositories", labelKey: "sidebar.myReposPersonal", icon: FileText, permission: "repo_view" },
        { path: "/assignments", labelKey: "sidebar.myAssignmentsPersonal", icon: ClipboardList, permission: "assignment_view" },
        { path: "/deadlines", labelKey: "sidebar.deadlines", icon: Clock, permission: "assignment_view" },
      ],
    });
  }
  sections.push({
    titleKey: "sidebar.account",
    items: [
      { path: "/profile", labelKey: "sidebar.profile", icon: Users },
      { path: "/settings", labelKey: "sidebar.settings", icon: Settings },
    ],
  });
  return sections;
}

function buildStudentMenu(): MenuSection[] {
  return [
    { titleKey: "sidebar.main", items: [{ path: "/dashboard", labelKey: "sidebar.dashboard", icon: LayoutGrid }] },
    {
      titleKey: "sidebar.myRepositories",
      items: [
        { path: "/repositories", labelKey: "sidebar.allRepositories", icon: FileText, permission: "repo_view" },
        { path: "/repositories/forks", labelKey: "sidebar.forks", icon: GitFork, permission: "repo_view" },
      ],
    },
    {
      titleKey: "sidebar.study",
      items: [
        { path: "/courses", labelKey: "sidebar.myCoursesStudent", icon: BookOpen, permission: "assignment_view" },
        { path: "/assignments", labelKey: "sidebar.assignments", icon: ClipboardList, permission: "assignment_view" },
        { path: "/deadlines", labelKey: "sidebar.deadlines", icon: Clock, permission: "assignment_view" },
        { path: "/grades", labelKey: "sidebar.grades", icon: TrendingUp, permission: "assignment_view" },
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
  const location = useLocation();
  const { user } = useAuthUser();
  const { hasPermission, hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const userRole = (user?.role ?? null) as UserRole | null;
  const { pendingCount, setPendingCount } = usePendingCount();
  const studentNav = useStudentNavCountsOptional();
  const [hasSystemIssues, setHasSystemIssues] = useState(false);
  const [teacherPending, setTeacherPending] = useState(0);
  const [teacherCoursesCount, setTeacherCoursesCount] = useState(0);
  const { t } = useUserPreferences();
  const { mode, canSwitchLaborantMode } = useRoleMode();
  const theme = getTheme(isDarkTheme);

  useEffect(() => {
    if (userRole !== "student") return;
    void studentNav?.refreshSidebarCounts();
  }, [userRole, studentNav?.refreshSidebarCounts]);

  useEffect(() => {
    if (userRole !== "teacher" && userRole !== "laborant") return;
    let cancelled = false;
    void getTeacherDashboard()
      .then((d) => {
        if (!cancelled) {
          setTeacherPending(d.pending_grading);
          setTeacherCoursesCount(d.courses_count);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeacherPending(0);
          setTeacherCoursesCount(0);
        }
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
    if (path === "/courses?create=1") {
      return pathname === "/courses" && location.search === "?create=1";
    }
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

    // /admin/settings, /admin/monitoring и т.д. не должны подсвечивать дашборд
    if (path === "/admin") {
      return pathname === "/admin";
    }

    return pathname.startsWith(`${path}/`);
  };

  const menuSections = useMemo(() => {
    let sections: MenuSection[];
    if (userRole === "admin") sections = buildAdminMenu();
    else if (userRole === "teacher") {
      sections = buildTeacherMenu().map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.path === "/teacher/code-review" && teacherPending > 0) {
            return { ...item, badge: { text: String(teacherPending), variant: "red" as const } };
          }
          if (item.path === "/teacher/courses" && teacherCoursesCount > 0) {
            return { ...item, badge: { text: String(teacherCoursesCount), variant: "orange" as const } };
          }
          return item;
        }),
      }));
    } else if (userRole === "laborant") {
      if (canSwitchLaborantMode && mode === "student") {
        const sidebar = studentNav?.sidebar;
        sections = buildStudentMenu().map((section) => ({
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
      } else {
        sections = buildLaborantMenu(canSwitchLaborantMode).map((section) => ({
          ...section,
          items: section.items.map((item) => {
            if (item.path === "/teacher/code-review" && teacherPending > 0) {
              return { ...item, badge: { text: String(teacherPending), variant: "red" as const } };
            }
            if (item.path === "/teacher/courses" && teacherCoursesCount > 0) {
              return { ...item, badge: { text: String(teacherCoursesCount), variant: "orange" as const } };
            }
            return item;
          }),
        }));
      }
    } else if (userRole === "student") {
    const sidebar = studentNav?.sidebar;
    sections = buildStudentMenu().map((section) => ({
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
    } else {
      sections = [];
    }
    return filterMenuSections(sections, hasPermission, hasAnyPermission);
  }, [userRole, mode, canSwitchLaborantMode, studentNav?.sidebar, teacherPending, teacherCoursesCount, hasPermission, hasAnyPermission]);

  const isTeacherLike = userRole === "teacher" || userRole === "laborant";
  const isLaborant = userRole === "laborant";

  // While loading, show nothing or student menu to avoid flashing admin menu
  if (userRole === null || permissionsLoading) {
    console.log("[Sidebar] Role is null, showing loading state");
    return (
      <aside className={`w-[260px] flex-shrink-0 h-full border-r`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
        <div className={`p-4 text-sm`} style={{ color: theme.text2 }}>{t("common.loading")}</div>
      </aside>
    );
  }

  console.log("[Sidebar] Rendering menu for role:", userRole, "sections count:", menuSections.length);

  return (
    <aside
      className="w-[260px] flex-shrink-0 h-full border-r"
      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
    >
      <nav className={isTeacherLike ? "p-4" : "p-4"}>
        {menuSections.map((section) => (
          <div key={section.titleKey} className={isTeacherLike ? "mb-6" : "mb-6"}>
            <h3
              className={
                isTeacherLike
                  ? "text-xs font-semibold uppercase tracking-wider mb-2 px-3"
                  : "text-xs font-semibold uppercase tracking-wider mb-2 px-3"
              }
              style={{ color: isTeacherLike && !isLaborant ? theme.text3 : theme.text2 }}
            >
              {t(section.titleKey)}
            </h3>
            <ul className={isTeacherLike ? "space-y-1" : "space-y-1"}>
              {section.items.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                const linkTo = item.path === "/courses?create=1" ? "/courses?create=1" : item.path;
                return (
                  <li key={item.path}>
                    <Link
                      to={linkTo}
                      className={
                        isTeacherLike
                          ? "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                          : `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                              active ? "border-l-2 border-blue-500" : ""
                            }`
                      }
                      style={
                        isTeacherLike
                          ? isLaborant
                            ? {
                                backgroundColor: active ? theme.hoverBg : "transparent",
                                color: active ? theme.accent : theme.text2,
                                fontWeight: active ? 500 : 400,
                              }
                            : {
                              backgroundColor: active ? "rgba(124,58,237,0.12)" : "transparent",
                              color: active ? "#a78bfa" : theme.text2,
                              fontWeight: active ? 500 : 400,
                            }
                          : {
                              backgroundColor: active ? theme.hoverBg : "transparent",
                              color: active ? theme.accent : theme.text2,
                            }
                      }
                    >
                      <div className={`flex items-center ${isTeacherLike ? "gap-3" : "gap-3"}`}>
                        <Icon
                          className="h-5 w-5 shrink-0"
                          style={
                            isTeacherLike
                              ? isLaborant
                                ? { color: active ? theme.accent : theme.text3 }
                                : { color: active ? "#a78bfa" : theme.text3 }
                              : { color: active ? theme.accent : theme.text3 }
                          }
                        />
                        <span>{t(item.labelKey)}</span>
                      </div>
                      {item.path === "/users" && pendingCount > 0 && (
                        <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                          {pendingCount}
                        </span>
                      )}
                      {item.path !== "/users" && item.badge && isTeacherLike ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                          style={
                            item.badge.variant === "red"
                              ? { backgroundColor: "rgba(226,75,74,0.15)", color: theme.danger }
                              : { backgroundColor: "rgba(245,158,11,0.15)", color: theme.warning }
                          }
                        >
                          {item.badge.text}
                        </span>
                      ) : null}
                      {item.path !== "/users" && item.badge && !isTeacherLike ? (
                        <span
                          className={`flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-semibold ${
                            item.badge.variant === "red"
                              ? "bg-red-500 text-white"
                              : "bg-orange-500 text-white"
                          }`}
                        >
                          {item.badge.text}
                        </span>
                      ) : null}
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
