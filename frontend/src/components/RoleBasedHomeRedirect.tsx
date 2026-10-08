import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { clearToken, getToken, isSessionRejectedError } from "../api/client";
import { getMe } from "../api/authApi";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import { useUserPreferences } from "../context/UserPreferencesContext";
import AuthCheckFailed from "./AuthCheckFailed";

export default function RoleBasedHomeRedirect() {
  const { t } = useUserPreferences();
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!getToken()) {
        if (!cancelled) setTarget("/login");
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) {
          setTarget(getDefaultRouteForRole(me.role));
        }
      } catch (err) {
        if (isSessionRejectedError(err)) {
          clearToken();
          if (!cancelled) setTarget("/login");
        } else if (!cancelled) {
          setFailed(true);
        }
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <AuthCheckFailed />;
  if (!target) {
    return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  }
  return <Navigate to={target} replace />;
}
