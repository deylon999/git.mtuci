import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Briefcase,
  User,
  UserPlus,
  Microscope,
  RotateCcw,
  Save,
  GitBranch,
  Users,
  GraduationCap,
  Settings,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getRoles,
  getRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  getAuditLogs,
  type Role,
  type PermissionCategory as ApiPermissionCategory,
  type AuditLog
} from "../api/rolesApi";
import toast from "react-hot-toast";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmModal from "../components/ConfirmModal";
import { getAdminPageTheme } from "../layout/adminPageTheme";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { usePermissions } from "../hooks/usePermissions";
import { pluralWord } from "../i18n/plural";
import { currentLocaleTag } from "../utils/dates";

type RoleType = "admin" | "teacher" | "student" | "laborant";
type PermissionLevel = "read" | "write" | "delete" | "none";


interface Permission {
  id: string;
  name: string;
  description: string;
  level: PermissionLevel;
  enabled: boolean;
}

interface PermissionCategoryState {
  title: string;
  icon: React.ElementType;
  permissions: Permission[];
}

const categoryIconMap: Record<string, React.ElementType> = {
  REPOS: GitBranch,
  REPOSITORIES: GitBranch,
  "РЕПОЗИТОРИИ": GitBranch,
  "ПОЛЬЗОВАТЕЛИ И ГРУППЫ": Users,
  "USERS & GROUPS": Users,
  "ОЦЕНКИ И ЗАДАНИЯ": GraduationCap,
  "GRADES & ASSIGNMENTS": GraduationCap,
  SYSTEM: Settings,
  СИСТЕМА: Settings,
};

function mapApiCategories(permsData: ApiPermissionCategory[]): PermissionCategoryState[] {
  return permsData.map((cat) => ({
    title: cat.title,
    icon: categoryIconMap[cat.title] || Settings,
    permissions: cat.permissions,
  }));
}

// Icon mapping for role icons from API
const iconMap: Record<string, React.ElementType> = {
  Shield,
  Briefcase,
  Microscope,
  User,
  UserPlus,
  GitBranch,
  Users,
  GraduationCap,
  Settings,
};

function getRoleIconStyle(roleId: string, isDarkTheme: boolean) {
  const styles: Record<string, { dark: string; light: string }> = {
    admin: { dark: "bg-red-500/20 text-red-400", light: "bg-red-100 text-red-700" },
    teacher: { dark: "bg-purple-500/20 text-purple-400", light: "bg-purple-100 text-purple-700" },
    student: { dark: "bg-blue-500/20 text-blue-400", light: "bg-blue-100 text-blue-700" },
    laborant: { dark: "bg-pink-500/20 text-pink-400", light: "bg-pink-100 text-pink-700" },
  };
  const s = styles[roleId] ?? styles.student;
  return isDarkTheme ? s.dark : s.light;
}

