import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMyPermissions } from "../api/rolesApi";
import { useAuthUser } from "./AuthUserContext";

type PermissionsContextValue = {
  permissions: Set<string>;
  loading: boolean;
  hasPermission: (permissionId: string) => boolean;
  hasAnyPermission: (...permissionIds: string[]) => boolean;
  refreshPermissions: () => Promise<void>;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthUser();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refreshPermissions = useCallback(async () => {
    if (!user) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const perms = await getMyPermissions();
      setPermissions(new Set(perms));
    } catch (error) {
      console.error("Failed to load permissions:", error);
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const hasPermission = useCallback(
    (permissionId: string) => permissions.has(permissionId),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (...permissionIds: string[]) => permissionIds.some((id) => permissions.has(id)),
    [permissions],
  );

  const value = useMemo(
    () => ({
      permissions,
      loading,
      hasPermission,
      hasAnyPermission,
      refreshPermissions,
    }),
    [permissions, loading, hasPermission, hasAnyPermission, refreshPermissions],
  );

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within PermissionsProvider");
  }
  return ctx;
}
