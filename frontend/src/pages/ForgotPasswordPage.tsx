import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword } from "../api/authApi";
import { useUserPreferences } from "../context/UserPreferencesContext";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useUserPreferences();

  // Read theme from localStorage (persisted across sessions)
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("theme");
      setIsDarkTheme(saved ? saved === "dark" : false);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Theme-based colors - unified with project standard
  const pageBgStyle = isDarkTheme ? { backgroundColor: "#0f0f10" } : { backgroundColor: "#f9fafb" };
  const cardBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const brandText = isDarkTheme ? "text-blue-400" : "text-blue-600";
  const titleText = isDarkTheme ? "text-white" : "text-gray-900";
  const subtitleText = isDarkTheme ? "text-gray-400" : "text-gray-600";
  const labelText = isDarkTheme ? "text-gray-400" : "text-gray-700";
  const inputBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d] text-white" : "bg-gray-100 border-gray-300 text-gray-900";
  const inputFocus = "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const successBg = isDarkTheme ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-800";
  const errorBg = isDarkTheme ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-800";
  const primaryBtn = "bg-blue-600 hover:bg-blue-700 text-white";
  const secondaryBtn = isDarkTheme ? "bg-[#2d2d2d] border-[#3d3d3d] text-gray-300 hover:bg-[#3d3d3d]" : "bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.forgot.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={pageBgStyle}>
      <div className={`w-full max-w-md rounded-xl border p-8 shadow-md ${cardBg}`}>
        <div className="mb-6 text-center">
          <div className={`text-xl font-semibold ${brandText}`}>GIT.MTUCI</div>
          <h1 className={`mt-3 text-2xl font-semibold ${titleText}`}>{t("auth.forgot.title")}</h1>
          <p className={`mt-1 text-sm ${subtitleText}`}>{t("auth.forgot.subtitleEmail")}</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className={`rounded-lg border p-4 text-sm ${successBg} transition-colors`}>
              {t("auth.forgot.successDetail")}
            </div>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className={`w-full rounded-lg px-3 py-2.5 font-medium transition ${primaryBtn}`}
            >
              {t("auth.forgot.back")}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>{t("auth.forgot.email")}</label>
              <input
                className={`w-full rounded-lg border px-3 py-2.5 outline-none transition ${inputBg} ${inputFocus}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={t("auth.forgot.emailPlaceholder")}
              />
            </div>

            {error ? (
              <div className={`rounded-lg border p-3 text-sm ${errorBg} transition-colors`}>{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-lg px-3 py-2.5 font-medium transition disabled:opacity-60 ${primaryBtn}`}
            >
              {loading ? t("auth.forgot.submittingAlt") : t("auth.forgot.submitInstructions")}
            </button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className={`w-full rounded-lg border px-3 py-2.5 transition ${secondaryBtn}`}
            >
              {t("auth.forgot.backToLogin")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
