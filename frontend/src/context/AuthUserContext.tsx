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
import { useLocation } from "react-router-dom";
import { clearToken, getToken, isSessionRejectedError } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import {
  isStudentBootstrapPath,
  isStudentShellBootstrapResolved,
  onStudentShellBootstrap,
} from "../api/studentAppBootstrap";
import type { UserRead } from "../api/types";

interface AuthUserContextValue {
  user: UserRead | null;
  loading: boolean;
  /** The user could not be loaded for a reason other than a rejected session (network, 5xx). */
  failed: boolean;
  refreshUser: (opts?: { force?: boolean }) => Promise<UserRead | null>;
  clearUser: () => void;
}

const AuthUserContext = createContext<AuthUserContextValue | null>(null);

/** Re-validation returns a fresh object every time; keep the old one when nothing changed so consumers don't reload. */
function keepIfUnchanged(prev: UserRead | null, next: UserRead): UserRead {
  return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

export function AuthUserProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const [failed, setFailed] = useState(false);
  const hasUserRef = useRef(false);
  hasUserRef.current = user !== null;

  const clearUser = useCallback(() => {
    invalidateMeCache();
    setUser(null);
    setLoading(false);
    setFailed(false);
  }, []);

  // Drop the user only when the server rejected the session; keep the current one on transient errors.
  const applyLoadError = useCallback((err: unknown) => {
    if (isSessionRejectedError(err)) {
      clearToken();
      invalidateMeCache();
      setUser(null);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  const refreshUser = useCallback(async (opts?: { force?: boolean }) => {
    if (!getToken()) {
      clearUser();
      return null;
    }
    try {
      const me = await getMe(opts?.force ? { force: true } : undefined);
      setUser((prev) => keepIfUnchanged(prev, me));
      setFailed(false);
      return me;
    } catch (err) {
      applyLoadError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearUser, applyLoadError]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const applyMe = () => {
      void getMe()
        .then((me) => {
          if (!cancelled) {
            setUser((prev) => keepIfUnchanged(prev, me));
            setFailed(false);
          }
        })
        .catch((err) => {
          if (!cancelled) applyLoadError(err);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    // Only block rendering while no user is known yet. Re-validating on later navigations happens in the
    // background; flipping `loading` here would unmount every RequirePermission-guarded page on each route change.
    if (!hasUserRef.current) setLoading(true);

    if (isStudentBootstrapPath(pathname)) {
      if (isStudentShellBootstrapResolved()) {
        applyMe();
        return () => {
          cancelled = true;
        };
      }
      const unsub = onStudentShellBootstrap(() => {
        if (!cancelled) applyMe();
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }

    applyMe();
    return () => {
      cancelled = true;
    };
  }, [pathname, applyLoadError]);

  const value = useMemo(
    () => ({ user, loading, failed, refreshUser, clearUser }),
    [user, loading, failed, refreshUser, clearUser],
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
