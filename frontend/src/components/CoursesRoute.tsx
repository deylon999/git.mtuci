import { Navigate, useSearchParams } from "react-router-dom";
import CoursesPage from "../pages/CoursesPage";
import StudentCoursesPage from "../pages/StudentCoursesPage";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface CoursesRouteProps {
  isDarkTheme?: boolean;
}

export default function CoursesRoute({ isDarkTheme = false }: CoursesRouteProps) {
  const { t } = useUserPreferences();
  const { user, loading } = useAuthUser();
  const [searchParams] = useSearchParams();
  const isCreate = searchParams.get("create") === "1";

  if (loading) {
    return <div className="text-sm text-slate-500">{t("coursesRoute.loading")}</div>;
  }

  if (!user) {
    return <div className="text-sm text-slate-500">{t("auth.loginRequired")}</div>;
  }

  if (user.role === "student") {
    return <StudentCoursesPage isDarkTheme={isDarkTheme} />;
  }

  if (user.role === "teacher" || user.role === "laborant") {
    if (isCreate) {
      return <CoursesPage isDarkTheme={isDarkTheme} />;
    }
    return <Navigate to="/teacher/courses" replace />;
  }

  return <CoursesPage isDarkTheme={isDarkTheme} />;
}
