import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getToken, clearToken } from "../api/client";
import { getMe } from "../api/authApi";
import { useUserPreferences } from "../context/UserPreferencesContext";

export default function AdminRequired() {
  const { t } = useUserPreferences();
  const token = getToken();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const me = await getMe();
        if (!cancelled) {
          setIsAdmin(me.role === "admin");
        }
      } catch {
        // Token протух/пользователь заблокирован.
        clearToken();
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  if (!isAdmin) return <Navigate to="/courses" replace />;

  return <Outlet />;
}

