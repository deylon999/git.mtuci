import { Link, Navigate, useLocation } from "react-router-dom";
import { getToken } from "../api/client";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

export default function NotFoundPage({ isDarkTheme = false }: { isDarkTheme?: boolean }) {
  const { t } = useUserPreferences();
  const location = useLocation();
  const theme = getTheme(isDarkTheme);

  // Signed-out visitors go to the login page and come back here afterwards.
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold" style={{ color: theme.text3 }}>
        404
      </p>
      <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
        {t("notFound.title")}
      </h1>
      <p className="max-w-md text-sm" style={{ color: theme.text2 }}>
        {t("notFound.hint")}
      </p>
      <Link
        to="/"
        className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ backgroundColor: theme.accent }}
      >
        {t("notFound.home")}
      </Link>
    </div>
  );
}
