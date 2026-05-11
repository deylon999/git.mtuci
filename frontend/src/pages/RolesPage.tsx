import { useState, useEffect } from "react";
import {
  Shield,
  Briefcase,
  User,
  UserPlus,
  Microscope,
  Check,
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
  getLaborants,
  saveRolePermissions,
  resetRolePermissions,
  trustLaborant,
  untrustLaborant,
  getAuditLogs,
  type Role,
  type PermissionCategory,
  type Laborant,
  type AuditLog
} from "../api/rolesApi";
import { getMe, updateAssistantGrading } from "../api/authApi";
import toast from "react-hot-toast";
import AdminPageHeader from "../components/AdminPageHeader";

type RoleType = "admin" | "teacher" | "student" | "laborant";
type PermissionLevel = "read" | "write" | "delete" | "none";

// Russian pluralization helper
function pluralizeUsers(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "пользователей";
  }
  if (lastDigit === 1) {
    return "пользователь";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "пользователя";
  }
  return "пользователей";
}

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

function getLevelBadge(level: PermissionLevel, isDarkTheme: boolean) {
  const styles = {
    read: isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700",
    write: isDarkTheme ? "bg-[#252525] text-[#ccd0d4]" : "bg-gray-100 text-gray-900",
    delete: isDarkTheme ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700",
    none: isDarkTheme ? "bg-[#2d2d2d] text-[#6e7681]" : "bg-gray-200 text-gray-500",
  };
  const labels = {
    read: "Чтение",
    write: "Запись",
    delete: "Удаление",
    none: "Нет",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function Toggle({ checked, onChange, disabled, isDarkTheme }: { checked: boolean; onChange: () => void; disabled?: boolean; isDarkTheme?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : isDarkTheme ? "bg-[#2d2d2d]" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
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
  const [selectedRole, setSelectedRole] = useState<RoleType>("admin");
  const [categories, setCategories] = useState<PermissionCategoryState[]>([]);
  const [initialCategories, setInitialCategories] = useState<PermissionCategoryState[]>([]);
  const [assistants, setAssistants] = useState<Laborant[]>([]);
  const [allowAssistantGrading, setAllowAssistantGrading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // Check if permissions have changed
  const hasChanges = JSON.stringify(categories) !== JSON.stringify(initialCategories);

  // Load audit logs
  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const logs = await getAuditLogs(selectedRole, 20);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (showAuditLogs && currentRole?.id === "admin") {
      loadAuditLogs();
    }
  }, [showAuditLogs, selectedRole]);

  // Load roles on mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const data = await getRoles();
        setRoles(data);
      } catch (error) {
        console.error("Failed to load roles:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // Load permissions and laborants when role changes
  useEffect(() => {
    const fetchData = async () => {
      setPermissionsLoading(true);
      // Reset assistants immediately to avoid showing old data
      setAssistants([]);
      try {
        const [permsData, laborantsData, meData] = await Promise.all([
          getRolePermissions(selectedRole),
          selectedRole === "teacher" ? getLaborants() : Promise.resolve([]),
          selectedRole === "teacher" ? getMe() : Promise.resolve(null),
        ]);
        
        console.log("Loaded permissions for", selectedRole, permsData);
        console.log("Loaded laborants:", laborantsData);
        
        // Load allow_assistant_grading from user data
        if (meData && meData.allow_assistant_grading !== undefined) {
          setAllowAssistantGrading(meData.allow_assistant_grading);
        }
        
        // Map API categories to component format with icons
        const mappedCategories: PermissionCategoryState[] = permsData.map((cat) => {
          const iconMap: Record<string, React.ElementType> = {
            "РЕПОЗИТОРИИ": GitBranch,
            "ПОЛЬЗОВАТЕЛИ И ГРУППЫ": Users,
            "ОЦЕНКИ И ЗАДАНИЯ": GraduationCap,
            "СИСТЕМА": Settings,
          };
          return {
            title: cat.title,
            icon: iconMap[cat.title] || Settings,
            permissions: cat.permissions,
          };
        });
        
        setCategories(mappedCategories);
        setInitialCategories(mappedCategories);
        setAssistants(laborantsData);
      } catch (error) {
        console.error("Failed to load role data:", error);
      } finally {
        setPermissionsLoading(false);
      }
    };
    fetchData();
  }, [selectedRole]);

  const currentRole = roles.find((r) => r.id === selectedRole);

  // Update permissions when role changes
  const handleRoleChange = (role: RoleType) => {
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

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleAssistantTrust = async (id: string) => {
    const assistant = assistants.find((a) => a.id === id);
    if (!assistant || togglingId) return;

    setTogglingId(id);
    try {
      if (assistant.trusted) {
        await untrustLaborant(id);
        toast.success("Лаборант убран из доверенных");
      } else {
        await trustLaborant(id);
        toast.success("Лаборант добавлен в доверенные");
      }
      // Update local state
      setAssistants((prev) =>
        prev.map((a) => (a.id === id ? { ...a, trusted: !a.trusted } : a))
      );
    } catch (error) {
      toast.error("Ошибка при изменении доверия");
      console.error(error);
    } finally {
      setTogglingId(null);
    }
  };

  // Save permissions
  const handleSave = async () => {
    if (!currentRole) return;
    try {
      const permissionsData = categories.map((cat) => ({
        title: cat.title,
        permissions: cat.permissions.map((p) => ({
          id: p.id,
          enabled: p.enabled,
        })),
      }));
      console.log("Saving permissions for role:", currentRole.id, permissionsData);
      const result = await saveRolePermissions(currentRole.id, permissionsData);
      console.log("Save result:", result);
      // Update initial state to reflect saved changes
      setInitialCategories(categories);
      toast.success("Права доступа сохранены");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Ошибка при сохранении прав. Проверьте консоль (F12)");
    }
  };

  // Reset permissions to defaults
  const handleReset = async () => {
    if (!currentRole) return;
    try {
      console.log("Resetting permissions for role:", currentRole.id);
      const defaultPerms = await resetRolePermissions(currentRole.id);
      console.log("Reset result:", defaultPerms);
      const mappedCategories: PermissionCategoryState[] = defaultPerms.map((cat) => ({
        title: cat.title,
        icon: iconMap[cat.title] || Settings,
        permissions: cat.permissions,
      }));
      setCategories(mappedCategories);
      toast.success("Права сброшены по умолчанию");
    } catch (error) {
      console.error("Reset error:", error);
      toast.error("Ошибка при сбросе прав. Проверьте консоль (F12)");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Theme-based colors
  const pageBg = isDarkTheme ? "bg-[#0f0f10] text-white" : "bg-[#f8f9fa] text-gray-900";
  const cardBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const cardBgLight = isDarkTheme ? "bg-[#252525]" : "bg-gray-200";
  const cardBgLighter = isDarkTheme ? "bg-[#1e1e1e]" : "bg-gray-100";
  const textPrimary = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const textSecondary = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const textTertiary = isDarkTheme ? "text-[#8b949e]" : "text-gray-600";
  const roleCardText = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const roleCardDesc = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const roleCardCount = isDarkTheme ? "text-[#8b949e]" : "text-gray-600";
  const headerText = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const activeBadge = isDarkTheme ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700";
  const systemBadge = isDarkTheme ? "bg-[#2d2d2d] text-[#6e7681]" : "bg-gray-200 text-gray-500";
  const dividerColor = isDarkTheme ? "border-[#2d2d2d]" : "border-gray-200";
  const hoverBg = isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-gray-200";
  const resetBtn = isDarkTheme ? "bg-[#252525] border-[#2d2d2d] text-[#8b949e] hover:text-white" : "bg-gray-200 border-gray-300 text-gray-600 hover:text-gray-900";
  const saveBtnActive = "bg-blue-600 text-white hover:bg-blue-700";
  const saveBtnInactive = isDarkTheme ? "bg-[#2d2d2d] text-[#6e7681] cursor-not-allowed" : "bg-gray-300 text-gray-500 cursor-not-allowed";
  const sectionHeader = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const assistantCard = isDarkTheme ? "bg-[#1e1e1e] border-[#30363d]" : "bg-gray-100 border-gray-200";
  const assistantHeader = isDarkTheme ? "bg-[#252525]" : "bg-gray-200";
  const trustedText = isDarkTheme ? "text-emerald-400" : "text-emerald-600";
  const untrustedText = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const auditCard = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const auditTag = isDarkTheme ? "bg-[#252525] text-[#8b949e]" : "bg-gray-200 text-gray-600";

  return (
    <div className={`h-full overflow-y-auto ${pageBg}`}>
      <div className="max-w-7xl mx-auto py-6 px-6 pr-2 space-y-6 pb-20">
        {/* Header */}
        <AdminPageHeader
          isDarkTheme={isDarkTheme}
          title="Роли и доступ"
          subtitle={`${roles.length} ролей`}
        />

        {/* Role Cards */}
        <div className="grid grid-cols-5 gap-4">
          {roles.map((role) => {
            const Icon = iconMap[role.icon] || User;
            const isActive = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => handleRoleChange(role.id as RoleType)}
                className={`text-left p-5 rounded-xl border transition-all ${cardBg} ${
                  isActive
                    ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
                    : isDarkTheme ? "hover:border-[#3d3d3d]" : "hover:border-gray-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${role.icon_bg} flex items-center justify-center mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className={`text-base font-semibold mb-1 ${roleCardText}`}>{role.name}</h3>
                <p className={`text-xs mb-3 line-clamp-2 ${roleCardDesc}`}>{role.description}</p>
                <p className={`text-sm ${roleCardCount}`}>{role.user_count} {pluralizeUsers(role.user_count)}</p>
              </button>
            );
          })}
        </div>

        {/* Split Screen */}
        <div className="grid grid-cols-[35%_1fr] gap-6">
          {/* Left Column - Role Selection */}
          <div className={`rounded-xl border p-5 ${cardBg}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${headerText}`}>
              Выбрать роль для редактирования
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
                      isSelected ? cardBgLight : isDarkTheme ? "hover:bg-[#252525]" : "hover:bg-gray-100"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${role.icon_bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium ${textPrimary}`}>{role.name}</p>
                      <p className={`text-xs ${textSecondary}`}>{role.user_count} {pluralizeUsers(role.user_count)}</p>
                    </div>
                    {isSelected ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${activeBadge}`}>
                        Выбрана
                      </span>
                    ) : role.is_system ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${systemBadge}`}>
                        Системная
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column - Permission Settings */}
          <div className={`rounded-xl border p-5 shadow-sm ${cardBg}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className={`text-lg font-semibold ${textPrimary}`}>{currentRole?.name || "Роль"}</h2>
                <span className={textSecondary}>—</span>
                <span className={textTertiary}>права доступа</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  disabled={permissionsLoading || (!hasChanges && categories.length > 0)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50 ${resetBtn}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  Сбросить
                </button>
                <button
                  onClick={handleSave}
                  disabled={permissionsLoading || !hasChanges}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    hasChanges ? saveBtnActive : saveBtnInactive
                  }`}
                >
                  <Save className="h-4 w-4" />
                  Сохранить
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
                        {category.title}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {category.permissions.map((permission: Permission, permissionIndex: number) => (
                        <div
                          key={permission.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${cardBgLight}`}
                        >
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${textPrimary}`}>{permission.name}</p>
                            <p className={`text-xs ${textSecondary}`}>{permission.description}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {getLevelBadge(permission.level, isDarkTheme)}
                            <Toggle
                              checked={permission.enabled}
                              onChange={() => togglePermission(categoryIndex, permissionIndex)}
                              isDarkTheme={isDarkTheme}
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
                          История изменений прав
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
                            Нет записей для этой роли
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
                                  {new Date(log.created_at).toLocaleString("ru-RU")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={`px-2 py-0.5 rounded ${auditTag}`}>
                                  {log.target_role}
                                </span>
                                <span className={textSecondary}>
                                  {log.action === "save_batch" ? "изменил права" :
                                   log.action === "reset" ? "сбросил права" : log.action}
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

              {/* Assistant Management - Only for Teacher role */}
              {selectedRole === "teacher" && (
                <>
                  <div className={`border-t mb-6 ${dividerColor}`} />
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className={`h-4 w-4 ${sectionHeader}`} />
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${sectionHeader}`}>
                        УПРАВЛЕНИЕ АССИСТЕНТАМИ
                      </h3>
                    </div>

                    <div className={`p-4 rounded-lg ${assistantHeader}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className={`text-sm font-medium ${textPrimary}`}>Разрешить лаборантам проверку моих курсов</p>
                          <p className={`text-xs ${textSecondary}`}>Доверенные лаборанты смогут выставлять оценки</p>
                        </div>
                        <Toggle
                          checked={allowAssistantGrading}
                          onChange={async () => {
                            const newValue = !allowAssistantGrading;
                            setAllowAssistantGrading(newValue);
                            try {
                              await updateAssistantGrading(newValue);
                              toast.success(newValue ? "Лаборантам разрешена проверка" : "Лаборантам запрещена проверка");
                            } catch (error) {
                              toast.error("Ошибка при сохранении настройки");
                              setAllowAssistantGrading(!newValue); // Revert on error
                            }
                          }}
                          isDarkTheme={isDarkTheme}
                        />
                      </div>

                      {allowAssistantGrading && (
                        <div className={`mt-4 pt-4 border-t ${dividerColor}`}>
                          <p className={`text-xs mb-3 ${textTertiary}`}>
                            Только выбранные лаборанты смогут выставлять оценки и менять статусы работ в ваших курсах
                          </p>
                          <div className="space-y-2">
                            {assistants.map((assistant) => (
                              <div
                                key={assistant.id}
                                className={`flex items-center justify-between p-3 rounded-lg border ${assistantCard}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkTheme ? "bg-emerald-500/20" : "bg-emerald-100"}`}>
                                    <span className={`text-xs font-medium ${isDarkTheme ? "text-emerald-400" : "text-emerald-600"}`}>{assistant.initials}</span>
                                  </div>
                                  <span className={`text-sm ${textPrimary}`}>{assistant.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs ${assistant.trusted ? trustedText : untrustedText}`}>
                                    {assistant.trusted ? "Доверенный" : "Не доверенный"}
                                  </span>
                                  <Toggle
                                    checked={assistant.trusted}
                                    onChange={() => toggleAssistantTrust(assistant.id)}
                                    disabled={togglingId === assistant.id}
                                    isDarkTheme={isDarkTheme}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
