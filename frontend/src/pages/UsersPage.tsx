import { useState, useEffect, useRef, useMemo } from "react";
import {
  Download,
  Upload,
  Plus,
  Search,
  Users,
  CheckCircle,
  Briefcase,
  Trash2,
  Eye,
  Edit,
  Lock,
  Unlock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import {
  getAdminUsers,
  patchAdminUser,
  approveUser,
  rejectUser,
  resetAdminUserPassword,
  getGroups,
  exportUsersCSV,
  importUsersCSV,
} from "../api/adminApi";
import { getMe } from "../api/authApi";
import { usePermissions } from "../hooks/usePermissions";
import { usePendingCount } from "../context/PendingCountContext";
import type { AdminUserRead, UserRole, UserRead } from "../api/types";
import AdminPageHeader from "../components/AdminPageHeader";
import { getTheme } from "../theme";
import { tr } from "../utils/i18nLabels";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { pluralWord } from "../i18n/plural";

interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  group: string;
  group_name: string | null;
  student_id: string | null;
  role: "student" | "teacher" | "admin" | "laborant";
  status: "active" | "pending" | "blocked";
  repos: number;
  lastLogin: string;
  avatar_url: string | null;
}

function getRoleBadge(role: User["role"], isDarkTheme: boolean) {
  const styles = {
    student: isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700",
    teacher: isDarkTheme ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-700",
    admin: isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700",
    laborant: isDarkTheme ? "bg-pink-500/20 text-pink-400" : "bg-pink-100 text-pink-700",
  };
  const labels = {
    student: tr("admin.users.roleShortStudent"),
    teacher: tr("admin.users.roleShortTeacher"),
    admin: tr("admin.users.roleShortAdmin"),
    laborant: tr("admin.users.roleShortLaborant"),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[role]}`}>
      {labels[role]}
    </span>
  );
}

function getStatusBadge(status: User["status"], isDarkTheme: boolean) {
  const styles = {
    active: isDarkTheme ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-700",
    pending: isDarkTheme ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700",
    blocked: isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700",
  };
  const labels = {
    active: tr("admin.dashboard.statusActive"),
    pending: tr("admin.dashboard.statusPending"),
    blocked: tr("admin.dashboard.statusBlocked"),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

interface UsersPageProps {
  isDarkTheme?: boolean;
}

export default function UsersPage({ isDarkTheme = false }: UsersPageProps) {
  const { t, tp, language } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { hasPermission } = usePermissions();

  // Search with debounce
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.toLowerCase());
      setCurrentPage(1);
      setSelectedUsers([]); // Reset selection on search change
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);

  // Toast notification
  const [toast, setToast] = useState<{message: string; type: 'error' | 'success'} | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Current user (for self-protection)
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);

  // Modals state
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);

  useEffect(() => {
    getMe().then(setCurrentUser).catch(() => null);
  }, []);
  const [editForm, setEditForm] = useState<{
    role: UserRole;
    group_name: string;
    student_id: string;
  }>({
    role: "student",
    group_name: "",
    student_id: "",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [showPerPageDropdown, setShowPerPageDropdown] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pluralizeRecords = (count: number): string =>
    pluralWord(language, "admin.users.records", count);
  const perPageRef = useRef<HTMLDivElement>(null);

  // Role filter
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // Group filter
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  // Close perPage dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (perPageRef.current && !perPageRef.current.contains(event.target as Node)) {
        setShowPerPageDropdown(false);
      }
      if (roleRef.current && !roleRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (groupRef.current && !groupRef.current.contains(event.target as Node)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load groups on mount
  useEffect(() => {
    getGroups().then(setAvailableGroups).catch(() => []);
  }, []);

  const handleBlockToggle = async (user: User) => {
    if (user.role === "admin") {
      showToast(t("admin.users.cannotChangeAdminStatus"), "error");
      return;
    }
    setActionLoading(true);
    try {
      const currentlyBlocked = user.status === "blocked";
      await patchAdminUser(user.id, {
        role: user.role,
        is_blocked: !currentlyBlocked,
        is_pending: user.status === "pending",
      });
      const res = await getAdminUsers();
      updateUsers(res);
      showToast(currentlyBlocked ? t("admin.users.unblocked") : t("admin.users.blocked"), "success");
    } catch {
      showToast(t("admin.users.statusChangeError"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const { decrementPending } = usePendingCount();

  const editGroupOptions = useMemo(() => {
    const names = new Set(availableGroups);
    const current = editForm.group_name.trim();
    if (current) names.add(current);
    if (editUser?.group_name?.trim()) names.add(editUser.group_name.trim());
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }, [availableGroups, editForm.group_name, editUser]);

  const handleApprove = async (user: User) => {
    if (user.role === "admin") {
      showToast(t("admin.users.cannotConfirmAdmin"), "error");
      return;
    }
    setActionLoading(true);
    try {
      await approveUser(user.id);
      // Уменьшаем счётчик в сайдбаре сразу после успешного подтверждения
      decrementPending();
      const res = await getAdminUsers();
      updateUsers(res);
      showToast(t("admin.users.confirmed"), "success");
    } catch {
      showToast(t("admin.users.confirmError"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (user: User) => {
    if (user.role === "admin") {
      showToast(t("admin.users.cannotConfirmAdmin"), "error");
      return;
    }
    if (!window.confirm(tp("admin.users.rejectConfirm", { name: user.name }))) return;
    setActionLoading(true);
    try {
      await rejectUser(user.id);
      decrementPending();
      const res = await getAdminUsers();
      updateUsers(res);
      showToast(t("admin.users.rejected"), "success");
    } catch {
      showToast(t("admin.users.rejectError"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditUser(user);
    const groupName = user.group_name?.trim() ?? (user.group === "—" ? "" : user.group.trim());
    setEditForm({
      role: user.role,
      group_name: groupName,
      student_id: user.student_id ?? "",
    });
    void getGroups()
      .then((groups) => {
        setAvailableGroups((prev) => {
          const merged = new Set([...prev, ...groups]);
          if (groupName) merged.add(groupName);
          return Array.from(merged).sort((a, b) => a.localeCompare(b, "ru"));
        });
      })
      .catch(() => {
        if (groupName) {
          setAvailableGroups((prev) =>
            prev.includes(groupName) ? prev : [...prev, groupName].sort((a, b) => a.localeCompare(b, "ru")),
          );
        }
      });
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    if (editUser.role === "admin") {
      showToast(t("admin.users.cannotEditAdmin"), "error");
      return;
    }
    setActionLoading(true);
    try {
      await patchAdminUser(editUser.id, {
        role: editForm.role,
        is_blocked: editUser.status === "blocked",
        is_pending: editUser.status === "pending",
        group_name: editForm.group_name.trim() || null,
        student_id: editForm.student_id.trim() || null,
      });
      setEditUser(null);
      const res = await getAdminUsers();
      updateUsers(res);
      showToast(t("admin.users.saved"), "success");
    } catch {
      showToast(t("admin.users.saveError"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const updateUsers = (res: AdminUserRead[]) => {
    setUsers(
      res.map((u) => ({
        id: u.id,
        name: u.full_name,
        email: u.email,
        group: u.group_name || "—",
        group_name: u.group_name ?? null,
        student_id: u.student_id ?? null,
        role: u.role,
        status: u.is_blocked
          ? "blocked"
          : u.is_pending
          ? "pending"
          : "active",
        repos: u.repositories_count ?? 0,
        lastLogin: u.last_login
          ? new Date(u.last_login).toLocaleDateString()
          : "—",
        initials: u.full_name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase(),
        color: "bg-blue-500",
        avatar_url: u.avatar_url || null,
      }))
    );
    setTotalUsers(res.length);
  };

useEffect(() => {
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAdminUsers();
      setUsers(
        res.map((u) => ({
          id: u.id,
          name: u.full_name,
          email: u.email,
          group: u.group_name || "—",
          group_name: u.group_name ?? null,
          student_id: u.student_id ?? null,
          role: u.role,
          status: u.is_blocked
            ? "blocked"
            : u.is_pending
            ? "pending"
            : "active",
          repos: u.repositories_count ?? 0,
          lastLogin: u.last_login
            ? new Date(u.last_login).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",

          initials: u.full_name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase(),

          color: "bg-blue-500",
          avatar_url: u.avatar_url || null,
        }))
      );

      setTotalUsers(res.length);

    } catch {
      setError(t("admin.users.loadError"));
    } finally {
      setLoading(false);
    }
  };
    fetchUsers();
  }, []);



  const stats = [
    {
      label: t("admin.users.statTotal"),
      value: totalUsers,
      color: isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900",
    },
    {
      label: t("admin.users.statActive"),
      value: users.filter(u => u.status === "active").length,
      color: isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900",
    },
    {
      label: t("admin.users.statPending"),
      value: users.filter(u => u.status === "pending").length,
      color: isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900",
    },
    {
      label: t("admin.users.statBlocked"),
      value: users.filter(u => u.status === "blocked").length,
      color: "text-red-400",
    },
  ];

  const toggleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map((u) => u.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter((uid) => uid !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  // Apply filters and search (cumulative)
  const filteredUsers = users.filter((user) => {
    // Role filter
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    // Status filter
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    // Group filter
    if (groupFilter !== "all" && user.group !== groupFilter) return false;
    // Search filter (ФИО and Email, case-insensitive)
    if (debouncedSearch) {
      const searchLower = debouncedSearch;
      const nameMatch = user.name.toLowerCase().includes(searchLower);
      const emailMatch = user.email.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch) return false;
    }
    return true;
  });

  // Reset selection when filters change
  useEffect(() => {
    setSelectedUsers([]);
  }, [roleFilter, statusFilter, groupFilter, debouncedSearch]);

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setGroupFilter("all");
    setCurrentPage(1);
    setSelectedUsers([]);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportUsersCSV();
      showToast(t("admin.users.exportSuccess"), "success");
    } catch {
      showToast(t("admin.users.exportError"), "error");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importUsersCSV(file);
      const res = await getAdminUsers();
      updateUsers(res);
      
      if (result.errors.length > 0) {
        showToast(tp("admin.users.importResult", { imported: result.imported, errors: result.errors.length }), "error");
      } else {
        showToast(tp("admin.users.importSuccess", { n: result.imported }), "success");
      }
    } catch {
      showToast(t("admin.users.importError"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Theme-based colors
  const pageBgStyle = isDarkTheme ? { backgroundColor: "#0f0f10" } : { backgroundColor: "#f8fafc" };
  const textPrimary = isDarkTheme ? "text-white" : "text-slate-900";
  const cardBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-slate-100 border-slate-200 shadow-sm";
  const cardHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-200";
  const textSecondary = isDarkTheme ? "text-gray-400" : "text-slate-500";
  const textTertiary = isDarkTheme ? "text-gray-300" : "text-slate-400";
  const headerBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-slate-100 border-slate-200";
  const inputBg = isDarkTheme ? "bg-[#252525] border-[#3d3d3d]" : "bg-slate-200 border-slate-300";
  const dividerColor = isDarkTheme ? "divide-[#2d2d2d]" : "divide-slate-200";
  const tableHover = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-slate-100";
  // Table specific colors
  const tableBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-slate-100";
  const tableBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-slate-200";
  const tableHeaderText = isDarkTheme ? "text-[#6e7681]" : "text-slate-400";
  const tableRowBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-slate-200";
  const tableRowHover = isDarkTheme ? "hover:bg-[#1f2937]" : "hover:bg-slate-200";
  const tableCellText = isDarkTheme ? "text-[#8b949e]" : "text-slate-500";
  const tableNameText = isDarkTheme ? "text-[#ccd0d4]" : "text-slate-900";
  const tableEmailText = isDarkTheme ? "text-[#6e7681]" : "text-slate-400";
  const checkboxBorder = isDarkTheme ? "border-[#484f58]" : "border-gray-400";
  const checkboxHoverBorder = isDarkTheme ? "hover:border-[#6e7681]" : "hover:border-gray-500";
  const iconBg = isDarkTheme ? "bg-[#1f2937]" : "bg-gray-200";
  const iconColor = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const actionBtnHover = isDarkTheme ? "hover:bg-[#30363d] hover:text-[#ccd0d4]" : "hover:bg-gray-300 hover:text-gray-900";
  const actionBtnColor = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  // Modal colors
  const modalBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-slate-100";
  const modalBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-gray-200";
  const modalText = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const modalLabel = isDarkTheme ? "text-[#8b949e]" : "text-gray-600";
  const modalInputBg = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d]" : "bg-gray-100 border-gray-300";
  const modalCardBg = isDarkTheme ? "bg-[#0d0d0d]" : "bg-gray-200";
  const modalBtnHover = isDarkTheme ? "hover:bg-[#30363d]" : "hover:bg-gray-300";
  const modalBtnText = isDarkTheme ? "text-[#6e7681]" : "text-gray-600";
  // Pagination colors
  const paginationBtn = isDarkTheme ? "bg-[#0f0f10] border-[#30363d] text-[#8b949e] hover:text-[#ccd0d4]" : "bg-slate-100 border-gray-300 text-gray-600 hover:text-gray-900";
  const paginationDropdown = isDarkTheme ? "bg-[#0d0d0d] border-[#30363d] text-[#ccd0d4]" : "bg-gray-100 border-gray-300 text-gray-700";
  const paginationDropdownBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d]" : "bg-slate-100 border-gray-200";
  const paginationDropdownItem = isDarkTheme ? "text-[#8b949e] hover:bg-[#1f2937]" : "text-gray-600 hover:bg-gray-200";

  return (
    <div className={`h-full overflow-y-auto ${textPrimary} transition-colors`}>
      <div className="max-w-7xl mx-auto py-6 px-6 pr-2 space-y-6 pb-20">
        {/* Header */}
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.users.title")}
          subtitle={filteredUsers.length === totalUsers 
            ? `${totalUsers} ${pluralizeRecords(totalUsers)}` 
            : tp("admin.users.foundOf", { found: filteredUsers.length, total: totalUsers })}
          actions={
            <>
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm ${cardBg} ${cardHover} ${exporting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Download className="h-4 w-4" />
                {exporting ? t("admin.users.exporting") : t("admin.users.exportCsv")}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm ${cardBg} ${cardHover} ${importing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Upload className="h-4 w-4" />
                {importing ? t("admin.users.importing") : t("admin.users.import")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImport}
                style={{ display: "none" }}
              />
              <button className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm ${isDarkTheme ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                <Plus className="h-4 w-4" />
                {t("admin.users.addUser")}
              </button>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className={`${tableBg} rounded-xl p-5 border ${tableBorder}`}>
              <p className={`text-sm ${tableHeaderText} mb-1`}>{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className={`${tableBg} rounded-xl p-4 border ${tableBorder} flex items-center gap-3`}>
          <div className="relative" ref={roleRef}>
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className={`flex items-center gap-2 px-3 py-2 ${modalInputBg} rounded-lg text-sm ${tableCellText} ${tableNameText} transition-colors`}
            >
              <Users className="h-4 w-4" />
              {roleFilter === "all" ? t("admin.users.filterAllRoles") : roleFilter === "admin" ? t("admin.users.roleShortAdmin") : roleFilter === "teacher" ? t("admin.users.roleShortTeacher") : roleFilter === "laborant" ? t("admin.users.roleShortLaborant") : t("admin.users.roleShortStudent")}
              <ChevronDown className={`h-3 w-3 transition-transform ${showRoleDropdown ? "rotate-180" : ""}`} />
            </button>
            {showRoleDropdown && (
              <div className={`absolute top-full left-0 mt-1.5 w-36 ${tableBg} border ${tableBorder} rounded-xl shadow-xl z-50 overflow-hidden`}>
                {[
                  { value: "all", label: t("admin.users.filterAllRoles") },
                  { value: "admin", label: t("admin.users.roleAdminFull") },
                  { value: "teacher", label: t("admin.users.roleTeacherFull") },
                  { value: "laborant", label: t("admin.users.roleLaborantFull") },
                  { value: "student", label: t("admin.users.roleStudentFull") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setRoleFilter(opt.value); setShowRoleDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                      roleFilter === opt.value
                        ? (isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700")
                        : `${tableCellText} ${tableRowHover}`
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className={`flex items-center gap-2 px-3 py-2 ${modalInputBg} rounded-lg text-sm ${tableCellText} ${tableNameText} transition-colors`}
            >
              <CheckCircle className="h-4 w-4" />
              {statusFilter === "all" ? t("admin.users.filterAllStatuses") : statusFilter === "active" ? t("admin.dashboard.statusActive") : statusFilter === "pending" ? t("admin.dashboard.statusPending") : t("admin.dashboard.statusBlocked")}
              <ChevronDown className={`h-3 w-3 transition-transform ${showStatusDropdown ? "rotate-180" : ""}`} />
            </button>
            {showStatusDropdown && (
              <div className={`absolute top-full left-0 mt-1.5 w-36 ${tableBg} border ${tableBorder} rounded-xl shadow-xl z-50 overflow-hidden`}>
                {[
                  { value: "all", label: t("admin.users.filterAllStatuses") },
                  { value: "active", label: t("admin.dashboard.statusActive") },
                  { value: "pending", label: t("admin.dashboard.statusPending") },
                  { value: "blocked", label: t("admin.dashboard.statusBlocked") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setShowStatusDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                      statusFilter === opt.value
                        ? (isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700")
                        : `${tableCellText} ${tableRowHover}`
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={groupRef}>
            <button
              onClick={() => setShowGroupDropdown(!showGroupDropdown)}
              className={`flex items-center gap-2 px-3 py-2 ${modalInputBg} rounded-lg text-sm ${tableCellText} ${tableNameText} transition-colors`}
            >
              <Briefcase className="h-4 w-4" />
              {groupFilter === "all" ? t("admin.users.filterAllGroups") : groupFilter}
              <ChevronDown className={`h-3 w-3 transition-transform ${showGroupDropdown ? "rotate-180" : ""}`} />
            </button>
            {showGroupDropdown && (
              <div className={`absolute top-full left-0 mt-1.5 min-w-[160px] max-w-[200px] ${tableBg} border ${tableBorder} rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto`}>
                <button
                  onClick={() => { setGroupFilter("all"); setShowGroupDropdown(false); }}
                  className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                    groupFilter === "all"
                      ? (isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700")
                      : `${tableCellText} ${tableRowHover}`
                  }`}
                >
                  {t("admin.users.filterAllGroups")}
                </button>
                {availableGroups.map((group) => (
                  <button
                    key={group}
                    onClick={() => { setGroupFilter(group); setShowGroupDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors truncate ${
                      groupFilter === group
                        ? (isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700")
                        : `${tableCellText} ${tableRowHover}`
                    }`}
                  >
                    {group}
                  </button>
                ))}
                {availableGroups.length === 0 && (
                  <div className={`px-4 py-2.5 text-sm ${tableHeaderText}`}>{t("admin.users.noGroups")}</div>
                )}
              </div>
            )}
          </div>
          {selectedUsers.length > 0 && (
            <button className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 hover:bg-red-500/20 transition-colors ml-auto">
              <Trash2 className="h-4 w-4" />
              {tp("admin.users.deleteSelected", { n: selectedUsers.length })}
            </button>
          )}
        </div>

        {/* Users Table */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className={`${tableBg} rounded-xl border ${tableBorder} overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${tableRowBorder}`}>
                <th className="px-4 py-3 text-left">
                  <div
                    onClick={toggleSelectAll}
                    className={`w-[18px] h-[18px] rounded-[4px] border-[1.5px] flex items-center justify-center cursor-pointer transition-colors ${
                      selectedUsers.length === users.length && users.length > 0
                        ? "bg-blue-500 border-blue-500"
                        : `bg-transparent ${checkboxBorder} ${checkboxHoverBorder}`
                    }`}
                  >
                    {selectedUsers.length === users.length && users.length > 0 && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colUser")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colGroup")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colRole")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colStatus")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colRepos")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colLastLogin")}</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${tableHeaderText}`}>{t("admin.users.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className={`p-4 rounded-full ${iconBg}`}>
                        <Search className={`h-8 w-8 ${iconColor}`} />
                      </div>
                      <p className={tableCellText}>{t("admin.users.notFound")}</p>
                      {(roleFilter !== "all" || statusFilter !== "all" || groupFilter !== "all" || debouncedSearch) && (
                        <button
                          onClick={clearFilters}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                        >
                          {t("admin.users.resetFilters")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className={`border-b ${tableRowBorder} last:border-b-0 ${tableRowHover} transition-colors`}>
                  <td className="px-4 py-3">
                    <div
                      onClick={() => toggleSelectUser(user.id)}
                      className={`w-[18px] h-[18px] rounded-[4px] border-[1.5px] flex items-center justify-center cursor-pointer transition-colors ${
                        selectedUsers.includes(user.id)
                          ? "bg-blue-500 border-blue-500"
                          : `bg-transparent ${checkboxBorder} ${checkboxHoverBorder}`
                      }`}
                    >
                      {selectedUsers.includes(user.id) && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.initials}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`h-9 w-9 rounded-full ${user.color} flex items-center justify-center text-sm font-medium text-white`}>
                          {user.initials}
                        </div>
                      )}
                      <div>
                        <p className={`text-sm font-medium ${tableNameText}`}>{user.name}</p>
                        <p className={`text-xs ${tableEmailText}`}>{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-sm ${tableCellText}`}>{user.group}</td>
                  <td className="px-4 py-3">{getRoleBadge(user.role, isDarkTheme)}</td>
                  <td className="px-4 py-3">{getStatusBadge(user.status, isDarkTheme)}</td>
                  <td className={`px-4 py-3 text-sm ${tableCellText}`}>{user.repos} {t("admin.users.reposCount").replace("{n}", String(user.repos))}</td>
                  <td className={`px-4 py-3 text-sm ${tableCellText}`}>{user.lastLogin}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewUser(user)}
                        disabled={actionLoading}
                        className={`p-1.5 rounded-lg ${actionBtnHover} ${actionBtnColor} transition-colors`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {hasPermission("user_edit") && (
                        <button
                          onClick={() => handleEdit(user)}
                          disabled={actionLoading || user.role === "admin"}
                          title={user.role === "admin" ? t("admin.users.noPermission") : ""}
                          className={`p-1.5 rounded-lg ${actionBtnHover} ${actionBtnColor} transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      {user.status === "blocked" ? (
                        <button
                          onClick={() => handleBlockToggle(user)}
                          disabled={actionLoading || user.role === "admin"}
                          title={user.role === "admin" ? t("admin.users.noPermission") : ""}
                          className={`p-1.5 rounded-lg ${actionBtnHover} ${actionBtnColor} transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          <Unlock className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBlockToggle(user)}
                          disabled={actionLoading || user.role === "admin"}
                          title={user.role === "admin" ? t("admin.users.noPermission") : ""}
                          className={`p-1.5 rounded-lg ${actionBtnHover} ${actionBtnColor} transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      )}
                      {user.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(user)}
                            disabled={actionLoading || user.role === "admin"}
                            title={user.role === "admin" ? t("admin.users.noPermission") : t("admin.users.confirmed")}
                            className={`p-1.5 rounded-lg ${isDarkTheme ? "hover:bg-green-500/20" : "hover:bg-green-100"} ${actionBtnColor} hover:text-green-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void handleReject(user)}
                            disabled={actionLoading || user.role === "admin"}
                            title={user.role === "admin" ? t("admin.users.noPermission") : t("admin.users.reject")}
                            className={`p-1.5 rounded-lg ${isDarkTheme ? "hover:bg-red-500/20" : "hover:bg-red-100"} ${actionBtnColor} hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all ${
            toast.type === 'error' 
              ? 'bg-red-500 text-white' 
              : 'bg-green-500 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        )}

        {/* Pagination */}
        {(() => {
          const totalPages = Math.ceil(totalUsers / itemsPerPage) || 1;

          // Generate page numbers to show
          const getPageNumbers = () => {
            if (totalPages <= 5) {
              return Array.from({ length: totalPages }, (_, i) => i + 1);
            }
            // For many pages, show: 1, 2, 3, ..., last
            return [1, 2, 3, -1, totalPages]; // -1 represents ellipsis
          };

          const pageNumbers = getPageNumbers();

          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`text-sm ${tableHeaderText}`}>
                  {tp("admin.users.shownOf", { shown: filteredUsers.length, total: totalUsers })}
                  {roleFilter !== "all" || statusFilter !== "all" || groupFilter !== "all" ? t("admin.users.filtered") : ""}
                </span>
                <div className="flex items-center gap-2" ref={perPageRef}>
                  <span className={`text-sm ${tableHeaderText}`}>{t("admin.users.perPage")}</span>
                  <div className="relative">
                    <button
                      onClick={() => setShowPerPageDropdown(!showPerPageDropdown)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${paginationDropdown} ${isDarkTheme ? "hover:bg-[#0f0f10]" : "hover:bg-gray-200"}`}
                    >
                      {itemsPerPage}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPerPageDropdown ? "rotate-180" : ""}`} />
                    </button>
                    {showPerPageDropdown && (
                      <div className={`absolute top-full left-0 mt-1.5 w-20 rounded-xl shadow-xl z-50 overflow-hidden ${paginationDropdownBg}`}>
                        {[10, 25, 50].map((val) => (
                          <button
                            key={val}
                            onClick={() => {
                              setItemsPerPage(val);
                              setCurrentPage(1);
                              setShowPerPageDropdown(false);
                            }}
                            className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                              itemsPerPage === val
                                ? (isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700")
                                : paginationDropdownItem
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${tableHeaderText}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("admin.users.searchPlaceholder")}
                    className={`w-48 pl-10 pr-8 py-1.5 ${modalInputBg} rounded-lg text-sm ${tableNameText} placeholder-${tableHeaderText} focus:outline-none focus:border-[#484f58] transition-colors`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${modalBtnHover} rounded-full transition-colors`}
                    >
                      <X className={`h-3 w-3 ${tableHeaderText}`} />
                    </button>
                  )}
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${paginationBtn}`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {pageNumbers.map((page, idx) => (
                    page === -1 ? (
                      <span key={`ellipsis-${idx}`} className={`px-2 ${tableHeaderText}`}>...</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? "bg-blue-600 text-white"
                            : paginationBtn
                        }`}
                      >
                        {page}
                      </button>
                    )
                  ))}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className={`p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${paginationBtn}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* View User Modal */}
      {viewUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className={`${modalBg} border ${modalBorder} rounded-xl p-6 max-w-md w-full mx-4`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${modalText}`}>{t("admin.users.profileModal")}</h3>
              <button onClick={() => setViewUser(null)} className={`p-1 ${modalBtnHover} rounded ${modalBtnText}`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-12 w-12 rounded-full ${viewUser.color} flex items-center justify-center text-sm font-medium text-white`}>
                  {viewUser.initials}
                </div>
                <div>
                  <p className={`font-medium ${modalText}`}>{viewUser.name}</p>
                  <p className={`text-sm ${modalBtnText}`}>{viewUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`${modalCardBg} p-3 rounded-lg`}>
                  <p className={modalBtnText}>{t("admin.users.fieldRole")}</p>
                  <p className={`font-medium ${modalText}`}>
                    {viewUser.role === "admin" ? t("admin.users.roleAdminFull") :
                     viewUser.role === "teacher" ? t("admin.users.roleTeacherFull") :
                     viewUser.role === "laborant" ? t("admin.users.roleLaborantFull") : t("admin.users.roleStudentFull")}
                  </p>
                </div>
                <div className={`${modalCardBg} p-3 rounded-lg`}>
                  <p className={modalBtnText}>{t("admin.users.fieldGroup")}</p>
                  <p className={`font-medium ${modalText}`}>{viewUser.group}</p>
                </div>
                <div className={`${modalCardBg} p-3 rounded-lg`}>
                  <p className={modalBtnText}>{t("admin.users.colStatus")}</p>
                  <p className={`font-medium ${modalText}`}>
                    {viewUser.status === "active" ? t("admin.dashboard.statusActive") :
                     viewUser.status === "blocked" ? t("admin.dashboard.statusBlocked") : t("admin.dashboard.statusPending")}
                  </p>
                </div>
                <div className={`${modalCardBg} p-3 rounded-lg`}>
                  <p className={modalBtnText}>{t("admin.users.colLastLogin")}</p>
                  <p className={`font-medium ${modalText}`}>{viewUser.lastLogin}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className={`${modalBg} border ${modalBorder} rounded-xl p-6 max-w-md w-full mx-4`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${modalText}`}>{t("admin.users.editModal")}</h3>
              <button onClick={() => setEditUser(null)} className={`p-1 ${modalBtnHover} rounded ${modalBtnText}`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${modalLabel}`}>{t("admin.users.fieldRole")}</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  className={`w-full px-3 py-2 rounded-lg ${modalInputBg} ${modalText}`}
                >
                  <option value="student">{t("admin.users.roleStudentFull")}</option>
                  <option value="teacher">{t("admin.users.roleTeacherFull")}</option>
                  <option value="laborant">{t("admin.users.roleLaborantFull")}</option>
                  <option value="admin">{t("admin.users.roleAdminFull")}</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${modalLabel}`}>{t("admin.users.fieldGroup")}</label>
                <select
                  value={editForm.group_name}
                  onChange={(e) => setEditForm({ ...editForm, group_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg ${modalInputBg} ${modalText}`}
                >
                  <option value="">{t("admin.users.groupNotSelected")}</option>
                  {editGroupOptions.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
              {editForm.student_id ? (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${modalLabel}`}>ID</label>
                  <p className={`text-sm ${modalText}`}>{editForm.student_id}</p>
                </div>
              ) : null}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditUser(null)}
                  className={`flex-1 px-4 py-2 border rounded-lg ${isDarkTheme ? "border-[#30363d] hover:bg-[#1f2937]" : "border-gray-300 hover:bg-gray-100"} ${modalLabel}`}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading ? t("admin.users.saving") : t("admin.users.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
