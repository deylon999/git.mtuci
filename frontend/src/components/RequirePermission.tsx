import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "../context/PermissionsContext";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";

type RequirePermissionProps = {
  permission?: string;
  anyOf?: string[];
  redirectTo?: string;
  children?: React.ReactNode;
};

export default function RequirePermission({
  permission,
  anyOf,
  redirectTo = "/home",
  children,
}: RequirePermissionProps) {
  const { t } = useUserPreferences();
  const { user } = useAuthUser();
  const { hasPermission, hasAnyPermission, loading } = usePermissions();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <div className="text-sm text-slate-500 p-4">{t("common.loading")}</div>;
  }

  const allowed = permission
    ? hasPermission(permission)
    : anyOf && anyOf.length > 0
      ? hasAnyPermission(...anyOf)
      : true;

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
