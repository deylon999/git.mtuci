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
} from "lucide-react";
import { getMe } from "../api/authApi";
import { getUserStats, getSystemMetrics, getServiceStatus } from "../api/adminApi";
import { usePendingCount } from "../context/PendingCountContext";
import { useStudentNavCountsOptional } from "../context/StudentNavCountsContext";
import { getTheme } from "../theme";
import type { UserRole } from "../api/types";

interface MenuItem {
  path: string;
  label: string;
  icon: React.ElementType;
  badge?: {
    text: string;
    variant: "red" | "orange";
  };
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface SidebarProps {
  isDarkTheme?: boolean;
}

const adminMenuSections: MenuSection[] = [
  {
    title: "ОБЗОР",
    items: [
      { path: "/admin", label: "Дашборд", icon: LayoutGrid },
    ],
  },
  {
    title: "ПОЛЬЗОВАТЕЛИ",
    items: [
      { path: "/users", label: "Все пользователи", icon: Users },
      { path: "/roles", label: "Роли и доступ", icon: Briefcase },
    ],
  },
  {
    title: "РЕПОЗИТОРИИ",
    items: [
      { path: "/repositories", label: "Все репозитории", icon: FileText },
      { path: "/admin/forks", label: "Форки и клоны", icon: GitFork },
      { path: "/admin/activity", label: "Активность", icon: TrendingUp },
    ],
  },
  {
    title: "СИСТЕМА",
    items: [
      { path: "/logs", label: "Логи", icon: FileCode },
      { path: "/admin/monitoring", label: "Мониторинг", icon: Clock },
      { path: "/admin/settings", label: "Настройки", icon: Settings },
    ],
  },
];

const studentMenuSections: MenuSection[] = [
  {
    title: "ГЛАВНОЕ",
    items: [{ path: "/dashboard", label: "Дашборд", icon: LayoutGrid }],
  },
  {
    title: "МОИ РЕПОЗИТОРИИ",
    items: [
      { path: "/repositories", label: "Все репозитории", icon: FileText },
      { path: "/repositories/new", label: "Создать репо", icon: FolderPlus },
      { path: "/repositories/forks", label: "Форки", icon: GitFork },
    ],
  },
  {
    title: "УЧЁБА",
    items: [
      { path: "/courses", label: "Мои курсы", icon: BookOpen },
      { path: "/assignments", label: "Задания", icon: ClipboardList },
      { path: "/deadlines", label: "Дедлайны", icon: Clock },
      { path: "/grades", label: "Оценки", icon: TrendingUp },
    ],
  },
  {
    title: "АККАУНТ",
    items: [
      { path: "/profile", label: "Профиль", icon: Users },
      { path: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

export default function Sidebar({ isDarkTheme = true }: SidebarProps) {
  console.log("[Sidebar] Component rendering");
  const location = useLocation();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { pendingCount, setPendingCount } = usePendingCount();
  const studentNav = useStudentNavCountsOptional();
  const [hasSystemIssues, setHasSystemIssues] = useState(false);
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

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const menuSections = useMemo(() => {
    if (userRole === "admin") return adminMenuSections;
    if (userRole !== "student") return studentMenuSections;
    const sidebar = studentNav?.sidebar;
    return studentMenuSections.map((section) => ({
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
  }, [userRole, studentNav?.sidebar]);

  // While loading, show nothing or student menu to avoid flashing admin menu
  if (userRole === null) {
    console.log("[Sidebar] Role is null, showing loading state");
    return (
      <aside className={`w-[260px] flex-shrink-0 h-full border-r`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
        <div className={`p-4 text-sm`} style={{ color: theme.text2 }}>Loading...</div>
      </aside>
    );
  }

  console.log("[Sidebar] Rendering menu for role:", userRole, "sections count:", menuSections.length);

  return (
    <aside className={`w-[260px] flex-shrink-0 h-full border-r`} style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
      <nav className="p-4">
        {menuSections.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-3`} style={{ color: theme.text2 }}>
              {section.title}
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
                        <span>{item.label}</span>
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
                      {item.label === "Мониторинг" && hasSystemIssues && (
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
