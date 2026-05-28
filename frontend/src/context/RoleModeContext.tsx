import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

function detectDualRole(user: any): boolean {
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
    if (!canSwitchLaborantMode && mode !== "laborant") {
      setModeState("laborant");
    }
  }, [canSwitchLaborantMode, mode]);

  const setMode = (next: RoleMode) => {
    const value = canSwitchLaborantMode ? next : "laborant";
    setModeState(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  const toggleMode = () => setMode(mode === "laborant" ? "student" : "laborant");

  const value = useMemo(
    () => ({ canSwitchLaborantMode, mode, setMode, toggleMode }),
    [canSwitchLaborantMode, mode],
  );

  return <RoleModeContext.Provider value={value}>{children}</RoleModeContext.Provider>;
}

export function useRoleMode() {
  const ctx = useContext(RoleModeContext);
  if (!ctx) throw new Error("useRoleMode must be used within RoleModeProvider");
  return ctx;
}
