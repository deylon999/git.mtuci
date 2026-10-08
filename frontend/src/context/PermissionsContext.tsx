import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const currentUserId = user?.id ?? null;
  // Key on identity + role rather than the user object: /auth/me returns a fresh object on every revalidation.
  const currentRole = user?.role ?? null;
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadedForUserIdRef = useRef(loadedForUserId);
  loadedForUserIdRef.current = loadedForUserId;

  const refreshPermissions = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!currentUserId) {
      setPermissions(new Set());
      setLoadedForUserId(null);
      setLoading(false);
      return;
    }
    // No setLoading(true) here: the exposed `loading` already stays true until permissions are loaded for
    // the current user id, and re-fetches for the same user must not unmount RequirePermission subtrees.
    try {
      const perms = await getMyPermissions();
      // A slower response for a previous user/role must not overwrite the current permission set.
      if (requestId !== requestIdRef.current) return;
      setPermissions(new Set(perms));
      setLoadedForUserId(currentUserId);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load permissions:", error);
      // Keep already loaded permissions of this user on a transient failure instead of locking them out.
      if (loadedForUserIdRef.current !== currentUserId) setPermissions(new Set());
      setLoadedForUserId(currentUserId);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
    // currentRole is a dependency so a role change reloads the permission set.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentRole is a deliberate reload trigger
  }, [currentUserId, currentRole]);

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
      loading: Boolean(currentUserId) && (loading || loadedForUserId !== currentUserId),
      hasPermission,
      hasAnyPermission,
      refreshPermissions,
    }),
    [permissions, loading, loadedForUserId, currentUserId, hasPermission, hasAnyPermission, refreshPermissions],
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
