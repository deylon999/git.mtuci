import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";

const CoursesPage = lazy(() => import("../pages/CoursesPage"));
const StudentCoursesPage = lazy(() => import("../pages/StudentCoursesPage"));

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
    return (
      <Suspense fallback={<div className="text-sm text-slate-500">{t("coursesRoute.loading")}</div>}>
        <StudentCoursesPage isDarkTheme={isDarkTheme} />
      </Suspense>
    );
  }

  if (user.role === "teacher" || user.role === "laborant") {
    if (isCreate) {
      return (
        <Suspense fallback={<div className="text-sm text-slate-500">{t("coursesRoute.loading")}</div>}>
          <CoursesPage isDarkTheme={isDarkTheme} />
        </Suspense>
      );
    }
    return <Navigate to="/teacher/courses" replace />;
  }

  return (
    <Suspense fallback={<div className="text-sm text-slate-500">{t("coursesRoute.loading")}</div>}>
      <CoursesPage isDarkTheme={isDarkTheme} />
    </Suspense>
  );
}
