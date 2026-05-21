import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import type { UserRead } from "../api/types";

interface AuthUserContextValue {
  user: UserRead | null;
  loading: boolean;
  refreshUser: (opts?: { force?: boolean }) => Promise<UserRead | null>;
  clearUser: () => void;
}

const AuthUserContext = createContext<AuthUserContextValue | null>(null);

export function AuthUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const clearUser = useCallback(() => {
    invalidateMeCache();
    setUser(null);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async (opts?: { force?: boolean }) => {
    if (!getToken()) {
      clearUser();
      return null;
    }
    try {
      const me = await getMe(opts?.force ? { force: true } : undefined);
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearUser]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, refreshUser, clearUser }),
    [user, loading, refreshUser, clearUser],
  );

  return <AuthUserContext.Provider value={value}>{children}</AuthUserContext.Provider>;
}

export function useAuthUser(): AuthUserContextValue {
  const ctx = useContext(AuthUserContext);
  if (!ctx) {
    throw new Error("useAuthUser must be used within AuthUserProvider");
  }
  return ctx;
}

export function useAuthUserOptional(): AuthUserContextValue | null {
  return useContext(AuthUserContext);
}
