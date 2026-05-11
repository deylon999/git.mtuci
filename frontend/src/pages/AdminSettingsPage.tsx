import { useState, useEffect } from "react";
import { Shield, Users, Database, Bell, Globe, Mail } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";

interface AdminSettingsPageProps {
  isDarkTheme?: boolean;
}

// Цвета по ТЗ
const getColors = (isDarkTheme: boolean) => ({
  pageBg: isDarkTheme ? "#0f0f10" : "#f9fafb",
  cardBg: isDarkTheme ? "#141414" : "#ffffff",
  border: isDarkTheme ? "#30363d" : "#e0e0e0",
  accent: "#2563eb",
  textPrimary: isDarkTheme ? "#e6e6e6" : "#1a1a1a",
  textSecondary: isDarkTheme ? "#888888" : "#666666",
  inputBg: isDarkTheme ? "#0a0a0a" : "#f5f5f5",
  switchBg: isDarkTheme ? "#1f2937" : "#e5e7eb",
  switchActive: "#2563eb",
});

export default function AdminSettingsPage({ isDarkTheme = false }: AdminSettingsPageProps) {
  const [systemSettings, setSystemSettings] = useState(() => {
    const saved = localStorage.getItem("adminSystemSettings");
    return saved ? JSON.parse(saved) : {
      registrationOpen: true,
      requireEmailVerification: true,
      autoApproveUsers: false,
      maintenanceMode: false,
      maxUsers: 1000,
      sessionTimeout: 24,
    };
  });

  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem("adminNotificationSettings");
    return saved ? JSON.parse(saved) : {
      newUsers: true,
      systemErrors: true,
      securityAlerts: true,
      dailyReports: false,
    };
  });

  useEffect(() => {
    localStorage.setItem("adminSystemSettings", JSON.stringify(systemSettings));
  }, [systemSettings]);

  useEffect(() => {
    localStorage.setItem("adminNotificationSettings", JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  const colors = getColors(isDarkTheme);

  return (
    <>
      <style>{`
        .admin-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background-color: ${colors.switchBg};
          border-radius: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .admin-switch.active {
          background-color: ${colors.switchActive};
        }
        .admin-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .admin-switch.active::after {
          transform: translateX(20px);
        }
        .admin-card:hover {
          border-color: ${isDarkTheme ? "#404040" : "#d0d0d0"};
        }
        .admin-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid ${colors.border};
          background-color: ${colors.inputBg};
          color: ${colors.textPrimary};
          font-size: 14px;
          outline: none;
        }
        .admin-input:focus {
          border-color: ${colors.accent};
        }
      `}</style>

      <div style={{ backgroundColor: colors.pageBg, minHeight: "100%", padding: "16px" }}>
        <AdminPageHeader isDarkTheme={isDarkTheme} title="Настройки" />

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Системные настройки */}
          <div 
            className="admin-card"
            style={{
              backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
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
                <Shield size={20} style={{ color: "#2563eb" }} />
              </div>
              <div>
                <h3 style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Системные настройки
                </h3>
                <p style={{ color: colors.textSecondary, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Основные параметры системы
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Регистрация открыта */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Открытая регистрация
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Разрешить новым пользователям регистрироваться
                  </div>
                </div>
                <div 
                  className={`admin-switch ${systemSettings.registrationOpen ? "active" : ""}`}
                  onClick={() => setSystemSettings(prev => ({ ...prev, registrationOpen: !prev.registrationOpen }))}
                />
              </div>

              {/* Требовать верификацию email */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Верификация email
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Требовать подтверждение email при регистрации
                  </div>
                </div>
                <div 
                  className={`admin-switch ${systemSettings.requireEmailVerification ? "active" : ""}`}
                  onClick={() => setSystemSettings(prev => ({ ...prev, requireEmailVerification: !prev.requireEmailVerification }))}
                />
              </div>

              {/* Авто-одобрение пользователей */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Авто-одобрение пользователей
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Автоматически одобрять новых пользователей
                  </div>
                </div>
                <div 
                  className={`admin-switch ${systemSettings.autoApproveUsers ? "active" : ""}`}
                  onClick={() => setSystemSettings(prev => ({ ...prev, autoApproveUsers: !prev.autoApproveUsers }))}
                />
              </div>

              {/* Режим обслуживания */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.05)",
                borderRadius: "8px",
                border: systemSettings.maintenanceMode ? `1px solid ${isDarkTheme ? "rgba(239, 68, 68, 0.3)" : "rgba(239, 68, 68, 0.2)"}` : "none",
              }}>
                <div>
                  <div style={{ color: systemSettings.maintenanceMode ? "#ef4444" : colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Режим обслуживания
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Отключить доступ для обычных пользователей
                  </div>
                </div>
                <div 
                  className={`admin-switch ${systemSettings.maintenanceMode ? "active" : ""}`}
                  onClick={() => setSystemSettings(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
                />
              </div>
            </div>
          </div>

          {/* Пользователи и лимиты */}
          <div 
            className="admin-card"
            style={{
              backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
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
                <Users size={20} style={{ color: "#22c55e" }} />
              </div>
              <div>
                <h3 style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Пользователи и лимиты
                </h3>
                <p style={{ color: colors.textSecondary, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Управление лимитами и сессиями
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ color: colors.textSecondary, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Максимальное количество пользователей
                </label>
                <input
                  type="number"
                  className="admin-input"
                  value={systemSettings.maxUsers}
                  onChange={(e) => setSystemSettings(prev => ({ ...prev, maxUsers: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label style={{ color: colors.textSecondary, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Тайм-аут сессии (часы)
                </label>
                <input
                  type="number"
                  className="admin-input"
                  value={systemSettings.sessionTimeout}
                  onChange={(e) => setSystemSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) || 24 }))}
                />
              </div>
            </div>
          </div>

          {/* Уведомления администратора */}
          <div 
            className="admin-card"
            style={{
              backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
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
                <Bell size={20} style={{ color: "#a855f7" }} />
              </div>
              <div>
                <h3 style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Уведомления администратора
                </h3>
                <p style={{ color: colors.textSecondary, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Настройка системных уведомлений
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Новые пользователи */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Новые пользователи
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Уведомлять о регистрации новых пользователей
                  </div>
                </div>
                <div 
                  className={`admin-switch ${notificationSettings.newUsers ? "active" : ""}`}
                  onClick={() => setNotificationSettings(prev => ({ ...prev, newUsers: !prev.newUsers }))}
                />
              </div>

              {/* Ошибки системы */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Ошибки системы
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Уведомлять о критических ошибках
                  </div>
                </div>
                <div 
                  className={`admin-switch ${notificationSettings.systemErrors ? "active" : ""}`}
                  onClick={() => setNotificationSettings(prev => ({ ...prev, systemErrors: !prev.systemErrors }))}
                />
              </div>

              {/* Оповещения безопасности */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Оповещения безопасности
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Уведомлять о подозрительной активности
                  </div>
                </div>
                <div 
                  className={`admin-switch ${notificationSettings.securityAlerts ? "active" : ""}`}
                  onClick={() => setNotificationSettings(prev => ({ ...prev, securityAlerts: !prev.securityAlerts }))}
                />
              </div>

              {/* Ежедневные отчёты */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                backgroundColor: isDarkTheme ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                borderRadius: "8px",
              }}>
                <div>
                  <div style={{ color: colors.textPrimary, fontSize: "14px", fontWeight: "500" }}>
                    Ежедневные отчёты
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: "11px", marginTop: "2px" }}>
                    Отправлять ежедневный сводный отчёт
                  </div>
                </div>
                <div 
                  className={`admin-switch ${notificationSettings.dailyReports ? "active" : ""}`}
                  onClick={() => setNotificationSettings(prev => ({ ...prev, dailyReports: !prev.dailyReports }))}
                />
              </div>
            </div>
          </div>

          {/* Настройки email */}
          <div 
            className="admin-card"
            style={{
              backgroundColor: colors.cardBg,
              border: `1px solid ${colors.border}`,
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
                backgroundColor: isDarkTheme ? "rgba(234, 179, 8, 0.2)" : "rgba(234, 179, 8, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Mail size={20} style={{ color: "#eab308" }} />
              </div>
              <div>
                <h3 style={{ color: colors.textPrimary, fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  Настройки email
                </h3>
                <p style={{ color: colors.textSecondary, fontSize: "12px", margin: "2px 0 0 0" }}>
                  Конфигурация почтового сервера
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ color: colors.textSecondary, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  SMTP сервер
                </label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="smtp.example.com"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ color: colors.textSecondary, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Порт
                  </label>
                  <input
                    type="number"
                    className="admin-input"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label style={{ color: colors.textSecondary, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                    Отправитель
                  </label>
                  <input
                    type="email"
                    className="admin-input"
                    placeholder="noreply@example.com"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