function getLevelBadge(level: PermissionLevel, isDarkTheme: boolean, t: (key: string) => string) {
  const styles = {
    read: isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700",
    write: isDarkTheme ? "bg-[#252525] text-[#ccd0d4]" : "bg-gray-100 text-gray-900",
    delete: isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700",
    none: isDarkTheme ? "bg-[#2d2d2d] text-[#6e7681]" : "bg-gray-200 text-gray-500",
  };
  const labels = {
    read: t("admin.roles.read"),
    write: t("admin.roles.write"),
    delete: t("admin.roles.delete"),
    none: t("admin.roles.none"),
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  isDarkTheme,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  isDarkTheme?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : isDarkTheme ? "bg-[#2d2d2d] border border-[#30363d]" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

interface RolesPageProps {
  isDarkTheme?: boolean;
}

export default function RolesPage({ isDarkTheme = true }: RolesPageProps) {
  const { t, tp, language } = useUserPreferences();
  const { refreshPermissions } = usePermissions();
  const dateLocale = currentLocaleTag();
  // Role and permission texts come from the server in Russian; translate them by id and fall back to the server text.
  const translated = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const roleName = (role: Role | undefined) => (role ? translated(`admin.roles.roleName.${role.id}`, role.name) : "");
  const roleDescription = (role: Role) => translated(`admin.roles.roleDescription.${role.id}`, role.description);

  const mapCategoryTitle = (title: string) => {
    const keys: Record<string, string> = {
      "РЕПОЗИТОРИИ": "admin.roles.sectionRepos",
      "ПОЛЬЗОВАТЕЛИ И ГРУППЫ": "admin.roles.sectionUsers",
      "ОЦЕНКИ И ЗАДАНИЯ": "admin.roles.sectionGrades",
      "СИСТЕМА": "admin.roles.sectionSystem",
      REPOSITORIES: "admin.roles.sectionRepos",
      "USERS & GROUPS": "admin.roles.sectionUsers",
      "GRADES & ASSIGNMENTS": "admin.roles.sectionGrades",
      SYSTEM: "admin.roles.sectionSystem",
    };
    const key = keys[title];
    return key ? t(key) : title;
  };
  const [selectedRole, setSelectedRole] = useState<RoleType>("admin");
  const [categories, setCategories] = useState<PermissionCategoryState[]>([]);
  const [initialCategories, setInitialCategories] = useState<PermissionCategoryState[]>([]);
  const [pendingRole, setPendingRole] = useState<RoleType | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Check if permissions have changed
  const hasChanges = JSON.stringify(categories) !== JSON.stringify(initialCategories);

  // Load audit logs
  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await getAuditLogs(selectedRole, 20);
      setAuditLogs(logs);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, [selectedRole]);


  const [rolesFailed, setRolesFailed] = useState(false);

  // Load roles on mount
  useEffect(() => {
    getRoles()
      .then(setRoles)
      .catch(() => setRolesFailed(true))
      .finally(() => setLoading(false));
  }, []);

  // Load permissions when the role changes; a slower response for a previous role must not land in the new one
  // (saving would then write the wrong permissions to it).
  useEffect(() => {
    let cancelled = false;
    setPermissionsLoading(true);
    getRolePermissions(selectedRole)
      .then((permsData) => {
        if (cancelled) return;
        const mappedCategories = mapApiCategories(permsData);
        setCategories(mappedCategories);
        setInitialCategories(mappedCategories);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("admin.roles.permissionsLoadError"));
      })
      .finally(() => {
        if (!cancelled) setPermissionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRole, t]);

  const currentRole = roles.find((r) => r.id === selectedRole);

  useEffect(() => {
    if (showAuditLogs && currentRole?.id === "admin") {
      void loadAuditLogs();
    }
  }, [showAuditLogs, currentRole?.id, loadAuditLogs]);

  // Switching roles drops unsaved toggles, so ask first.
  const handleRoleChange = (role: RoleType) => {
    if (role === selectedRole) return;
    if (hasChanges) {
      setPendingRole(role);
      return;
    }
    setSelectedRole(role);
  };

  const togglePermission = (categoryIndex: number, permissionIndex: number) => {
    setCategories((prev) => {
      const next = [...prev];
      next[categoryIndex] = {
        ...next[categoryIndex],
        permissions: [...next[categoryIndex].permissions],
      };
      next[categoryIndex].permissions[permissionIndex] = {
        ...next[categoryIndex].permissions[permissionIndex],
        enabled: !next[categoryIndex].permissions[permissionIndex].enabled,
      };
      return next;
    });
  };

  // Save permissions
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentRole || saving) return;
    setSaving(true);
    try {
      const permissionsData = categories.map((cat) => ({
        title: cat.title,
        permissions: cat.permissions.map((p) => ({
          id: p.id,
          enabled: p.enabled,
        })),
      }));
      await saveRolePermissions(currentRole.id, permissionsData);
      // Update initial state to reflect saved changes
      setInitialCategories(categories);
      await refreshPermissions();
      toast.success(t("admin.roles.permissionsSaved"));
    } catch {
      toast.error(t("admin.roles.permissionsSaveError"));
    } finally {
      setSaving(false);
    }
  };

  // Reset permissions to defaults (persists on server; available even when nothing unsaved)
  const handleReset = async () => {
    if (!currentRole || resetting) return;
    setResetting(true);
    try {
      const defaultPerms = await resetRolePermissions(currentRole.id);
      const mappedCategories = mapApiCategories(defaultPerms);
      setCategories(mappedCategories);
      setInitialCategories(mappedCategories);
      await refreshPermissions();
      toast.success(t("admin.roles.permissionsReset"));
    } catch {
      toast.error(t("admin.roles.permissionsResetError"));
    } finally {
      setResetting(false);
    }
  };

  const ui = getAdminPageTheme(isDarkTheme);
  const tableBg = ui.tableBg;
  const tableBorder = ui.tableBorder;
  const panelCard = `${tableBg} border ${tableBorder}`;
  const headerActionBg = ui.cardBg;
  const headerActionHover = ui.cardHover;
  const cardBgLight = ui.iconBg;
  const textPrimary = ui.tableNameText;
  const textSecondary = ui.tableHeaderText;
  const textTertiary = ui.tableCellText;
  const headerText = ui.tableHeaderText;
  const activeBadge = isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700";
  const systemBadge = isDarkTheme ? "bg-[#2d2d2d] text-[#6e7681]" : "bg-gray-200 text-gray-500";
  const dividerColor = ui.tableBorder;
  const hoverBg = ui.tableRowHover;
  const listItemHover = ui.tableRowHover;
  const saveBtnActive = "bg-blue-600 text-white hover:bg-blue-700 shadow-sm";
  const saveBtnInactive = `${ui.iconBg} ${ui.tableCellText} cursor-not-allowed opacity-60`;
  const sectionHeader = ui.tableHeaderText;
  const auditCard = `${tableBg} border ${tableBorder}`;
  const auditTag = `${ui.iconBg} ${ui.tableCellText}`;

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${ui.pageWrapper} transition-colors`}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (rolesFailed) {
    return (
      <div className={`h-full flex items-center justify-center ${ui.pageWrapper} transition-colors`}>
        <p className={`text-sm ${ui.tableCellText}`}>{t("admin.roles.rolesLoadError")}</p>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${ui.pageWrapper} transition-colors`}>
      <div className="w-full py-6 px-4 sm:px-6 space-y-6 pb-20">
        {/* Header */}
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title={t("admin.roles.title")}
          subtitle={tp("admin.roles.rolesCount", { n: roles.length })}
        />

        {/* Role Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {roles.map((role) => {
            const Icon = iconMap[role.icon] || User;
            const isActive = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => handleRoleChange(role.id as RoleType)}
                className={`text-left p-5 rounded-xl border transition-colors ${panelCard} ${
                  isActive
                    ? "border-blue-500/40 ring-1 ring-blue-500/20"
                    : isDarkTheme ? "hover:border-[#3d3d3d]" : "hover:border-slate-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${getRoleIconStyle(role.id, isDarkTheme)} flex items-center justify-center mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className={`text-base font-semibold mb-1 ${textPrimary}`}>{roleName(role)}</h3>
                <p className={`text-xs mb-3 line-clamp-2 ${textSecondary}`}>{roleDescription(role)}</p>
                <p className={`text-sm ${textTertiary}`}>{role.user_count} {pluralWord(language, "admin.roles.users", role.user_count)}</p>
              </button>
            );
          })}
        </div>

        {/* Split Screen */}
        <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-6">
          {/* Left Column - Role Selection */}
          <div className={`rounded-xl p-5 ${panelCard}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${headerText}`}>
              {t("admin.roles.selectRole")}
            </h2>
            <div className="space-y-2">
              {roles.map((role) => {
                const Icon = iconMap[role.icon] || User;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => handleRoleChange(role.id as RoleType)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isSelected ? cardBgLight : listItemHover
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${getRoleIconStyle(role.id, isDarkTheme)} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${textPrimary}`}>{roleName(role)}</p>
                      <p className={`text-xs ${textSecondary}`}>{role.user_count} {pluralWord(language, "admin.roles.users", role.user_count)}</p>
                    </div>
                    {isSelected ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${activeBadge}`}>
                        {t("admin.roles.selected")}
                      </span>
                    ) : role.is_system ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${systemBadge}`}>
                        {t("admin.roles.systemRole")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column - Permission Settings */}
          <div className={`rounded-xl p-5 ${panelCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <h2 className={`text-lg font-semibold ${textPrimary}`}>{roleName(currentRole) || t("admin.roles.roleFallback")}</h2>
                <span className={textSecondary}>—</span>
                <span className={textTertiary}>{t("admin.roles.accessRights")}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={permissionsLoading || resetting}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${headerActionBg} ${headerActionHover} ${ui.tableCellText}`}
                >
                  {resetting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  {resetting ? t("admin.roles.resetting") : t("admin.roles.resetToDefaults")}
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={permissionsLoading || !hasChanges || saving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasChanges ? saveBtnActive : saveBtnInactive
                  }`}
                >
                  <Save className="h-4 w-4" />
                  {t("admin.roles.save")}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {categories.map((category, categoryIndex: number) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.title}>
                    {categoryIndex > 0 && <div className={`border-t mb-6 ${dividerColor}`} />}
                    <div className="flex items-center gap-2 mb-4">
                      <CategoryIcon className={`h-4 w-4 ${sectionHeader}`} />
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${sectionHeader}`}>
                        {mapCategoryTitle(category.title)}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {category.permissions.map((permission: Permission, permissionIndex: number) => (
                        <div
                          key={permission.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${cardBgLight}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${textPrimary}`}>
                              {translated(`admin.roles.perm.${permission.id}.name`, permission.name)}
                            </p>
                            <p className={`text-xs ${textSecondary}`}>
                              {translated(`admin.roles.perm.${permission.id}.description`, permission.description)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {getLevelBadge(permission.level, isDarkTheme, t)}
                            <Toggle
                              checked={permission.enabled}
                              onChange={() => togglePermission(categoryIndex, permissionIndex)}
                              isDarkTheme={isDarkTheme}
                              label={translated(`admin.roles.perm.${permission.id}.name`, permission.name)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Audit Logs - Only for Admin */}
              {currentRole?.id === "admin" && (
                <>
                  <div className={`border-t mb-6 ${dividerColor}`} />
                  <div className="space-y-4">
                    <button
                      onClick={() => setShowAuditLogs(!showAuditLogs)}
                      className={`flex items-center justify-between w-full p-3 rounded-lg transition-colors ${cardBgLight} ${hoverBg}`}
                    >
                      <div className="flex items-center gap-2">
                        <History className={`h-4 w-4 ${sectionHeader}`} />
                        <span className={`text-sm font-medium ${textPrimary}`}>
                          {t("admin.roles.permissionHistory")}
                        </span>
                      </div>
                      {showAuditLogs ? (
                        <ChevronUp className={`h-4 w-4 ${textSecondary}`} />
                      ) : (
                        <ChevronDown className={`h-4 w-4 ${textSecondary}`} />
                      )}
                    </button>

                    {showAuditLogs && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {auditLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className={`h-5 w-5 animate-spin ${textSecondary}`} />
                          </div>
                        ) : auditLogs.length === 0 ? (
                          <p className={`text-sm text-center py-4 ${textSecondary}`}>
                            {t("admin.roles.noHistory")}
                          </p>
                        ) : (
                          auditLogs.map((log) => (
                            <div
                              key={log.id}
                              className={`p-3 rounded-lg border ${auditCard}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-sm font-medium ${textPrimary}`}>
                                  {log.actor_name}
                                </span>
                                <span className={`text-xs ${textSecondary}`}>
                                  {new Date(log.created_at).toLocaleString(dateLocale)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`px-2 py-0.5 rounded ${auditTag}`}>
                                  {roleName(roles.find((role) => role.id === log.target_role)) || log.target_role}
                                </span>
                                <span className={textSecondary}>
                                  {log.action === "save_batch" ? t("admin.roles.changedPermissions") :
                                   log.action === "reset" ? t("admin.roles.resetPermissions") : log.action}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={pendingRole !== null}
        title={t("admin.roles.discardTitle")}
        message={t("admin.roles.discardMessage")}
        confirmText={t("admin.roles.discardConfirm")}
        isDangerous
        onCancel={() => setPendingRole(null)}
        onConfirm={() => {
          if (pendingRole) setSelectedRole(pendingRole);
          setPendingRole(null);
        }}
      />
    </div>
  );
}
