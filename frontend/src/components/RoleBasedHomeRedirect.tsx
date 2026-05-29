import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { clearToken, getToken } from "../api/client";
import { getMe } from "../api/authApi";
import { getDefaultRouteForRole } from "../utils/defaultRoute";

export default function RoleBasedHomeRedirect() {
  const [target, setTarget] = useState<string | null>(null);

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
      } catch {
        clearToken();
        if (!cancelled) setTarget("/login");
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) {
    return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  }
  return <Navigate to={target} replace />;
}
