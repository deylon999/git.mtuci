import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { clearToken, getToken } from "../api/client";
import { getMe } from "../api/authApi";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import HomePage from "../pages/HomePage";

type Props = {
  isDarkTheme?: boolean;
};

export default function HomeRoute({ isDarkTheme = false }: Props) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setRole("guest");
      return;
    }
    let cancelled = false;
    void getMe()
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        clearToken();
        if (!cancelled) setRole("guest");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!getToken() || role === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (role === null) {
    return <div className="text-sm text-slate-500">Loading...</div>;
  }
  if (role === "admin" || role === "student") {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }
  return <HomePage isDarkTheme={isDarkTheme} />;
}
