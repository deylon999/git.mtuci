import { Navigate } from "react-router-dom";
import { useAuthUser } from "../context/AuthUserContext";
import DashboardPage from "../pages/DashboardPage";
import TeacherDashboardPage from "../pages/teacher/TeacherDashboardPage";
import { useUserPreferences } from "../context/UserPreferencesContext";

type Props = {
  isDarkTheme?: boolean;
};

export default function DashboardRoute({ isDarkTheme = false }: Props) {
  const { t } = useUserPreferences();
  const { user, loading } = useAuthUser();

  if (loading) {
    return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  if (user.role === "teacher" || user.role === "laborant") {
    return <TeacherDashboardPage isDarkTheme={isDarkTheme} />;
  }
  return <DashboardPage isDarkTheme={isDarkTheme} />;
}
