import { useEffect, useState } from "react";
import { getMe } from "../api/authApi";
import type { UserRole } from "../api/types";
import RepositoriesPage from "../pages/RepositoriesPage";
import StudentRepositoriesPage from "../pages/StudentRepositoriesPage";

interface RepositoriesRouteProps {
  isDarkTheme?: boolean;
}

export default function RepositoriesRoute({ isDarkTheme = false }: RepositoriesRouteProps) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="h-14 text-sm text-slate-500">Загрузка…</div>;
  }

  if (role === "student") {
    return <StudentRepositoriesPage isDarkTheme={isDarkTheme} />;
  }

  return <RepositoriesPage isDarkTheme={isDarkTheme} />;
}
