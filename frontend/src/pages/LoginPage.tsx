import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { getToken } from "../api/client";
import { login, getMe } from "../api/authApi";
import { useAuthUser } from "../context/AuthUserContext";
import { getDefaultRouteForRole } from "../utils/defaultRoute";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useUserPreferences();
  const { refreshUser } = useAuthUser();

  // Read theme from localStorage (persisted across sessions)
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already logged in — go to the right home page
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getMe()
      .then((me) => navigate(getDefaultRouteForRole(me.role), { replace: true }))
      .catch(() => {});
  }, [navigate]);

  // Listen for theme changes from other pages
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("theme");
      setIsDarkTheme(saved ? saved === "dark" : false);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const theme = getTheme(isDarkTheme);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password, rememberMe);
      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem('remember_me', 'true');
      } else {
        localStorage.removeItem('remember_me');
      }
      const me = await refreshUser({ force: true });
      if (me) navigate(getDefaultRouteForRole(me.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.bg }}>
      <div className="w-full max-w-md rounded-xl border p-8 shadow-md" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
        <div className="mb-6 text-center">
          <div className="text-xl font-semibold" style={{ color: theme.accent }}>GIT.MTUCI</div>
          <h1 className="mt-3 text-2xl font-semibold" style={{ color: theme.text }}>{t("auth.login.title")}</h1>
          <p className="mt-1 text-sm" style={{ color: theme.text2 }}>{t("auth.login.subtitle")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium transition-colors" style={{ color: theme.text2 }}>{t("auth.login.email")}</label>
            <input
              className="w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium transition-colors" style={{ color: theme.text2 }}>{t("auth.login.password")}</label>
            <div className="relative">
              <input
                className="w-full rounded-lg border px-3 py-2.5 pr-10 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: theme.text3 }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="mt-1 flex justify-between items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer transition-colors" style={{ color: theme.text2 }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                  style={{ borderColor: theme.border }}
                />
                {t("auth.login.remember")}
              </label>
              <Link
                to="/forgot-password"
                className="text-sm transition hover:underline"
                style={{ color: theme.accent }}
              >
                {t("auth.login.forgot")}
              </Link>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border p-3 text-sm transition-colors" style={{ backgroundColor: `${theme.danger}10`, borderColor: `${theme.danger}30`, color: theme.danger }}>{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-3 py-2.5 font-medium transition disabled:opacity-60"
            style={{ backgroundColor: theme.accent, color: '#fff' }}
          >
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/register")}
            className="w-full rounded-lg border px-3 py-2.5 transition"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
          >
            {t("auth.login.register")}
          </button>
        </form>
      </div>
    </div>
  );
}

