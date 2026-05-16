import { useEffect, useState } from "react";
import { getMe } from "../api/authApi";
import CoursesPage from "../pages/CoursesPage";
import StudentCoursesPage from "../pages/StudentCoursesPage";

interface CoursesRouteProps {
  isDarkTheme?: boolean;
}

export default function CoursesRoute({ isDarkTheme = false }: CoursesRouteProps) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        if (!cancelled) setRole("student");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (role === null) {
    return <div className="text-sm text-slate-500">Загрузка…</div>;
  }

  if (role === "student") {
    return <StudentCoursesPage isDarkTheme={isDarkTheme} />;
  }

  return <CoursesPage isDarkTheme={isDarkTheme} />;
}
