import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { changeMyPassword, getMe, uploadAvatarWithMode } from "../api/authApi";
import { getMyRepositories } from "../api/repositoriesApi";
import { getMyCommits, getTotalUsers, getLogs } from "../api/adminApi";
import { getTheme } from "../theme";
import type { UserRead, LogEntry } from "../api/types";
import AvatarUploadModal from "../components/AvatarUploadModal";
import { Mail } from "lucide-react";

interface ProfilePageProps {
  isDarkTheme?: boolean;
}

// Helper для форматирования последнего входа
function formatLastLogin(dateStr: string | null): string {
  if (!dateStr) return "—";

  const date = new Date(dateStr);
  const now = new Date();

  // Compare dates in Moscow timezone
  const moscowDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const moscowNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const isToday = moscowDate.getDate() === moscowNow.getDate() &&
                  moscowDate.getMonth() === moscowNow.getMonth() &&
                  moscowDate.getFullYear() === moscowNow.getFullYear();

  const timeStr = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

  if (isToday) {
    return `Сегодня, ${timeStr}`;
  }

  const dateStr_formatted = date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
  return `${dateStr_formatted}, ${timeStr}`;
}

// Helper для форматирования времени действия
function formatActionTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} час${diffHours > 1 ? (diffHours < 5 ? "а" : "ов") : ""} назад`;
  if (diffDays === 1) return "Вчера";
  return `${diffDays} дн${diffDays > 1 ? (diffDays < 5 ? "я" : "ей") : ""} назад`;
}

// Helper для получения описания действия из лога
function getActionDescription(log: LogEntry): { title: string; subtitle: string } {
  const sourceLabels: Record<string, string> = {
    auth: "Авторизация",
    repositories: "Репозитории",
    webhooks: "Webhooks",
    admin: "Админка",
    gitea: "Gitea",
    permissions: "Права доступа",
    courses: "Курсы",
  };

  const title = log.message || sourceLabels[log.source] || log.source;
  const subtitle = log.level === "ERROR" ? "Ошибка" : log.level === "WARNING" ? "Предупреждение" : "Успешно";

  return { title, subtitle };
}


export default function ProfilePage({ isDarkTheme = false }: ProfilePageProps) {
  const [me, setMe] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [stats, setStats] = useState({ repositories: 0, commits: 0, users: 0 });
  const [recentActions, setRecentActions] = useState<LogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsModalOpen(true);
  }

  async function handleUploadConfirm(file: File) {
    setAvatarLoading(true);
    setError(null);
    try {
      const updated = await uploadAvatarWithMode(file, "cover");
      setMe(updated);
      window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: updated }));
      setIsModalOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить аватар");
    } finally {
      setAvatarLoading(false);
    }
  }

  function handleModalClose() {
    setIsModalOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setLoading(true);
      try {
        const [meData, repos, myCommits, totalUsers, logsData] = await Promise.all([
          getMe(),
          getMyRepositories().catch(() => []),
          getMyCommits().catch(() => ({ commits: 0, repositories: 0 })),
          getTotalUsers().catch(() => ({ total_users: 0 })),
          getLogs({ date_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }, { limit: 10, offset: 0 }).catch(() => ({ logs: [], total: 0 })),
        ]);
        if (!cancelled) {
          setMe(meData);
          setStats({
            repositories: repos.length,
            commits: myCommits.commits,
            users: totalUsers.total_users,
          });
          // Filter logs for current user
          const userLogs = logsData.logs.filter(log => log.user_id === meData.id).slice(0, 5);
          setRecentActions(userLogs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadMe();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== repeatNewPassword) {
      setError("Новые пароли не совпадают.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Новый пароль должен быть не короче 8 символов.");
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setRepeatNewPassword("");
      setSuccess("Пароль успешно изменен.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сменить пароль");
    } finally {
      setSaving(false);
    }
  }

  // Бейдж роли
  const roleBadge = me?.role === "admin"
    ? { text: "Администратор", bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }
    : me?.role === "teacher"
    ? { text: "Преподаватель", bg: "rgba(37, 99, 235, 0.2)", color: "#2563eb" }
    : me?.role === "laborant"
    ? { text: "Лаборант", bg: "rgba(168, 85, 247, 0.2)", color: "#a855f7" }
    : { text: "Студент", bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };

  const theme = getTheme(isDarkTheme);

  return (
    <>
    <style>{`
      input::placeholder {
        color: ${isDarkTheme ? "rgba(136, 136, 136, 0.4)" : "rgba(102, 102, 102, 0.6)"} !important;
      }
      button[type="submit"]:hover:not(:disabled) {
        background-color: #1d4ed8 !important;
      }
      button[type="button"]:hover {
        background-color: ${isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} !important;
      }
    `}</style>
    <div style={{ backgroundColor: theme.bg, minHeight: "100%", padding: "16px" }}>
      {/* Заголовок */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ color: theme.text, fontSize: "24px", fontWeight: "700", marginBottom: "4px" }}>
          Профиль
        </h1>
        <p style={{ color: theme.text2, fontSize: "12px" }}>
          Управление аккаунтом и настройки безопасности
        </p>
      </div>

      {loading ? (
        <div style={{ color: theme.text2 }}>Загрузка...</div>
      ) : me ? (
        <>
        {/* Две колонки */}
        <div style={{ display: "grid", gridTemplateColumns: "0.4fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Левая колонка — обёртка */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Блок Профиль */}
            <div style={{
              backgroundColor: theme.bg3,
              border: `1px solid ${theme.border}`,
              borderRadius: "12px",
              padding: "20px 20px 16px 20px"
            }}>
              {/* Шапка профиля — горизонтальный layout */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              {/* Аватар слева — компактный */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: me?.avatar_url ? undefined : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: "600",
                  color: "#fff",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {me?.avatar_url ? (
                  <img
                    src={me.avatar_url}
                    alt={me?.full_name || ""}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  me?.full_name?.charAt(0).toUpperCase()
                )}
                {/* Hover overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                >
                  <span style={{ fontSize: "10px", color: "#fff" }}>Изменить</span>
                </div>
              </div>
              {/* Скрытый input для загрузки */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: "none" }}
              />

              {/* Блок информации справа — вертикально */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {/* Имя */}
                <div style={{ color: theme.text, fontSize: "16px", fontWeight: "600" }}>
                  {me?.full_name}
                </div>

                {/* Email с иконкой */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: theme.text2, fontSize: "12px" }}>
                  <Mail size={12} />
                  {me?.email}
                </div>

                {/* Бейдж роли */}
                <span style={{ 
                  display: "inline-block",
                  padding: "2px 8px", 
                  borderRadius: "9999px", 
                  fontSize: "10px",
                  fontWeight: "500",
                  backgroundColor: roleBadge.bg,
                  color: roleBadge.color,
                  alignSelf: "flex-start"
                }}>
                  {roleBadge.text}
                </span>
              </div>
            </div>

            {/* Горизонтальный разделитель */}
            <div style={{
              height: "1px",
              backgroundColor: theme.border,
              marginBottom: "16px"
            }} />

            {/* Блок статистики — реальные данные */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {/* Репозитории */}
              <div style={{
                backgroundColor: theme.bg4,
                borderRadius: "6px",
                padding: "16px 12px",
                textAlign: "center"
              }}>
                <div style={{ color: theme.text, fontSize: "18px", fontWeight: "700", marginBottom: "2px" }}>
                  {stats.repositories}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {stats.repositories === 1 ? "Репозиторий" : stats.repositories >= 2 && stats.repositories <= 4 ? "Репозитория" : "Репозиториев"}
                </div>
              </div>

              {/* Пользователи — реальные данные */}
              <div style={{
                backgroundColor: theme.bg4,
                borderRadius: "6px",
                padding: "16px 12px",
                textAlign: "center"
              }}>
                <div style={{ color: theme.text, fontSize: "18px", fontWeight: "700", marginBottom: "2px" }}>
                  {stats.users}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {stats.users === 1 ? "Пользователь" : stats.users >= 2 && stats.users <= 4 ? "Пользователя" : "Пользователей"}
                </div>
              </div>

              {/* Коммиты */}
              <div style={{
                backgroundColor: theme.bg4,
                borderRadius: "6px",
                padding: "16px 12px",
                textAlign: "center"
              }}>
                <div style={{ color: theme.text, fontSize: "18px", fontWeight: "700", marginBottom: "2px" }}>
                  {stats.commits}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {stats.commits === 1 ? "Коммит" : stats.commits >= 2 && stats.commits <= 4 && stats.commits !== 0 ? "Коммита" : "Коммитов"}
                </div>
              </div>
            </div>

          </div>

          {/* Блок ИНФОРМАЦИЯ */}
          <div style={{
            backgroundColor: theme.bg3,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            padding: "16px 20px",
          }}>
            {/* Заголовок с 'Только чтение' */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "12px"
            }}>
              <h4 style={{ color: theme.text, fontSize: "12px", fontWeight: "600", margin: 0 }}>
                ИНФОРМАЦИЯ
              </h4>
              <span style={{ color: theme.text2, fontSize: "10px" }}>
                Только чтение
              </span>
            </div>

            {/* Список данных */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Имя */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Имя</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{me?.full_name || "-"}</span>
              </div>

              {/* Email */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Email</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{me?.email || "—"}</span>
              </div>

              {/* Роль */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Роль</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>
                  {me?.role === "admin" ? "Администратор" : "Пользователь"}
                </span>
              </div>

              {/* Дата регистрации */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Дата регистрации</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{me?.created_at ? new Date(me.created_at).toLocaleDateString("ru-RU") : "—"}</span>
              </div>

              {/* Последний вход */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Последний вход</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{formatLastLogin(me?.last_login || null)}</span>
              </div>

              {/* Статус */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0 0 0"
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>Статус</span>
                <span style={{
                  color: me?.is_blocked ? "#ef4444" : "#22c55e",
                  fontSize: "11px",
                  fontWeight: "500"
                }}>
                  {me?.is_blocked ? "Заблокирован" : "Активен"}
                </span>
              </div>
            </div>
          </div>
          </div>

          {/* Правая колонка — обёртка */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Блок Смена пароля */}
            <div style={{
              backgroundColor: theme.bg3,
              border: `1px solid ${theme.border}`,
              borderRadius: "12px",
              padding: "20px"
            }}>
              <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>
                Смена пароля
              </h3>

              <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ color: theme.text2, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Старый пароль
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Введите текущий пароль"
                  style={{
                    width: "100%",
                    backgroundColor: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: "6px",
                    padding: "10px 12px",
                    color: theme.text,
                    fontSize: "12px",
                    outline: "none",
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ color: theme.text2, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  style={{
                    width: "100%",
                    backgroundColor: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: "6px",
                    padding: "10px 12px",
                    color: theme.text,
                    fontSize: "12px",
                    outline: "none",
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ color: theme.text2, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  Повторите новый пароль
                </label>
                <input
                  type="password"
                  value={repeatNewPassword}
                  onChange={(e) => setRepeatNewPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  style={{
                    width: "100%",
                    backgroundColor: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: "6px",
                    padding: "10px 12px",
                    color: theme.text,
                    fontSize: "12px",
                    outline: "none",
                  }}
                  required
                />
              </div>

              {error && (
                <div style={{ 
                  backgroundColor: "rgba(239, 68, 68, 0.1)", 
                  border: "1px solid rgba(239, 68, 68, 0.3)", 
                  borderRadius: "6px", 
                  padding: "8px 12px",
                  color: "#ef4444",
                  fontSize: "12px"
                }}>
                  {error}
                </div>
              )}

              {success && (
                <div style={{ 
                  backgroundColor: "rgba(34, 197, 94, 0.1)", 
                  border: "1px solid rgba(34, 197, 94, 0.3)", 
                  borderRadius: "6px", 
                  padding: "8px 12px",
                  color: "#22c55e",
                  fontSize: "12px"
                }}>
                  {success}
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    backgroundColor: theme.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 20px",
                    fontSize: "12px",
                    fontWeight: "500",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Смена..." : "Сменить пароль"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOldPassword("");
                    setNewPassword("");
                    setRepeatNewPassword("");
                    setError(null);
                    setSuccess(null);
                  }}
                  style={{
                    backgroundColor: "transparent",
                    color: theme.text2,
                    border: `1px solid ${theme.border}`,
                    borderRadius: "6px",
                    padding: "8px 20px",
                    fontSize: "12px",
                    fontWeight: "500",
                    cursor: "pointer",
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>

          {/* Блок Последние действия */}
          <div style={{
            backgroundColor: theme.bg3,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            padding: "16px 20px",
          }}>
            {/* Заголовок */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px"
            }}>
              <h4 style={{ color: theme.text, fontSize: "12px", fontWeight: "600", margin: 0 }}>
                ПОСЛЕДНИЕ ДЕЙСТВИЯ
              </h4>
              <span style={{ color: theme.text2, fontSize: "10px" }}>
                Последние 24 часа
              </span>
            </div>

            {/* Список действий */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentActions.length === 0 ? (
                <div style={{ color: theme.text2, fontSize: "11px", padding: "8px 0" }}>
                  Нет действий за последние 24 часа
                </div>
              ) : (
                recentActions.map((action, index) => {
                  const { title, subtitle } = getActionDescription(action);
                  const isLast = index === recentActions.length - 1;
                  return (
                    <div
                      key={action.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom: isLast ? "none" : `1px solid ${theme.border}`
                      }}
                    >
                      <div>
                        <div style={{ color: theme.text, fontSize: "11px" }}>{title}</div>
                        <div style={{ color: theme.text2, fontSize: "10px" }}>{subtitle}</div>
                      </div>
                      <span style={{ color: theme.text2, fontSize: "10px" }}>
                        {formatActionTime(action.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          </div>
        </div>
        </>
      ) : null}

      {/* Модал аватара */}
      {isModalOpen && (
        <AvatarUploadModal
          file={selectedFile}
          onClose={handleModalClose}
          onConfirm={handleUploadConfirm}
          isUploading={avatarLoading}
        />
      )}
    </div>
    </>
  );
}

