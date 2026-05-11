import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { register, registerStudentMtuci } from "../api/authApi";
import type { FormEvent } from "react";

export default function RegisterPage() {
  const navigate = useNavigate();

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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [useMtuci, setUseMtuci] = useState(false);
  const [mtuciLogin, setMtuciLogin] = useState("");
  const [mtuciPassword, setMtuciPassword] = useState("");
  const [showMtuciPassword, setShowMtuciPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme-based colors - unified with project standard
  const pageBgStyle = isDarkTheme ? { backgroundColor: "#0f0f10" } : { backgroundColor: "#f9fafb" };
  const cardBg = isDarkTheme ? "bg-[#1e1e1e] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const brandText = isDarkTheme ? "text-blue-400" : "text-blue-600";
  const titleText = isDarkTheme ? "text-white" : "text-gray-900";
  const subtitleText = isDarkTheme ? "text-gray-400" : "text-gray-600";
  const labelText = isDarkTheme ? "text-gray-400" : "text-gray-700";
  const inputBg = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d] text-white" : "bg-gray-100 border-gray-300 text-gray-900";
  const inputFocus = "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const eyeIconColor = isDarkTheme ? "text-gray-500 hover:text-gray-400" : "text-gray-400 hover:text-gray-600";
  const errorBg = isDarkTheme ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-800";
  const primaryBtn = "bg-blue-600 hover:bg-blue-700 text-white";
  const secondaryBtn = isDarkTheme ? "bg-[#2d2d2d] border-[#3d3d3d] text-gray-300 hover:bg-[#3d3d3d]" : "bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200";
  // MTUCI section colors (blue)
  const mtuciBg = isDarkTheme ? "bg-blue-500/10 border-blue-500/30" : "bg-blue-50 border-blue-100";
  const mtuciText = isDarkTheme ? "text-blue-400" : "text-blue-900";
  const mtuciSubtext = isDarkTheme ? "text-blue-300" : "text-blue-700";
  const checkboxBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-gray-300";
  // Password strength indicator
  const strengthDotWeak = isDarkTheme ? "bg-[#3d3d3d]" : "bg-gray-300";
  const strengthDotStrong = "bg-green-500";
  const strengthTextWeak = isDarkTheme ? "text-gray-500" : "text-gray-500";
  const strengthTextStrong = isDarkTheme ? "text-green-400" : "text-green-600";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (useMtuci && mtuciLogin && mtuciPassword) {
        await registerStudentMtuci(email, password, fullName, mtuciLogin, mtuciPassword);
      } else {
        await register(email, password, fullName);
      }
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={pageBgStyle}>
      <div className={`w-full max-w-md rounded-xl border p-8 shadow-md ${cardBg}`}>
        <div className="mb-6 text-center">
          <div className={`text-xl font-semibold ${brandText}`}>GIT.MTUCI</div>
          <h1 className={`mt-3 text-2xl font-semibold ${titleText}`}>Создание аккаунта</h1>
          <p className={`mt-1 text-sm ${subtitleText}`}>
            Создайте аккаунт преподавателя или студента (по умолчанию student).
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>Email</label>
            <input
              className={`w-full rounded-lg border px-3 py-2.5 outline-none transition ${inputBg} ${inputFocus}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>Password</label>
            <div className="relative">
              <input
                className={`w-full rounded-lg border px-3 py-2.5 pr-10 outline-none transition ${inputBg} ${inputFocus}`}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeIconColor}`}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className={`inline-block w-2 h-2 rounded-full ${password.length >= 8 ? strengthDotStrong : strengthDotWeak}`} />
              <span className={password.length >= 8 ? strengthTextStrong : strengthTextWeak}>
                Минимум 8 символов
              </span>
            </div>
          </div>

          <div className={`rounded-lg border p-3 ${mtuciBg} transition-colors`}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useMtuci}
                onChange={(e) => setUseMtuci(e.target.checked)}
                className={`rounded ${checkboxBorder} text-blue-600 focus:ring-blue-500`}
              />
              <span className={`text-sm font-medium ${mtuciText} transition-colors`}>
                Автозаполнение из ЛК МТУСИ
              </span>
            </label>
            <p className={`mt-1 text-xs ${mtuciSubtext} transition-colors`}>
              Укажите логин/пароль от ЛК МТУСИ, и ФИО с группой подтянутся автоматически
            </p>
          </div>

          {useMtuci ? (
            <>
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>Логин ЛК МТУСИ</label>
                <input
                  className={`w-full rounded-lg border px-3 py-2.5 outline-none transition ${inputBg} ${inputFocus}`}
                  type="text"
                  value={mtuciLogin}
                  onChange={(e) => setMtuciLogin(e.target.value)}
                  required={useMtuci}
                  placeholder="ваш_логин"
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>Пароль ЛК МТУСИ</label>
                <div className="relative">
                  <input
                    className={`w-full rounded-lg border px-3 py-2.5 pr-10 outline-none transition ${inputBg} ${inputFocus}`}
                    type={showMtuciPassword ? "text" : "password"}
                    value={mtuciPassword}
                    onChange={(e) => setMtuciPassword(e.target.value)}
                    required={useMtuci}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMtuciPassword(!showMtuciPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${eyeIconColor}`}
                    tabIndex={-1}
                  >
                    {showMtuciPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className={`mb-1 block text-sm font-medium ${labelText} transition-colors`}>Full name</label>
              <input
                className={`w-full rounded-lg border px-3 py-2.5 outline-none transition ${inputBg} ${inputFocus}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={!useMtuci}
                autoComplete="name"
              />
            </div>
          )}

          {error ? (
            <div className={`rounded-lg border p-3 text-sm ${errorBg} transition-colors`}>{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg px-3 py-2.5 font-medium transition disabled:opacity-60 ${primaryBtn}`}
          >
            {loading ? "Creating..." : useMtuci ? "Создать через ЛК МТУСИ" : "Создать аккаунт"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className={`w-full rounded-lg border px-3 py-2.5 transition ${secondaryBtn}`}
          >
            Назад ко входу
          </button>
        </form>
      </div>
    </div>
  );
}

