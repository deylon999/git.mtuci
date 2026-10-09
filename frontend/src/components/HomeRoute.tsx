import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { clearToken, getToken, isSessionRejectedError } from "../api/client";
import { getMe } from "../api/authApi";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import { useUserPreferences } from "../context/UserPreferencesContext";
import AuthCheckFailed from "./AuthCheckFailed";

type Props = {
  isDarkTheme?: boolean;
};

export default function HomeRoute(_props: Props) {
  const { t } = useUserPreferences();
  const [role, setRole] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
      .catch((err) => {
        if (isSessionRejectedError(err)) {
          clearToken();
          if (!cancelled) setRole("guest");
        } else if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!getToken() || role === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (failed) return <AuthCheckFailed />;
  if (role === null) {
    return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  }
  if (role === "admin" || role === "student" || role === "teacher" || role === "laborant") {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }
  // Every real role has a home page above; anything else lands on the profile, which works for all accounts.
  return <Navigate to="/profile" replace />;
}
