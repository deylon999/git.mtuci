import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getToken } from "../api/client";
import { getMe } from "../api/authApi";
import { getDefaultRouteForRole } from "../utils/defaultRoute";

type Props = {
  fallbackPath?: string;
};

export default function RoleBasedHomeRedirect({
  fallbackPath = "/home",
}: Props) {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!getToken()) {
        if (!cancelled) setTarget(fallbackPath);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) {
          setTarget(getDefaultRouteForRole(me.role));
        }
      } catch {
        if (!cancelled) setTarget(fallbackPath);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [fallbackPath]);

  if (!target) {
    return <div className="text-sm text-slate-500">Loading...</div>;
  }
  return <Navigate to={target} replace />;
}
