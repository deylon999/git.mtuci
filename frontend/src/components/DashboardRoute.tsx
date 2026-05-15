import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMe } from "../api/authApi";
import DashboardPage from "../pages/DashboardPage";

type Props = {
  isDarkTheme?: boolean;
};

export default function DashboardRoute({ isDarkTheme = false }: Props) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        if (!cancelled) setRole("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (role === null) {
    return <div className="text-sm text-slate-500">Loading...</div>;
  }
  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  return <DashboardPage isDarkTheme={isDarkTheme} />;
}
