import { useState, useEffect } from "react";
import { Moon, Sun, Bell, Globe, User, Shield, LogOut, ChevronRight } from "lucide-react";
import { clearToken } from "../api/client";
import { getMe, invalidateMeCache } from "../api/authApi";
import { getUserSettings, patchUserSettings } from "../api/userSettingsApi";
import { getTheme } from "../theme";

interface SettingsPageProps {
  isDarkTheme?: boolean;
  onToggleTheme?: () => void;
}

export default function SettingsPage({ isDarkTheme = false, onToggleTheme }: SettingsPageProps) {
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    assignments: true,
    grades: true,
  });
  const [language, setLanguage] = useState("ru");
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getUserSettings()
      .then((s) => {
        if (!cancelled) {
          setNotifications(s.notifications);
          setLanguage(s.language);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (settingsLoading) return;
    const t = window.setTimeout(() => {
      void patchUserSettings({ notifications, language }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(t);
  }, [notifications, language, settingsLoading]);

  const theme = getTheme(isDarkTheme);

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
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
      
      <div style={{ backgroundColor: theme.bg, minHeight: "100%", padding: "16px" }}>
        {/* Заголовок */}
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ color: theme.text, fontSize: "24px", fontWeight: "700", marginBottom: "4px" }}>
            Настройки
          </h1>
          <p style={{ color: theme.text2, fontSize: "12px" }}>
            Управление внешним видом и уведомлениями
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Внешний вид */}
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
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: isDarkTheme ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {isDarkTheme ? (
                  <Moon size={20} style={{ color: "#2563eb" }} />
                ) : (
                  <Sun size={20} style={{ color: "#2563eb" }} />
                )}
              </div>
              <div>
                <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Внешний вид
                </h3>
                <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Настройка темы приложения
                </p>
              </div>
            </div>

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px",
              backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              borderRadius: "8px",
            }}>
              <div>
                <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                  Тёмная тема
                </div>
                <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                  Использовать тёмное оформление
                </div>
              </div>
              <div 
                className={`settings-switch ${isDarkTheme ? "active" : ""}`}
                onClick={onToggleTheme}
              />
            </div>
          </div>

          {/* Уведомления */}
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
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: isDarkTheme ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Bell size={20} style={{ color: "#22c55e" }} />
              </div>
              <div>
                <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Уведомления
                </h3>
                <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Управление получением уведомлений
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Email уведомления */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    Email уведомления
                  </div>
                  <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                    Получать уведомления на email
                  </div>
                </div>
                <div 
                  className={`settings-switch ${notifications.email ? "active" : ""}`}
                  onClick={() => toggleNotification("email")}
                />
              </div>

              {/* Push уведомления */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    Push уведомления
                  </div>
                  <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                    Браузерные уведомления
                  </div>
                </div>
                <div 
                  className={`settings-switch ${notifications.push ? "active" : ""}`}
                  onClick={() => toggleNotification("push")}
                />
              </div>

              {/* Уведомления о заданиях */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    Новые задания
                  </div>
                  <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                    Уведомлять о новых заданиях
                  </div>
                </div>
                <div 
                  className={`settings-switch ${notifications.assignments ? "active" : ""}`}
                  onClick={() => toggleNotification("assignments")}
                />
              </div>

              {/* Уведомления об оценках */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: theme.text, fontSize: "14px", fontWeight: "500" }}>
                    Оценки
                  </div>
                  <div style={{ color: theme.text2, fontSize: "11px", marginTop: "2px" }}>
                    Уведомлять о новых оценках
                  </div>
                </div>
                <div 
                  className={`settings-switch ${notifications.grades ? "active" : ""}`}
                  onClick={() => toggleNotification("grades")}
                />
              </div>
            </div>
          </div>

          {/* Язык */}
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
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: isDarkTheme ? "rgba(168, 85, 247, 0.2)" : "rgba(168, 85, 247, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Globe size={20} style={{ color: "#a855f7" }} />
              </div>
              <div>
                <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Язык интерфейса
                </h3>
                <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Выбор языка приложения
                </p>
              </div>
            </div>

            <div style={{
              display: "flex",
              gap: "8px",
            }}>
              <button
                onClick={() => setLanguage("ru")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: language === "ru" ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                  backgroundColor: language === "ru" 
                    ? isDarkTheme ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)"
                    : theme.inputBg,
                  color: theme.text,
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Русский
              </button>
              <button
                onClick={() => setLanguage("en")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: language === "en" ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                  backgroundColor: language === "en"
                    ? isDarkTheme ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)"
                    : theme.inputBg,
                  color: theme.text,
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                English
              </button>
            </div>
          </div>

          {/* Безопасность - ссылка на профиль */}
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
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: isDarkTheme ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Shield size={20} style={{ color: "#ef4444" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Безопасность
                </h3>
                <p style={{ color: theme.text2, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Смена пароля и управление аккаунтом
                </p>
              </div>
              <a
                href="/profile"
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
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#1d4ed8"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = theme.accent}
              >
                Перейти
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
