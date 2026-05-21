import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun, Bell, Globe, Shield, Key } from "lucide-react";
import { getMe } from "../api/authApi";
import { patchUserSettings } from "../api/userSettingsApi";
import StudentGitTokenSettings from "../components/StudentGitTokenSettings";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { requestBrowserNotificationPermission } from "../utils/browserNotifications";
import { getTheme } from "../theme";
import type { Locale } from "../i18n";

type SettingsSection = "general" | "notifications" | "security" | "git";

interface SettingsPageProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function SettingsPage({ isDarkTheme = false, onToggleTheme }: SettingsPageProps) {
  const { t, language, setLanguage, notifications, setNotifications, persistTheme } = useUserPreferences();
  const [section, setSection] = useState<SettingsSection>("general");
  const [isStudent, setIsStudent] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    void getMe()
      .then((u) => {
        setIsStudent(u.role === "student");
        setIsTeacher(u.role === "teacher" || u.role === "laborant");
      })
      .catch(() => {
        setIsStudent(false);
        setIsTeacher(false);
      });
  }, []);

  const theme = getTheme(isDarkTheme);

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => {
      const next = !prev[key];
      if (key === "push" && next) {
        void requestBrowserNotificationPermission();
      }
      const updated = { ...prev, [key]: next };
      void patchUserSettings({ notifications: updated }).catch(() => {});
      return updated;
    });
  };

  const handleThemeToggle = () => {
    const nextDark = !isDarkTheme;
    onToggleTheme?.();
    void persistTheme(nextDark ? "dark" : "light");
  };

  const sections: { id: SettingsSection; label: string; icon: typeof Moon }[] = [
    { id: "general", label: t("settings.sections.general"), icon: Sun },
    { id: "notifications", label: t("settings.sections.notifications"), icon: Bell },
    { id: "security", label: t("settings.sections.security"), icon: Shield },
    ...(isStudent ? [{ id: "git" as const, label: t("settings.sections.git"), icon: Key }] : []),
  ];

  const pickLanguage = (locale: Locale) => {
    if (locale !== language) setLanguage(locale);
  };

  return (
    <>
      <style>{`
        .settings-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background-color: ${theme.buttonBg};
          border-radius: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .settings-switch.active {
          background-color: ${theme.accent};
        }
        .settings-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .settings-switch.active::after {
          transform: translateX(20px);
        }
        .settings-card:hover {
          border-color: ${isDarkTheme ? "#404040" : "#d0d0d0"};
        }
      `}</style>

      <div key={language} style={{ backgroundColor: theme.bg, minHeight: "100%", padding: "16px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ color: theme.text, fontSize: "24px", fontWeight: "700", marginBottom: "4px" }}>
            {t("settings.title")}
          </h1>
          <p style={{ color: theme.text2, fontSize: "12px" }}>{t("settings.subtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{
                  borderColor: active ? theme.accent : theme.border,
                  backgroundColor: active ? `${theme.accent}18` : theme.bgCard,
                  color: active ? theme.accent2 : theme.text2,
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {section === "general" ? (
            <div
              className="settings-card"
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                padding: "20px",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    backgroundColor: isDarkTheme ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isDarkTheme ? (
                    <Moon size={20} style={{ color: "#2563eb" }} />
                  ) : (
                    <Sun size={20} style={{ color: "#2563eb" }} />
                  )}
                </div>
                <div>
                  <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                    {t("settings.appearance.title")}
                  </h3>
                  <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                    {t("settings.appearance.subtitle")}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    {t("settings.appearance.darkTheme")}
                  </div>
                  <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                    {t("settings.appearance.darkThemeHint")}
                  </div>
                </div>
                <div
                  className={`settings-switch ${isDarkTheme ? "active" : ""}`}
                  onClick={handleThemeToggle}
                  role="switch"
                  aria-checked={isDarkTheme}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleThemeToggle();
                    }
                  }}
                />
              </div>

              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Globe size={18} style={{ color: "#a855f7" }} />
                  <span style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    {t("settings.language.title")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => pickLanguage("ru")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "8px",
                      border: language === "ru" ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    {t("common.russian")}
                  </button>
                  <button
                    type="button"
                    onClick={() => pickLanguage("en")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "8px",
                      border: language === "en" ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      cursor: "pointer",
                    }}
                  >
                    {t("common.english")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {section === "notifications" ? (
            <div
              className="settings-card"
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                padding: "20px",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    backgroundColor: isDarkTheme ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={20} style={{ color: "#22c55e" }} />
                </div>
                <div>
                  <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                    {t("settings.notifications.title")}
                  </h3>
                  <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                    {t("settings.notifications.subtitle")}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(
                  [
                    ["email", "settings.notifications.email", "settings.notifications.emailHint"],
                    ["push", "settings.notifications.push", "settings.notifications.pushHint"],
                    ["assignments", "settings.notifications.assignments", "settings.notifications.assignmentsHint"],
                    ["grades", "settings.notifications.grades", "settings.notifications.gradesHint"],
                  ] as const
                ).map(([key, titleKey, hintKey]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px",
                      backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      borderRadius: "8px",
                    }}
                  >
                    <div>
                      <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>{t(titleKey)}</div>
                      <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>{t(hintKey)}</div>
                    </div>
                    <div
                      className={`settings-switch ${notifications[key] ? "active" : ""}`}
                      onClick={() => toggleNotification(key)}
                    />
                  </div>
                ))}

                {isTeacher ? (
                  <>
                    <p style={{ color: theme.text2, fontSize: "12px", marginTop: "16px", fontWeight: 600 }}>
                      {t("settings.notifications.teacherSection")}
                    </p>
                    {(
                      [
                        ["teacher_pr_submitted", "settings.notifications.teacherPrSubmitted", "settings.notifications.teacherPrSubmittedHint"],
                        ["teacher_pr_stale", "settings.notifications.teacherPrStale", "settings.notifications.teacherPrStaleHint"],
                        ["teacher_deadline_missed", "settings.notifications.teacherDeadlineMissed", "settings.notifications.teacherDeadlineMissedHint"],
                        ["teacher_daily_digest", "settings.notifications.teacherDailyDigest", "settings.notifications.teacherDailyDigestHint"],
                      ] as const
                    ).map(([key, titleKey, hintKey]) => (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px",
                          backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                          borderRadius: "8px",
                        }}
                      >
                        <div>
                          <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>{t(titleKey)}</div>
                          <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>{t(hintKey)}</div>
                        </div>
                        <div
                          className={`settings-switch ${notifications[key] ? "active" : ""}`}
                          onClick={() => toggleNotification(key)}
                        />
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === "security" ? (
            <div
              className="settings-card"
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                padding: "20px",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "8px",
                    backgroundColor: isDarkTheme ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Shield size={20} style={{ color: "#ef4444" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                    {t("settings.security.title")}
                  </h3>
                  <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                    {t("settings.security.subtitle")}
                  </p>
                </div>
                <Link
                  to="/profile"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    backgroundColor: theme.accent,
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "500",
                    textDecoration: "none",
                    transition: "background-color 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#1d4ed8";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = theme.accent;
                  }}
                >
                  {t("common.goTo")}
                </Link>
              </div>
            </div>
          ) : null}

          {section === "git" && isStudent ? <StudentGitTokenSettings isDarkTheme={isDarkTheme} /> : null}
        </div>
      </div>
    </>
  );
}
