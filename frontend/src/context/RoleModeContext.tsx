import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthUser } from "./AuthUserContext";

type RoleMode = "laborant" | "student";

interface RoleModeContextValue {
  canSwitchLaborantMode: boolean;
  mode: RoleMode;
  setMode: (mode: RoleMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "mtuci:laborant-mode";

const RoleModeContext = createContext<RoleModeContextValue | null>(null);

function detectDualRole(user: { role?: string; can_switch_student_mode?: boolean } | null | undefined): boolean {
  if (!user || user.role !== "laborant") return false;
  return user.can_switch_student_mode === true;
}

export function RoleModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthUser();
  const canSwitchLaborantMode = detectDualRole(user);
  const [mode, setModeState] = useState<RoleMode>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "student" ? "student" : "laborant";
  });

  useEffect(() => {
    // Wait for the user: while it is still loading canSwitchLaborantMode is false, and resetting here
    // would discard the "student" mode restored from localStorage on every page reload.
    if (user && !canSwitchLaborantMode && mode !== "laborant") {
      setModeState("laborant");
    }
  }, [user, canSwitchLaborantMode, mode]);

  const setMode = useCallback(
    (next: RoleMode) => {
      const value = canSwitchLaborantMode ? next : "laborant";
      setModeState(value);
      localStorage.setItem(STORAGE_KEY, value);
    },
    [canSwitchLaborantMode],
  );

  const toggleMode = useCallback(
    () => setMode(mode === "laborant" ? "student" : "laborant"),
    [mode, setMode],
  );

  const value = useMemo(
    () => ({ canSwitchLaborantMode, mode, setMode, toggleMode }),
    [canSwitchLaborantMode, mode, setMode, toggleMode],
  );

  return <RoleModeContext.Provider value={value}>{children}</RoleModeContext.Provider>;
}

export function useRoleMode() {
  const ctx = useContext(RoleModeContext);
  if (!ctx) throw new Error("useRoleMode must be used within RoleModeProvider");
  return ctx;
}
