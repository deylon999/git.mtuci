import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { changeMyPassword, uploadAvatarWithMode } from "../api/authApi";
import { useAuthUser } from "../context/AuthUserContext";
import {
  getStudentProfileBundleDeduped,
  invalidateStudentProfileBundleDedup,
} from "../api/studentRequestDedup";
import { getMyRepositories } from "../api/repositoriesApi";
import { getMyCommits, getTotalUsers, getLogs } from "../api/adminApi";
import type {
  StudentActivityFeedItem,
  StudentActivitySummary,
  StudentGroupRanking,
} from "../api/studentDashboardApi";
import { getTeacherDashboardFull, getTeacherStudents } from "../api/teacherDashboardApi";
import { getTheme } from "../theme";
import type { UserRead, LogEntry } from "../api/types";
import AvatarUploadModal from "../components/AvatarUploadModal";
import GitAuthPanel from "../components/GitAuthPanel";
import { Mail } from "lucide-react";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { pluralWord } from "../i18n/plural";
import type { Locale } from "../i18n";

interface ProfilePageProps {
  isDarkTheme?: boolean;
}

function formatLastLogin(
  dateStr: string | null,
  tp: (key: string, params?: Record<string, string | number | null | undefined>) => string,
  dateLocale: string,
): string {
  if (!dateStr) return "—";

  const date = new Date(dateStr);
  const now = new Date();
  const moscowDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const moscowNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const isToday =
    moscowDate.getDate() === moscowNow.getDate() &&
    moscowDate.getMonth() === moscowNow.getMonth() &&
    moscowDate.getFullYear() === moscowNow.getFullYear();

  const timeStr = date.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

  if (isToday) {
    return tp("admin.profile.todayAt", { time: timeStr });
  }

  const dateFormatted = date.toLocaleDateString(dateLocale, { timeZone: "Europe/Moscow" });
  return `${dateFormatted}, ${timeStr}`;
}

function formatActionTime(
  dateStr: string,
  t: (key: string) => string,
  tp: (key: string, params?: Record<string, string | number | null | undefined>) => string,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("admin.profile.justNow");
  if (diffMins < 60) return tp("admin.profile.minutesAgo", { n: diffMins });
  if (diffHours < 24) return tp("admin.profile.hoursAgo", { n: diffHours });
  if (diffDays === 1) return t("admin.profile.yesterday");
  return tp("admin.profile.daysAgo", { n: diffDays });
}

function getActionDescription(log: LogEntry, t: (key: string) => string): { title: string; subtitle: string } {
  const sourceLabels: Record<string, string> = {
    auth: t("admin.profile.logAuth"),
    repositories: t("admin.profile.logRepositories"),
    webhooks: t("admin.profile.logWebhooks"),
    admin: t("admin.profile.logAdmin"),
    gitea: "Gitea",
    permissions: t("admin.profile.logPermissions"),
    courses: t("admin.profile.logCourses"),
  };

  const title = log.message || sourceLabels[log.source] || log.source;
  const subtitle =
    log.level === "ERROR"
      ? t("admin.profile.logError")
      : log.level === "WARNING"
        ? t("admin.profile.logWarning")
        : t("admin.profile.logSuccess");

  return { title, subtitle };
}

function roleLabel(role: string | undefined, t: (key: string) => string): string {
  if (role === "admin") return t("admin.profile.roleAdmin");
  if (role === "teacher") return t("admin.profile.roleTeacher");
  if (role === "laborant") return t("admin.profile.roleLaborant");
  if (role === "student") return t("admin.profile.roleStudent");
  return t("admin.profile.roleUser");
}

function countLabel(locale: Locale, prefix: string, n: number): string {
  return pluralWord(locale, `admin.profile.${prefix}`, n);
}


export default function ProfilePage({ isDarkTheme = false }: ProfilePageProps) {
  const { t, tp, language } = useUserPreferences();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const { user: me, loading: authLoading, refreshUser } = useAuthUser();
  const [roleDataLoading, setRoleDataLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [studentBundleError, setStudentBundleError] = useState<string | null>(null);
  const [studentBundleLoading, setStudentBundleLoading] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [stats, setStats] = useState({ repositories: 0, commits: 0, users: 0 });
  const [recentActions, setRecentActions] = useState<LogEntry[]>([]);
  const [studentSummary, setStudentSummary] = useState<StudentActivitySummary | null>(null);
  const [studentFeed, setStudentFeed] = useState<StudentActivityFeedItem[]>([]);
  const [groupRanking, setGroupRanking] = useState<StudentGroupRanking | null>(null);
  const [teacherDepartment, setTeacherDepartment] = useState<string | null>(null);
  const [teacherAverageGrade, setTeacherAverageGrade] = useState<number | null>(null);
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
    try {
      const updated = await uploadAvatarWithMode(file, "cover");
      await refreshUser({ force: true });
      window.dispatchEvent(new CustomEvent("avatarUpdated", { detail: updated }));
      setIsModalOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setStudentBundleError(err instanceof Error ? err.message : t("admin.profile.avatarLoadError"));
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

  const loadStudentBundle = async (force = false) => {
    setStudentBundleLoading(true);
    setStudentBundleError(null);
    try {
      if (force) invalidateStudentProfileBundleDedup();
      const bundle = await getStudentProfileBundleDeduped(8);
      const summary = bundle.activity_summary;
      setStats({
        repositories: bundle.repositories_stats.total,
        commits: summary.commits,
        users: summary.submitted,
      });
      setStudentSummary(summary);
      setStudentFeed(bundle.activity_feed);
      setGroupRanking(bundle.group_ranking);
      setRecentActions([]);
    } catch (err) {
      setStudentBundleError(err instanceof Error ? err.message : t("student.errors.loadProfile"));
      setStudentSummary(null);
      setStudentFeed([]);
      setGroupRanking(null);
      setStats({ repositories: 0, commits: 0, users: 0 });
    } finally {
      setStudentBundleLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !me) return;
    let cancelled = false;

    async function loadRoleData() {
      setRoleDataLoading(true);
      try {
        if (me.role === "teacher" || me.role === "laborant") {
          const [dash, studentsSummary] = await Promise.all([
            getTeacherDashboardFull().catch(() => null),
            getTeacherStudents(1).catch(() => null),
          ]);
          if (!cancelled && dash) {
            const prefs = me?.preferences as Record<string, unknown> | undefined;
            const deptFromPrefs =
              typeof prefs?.department === "string"
                ? prefs.department
                : typeof prefs?.department_name === "string"
                  ? prefs.department_name
                  : null;
            setTeacherDepartment(dash.department ?? deptFromPrefs);
            setTeacherAverageGrade(studentsSummary?.average_grade ?? null);
            setStats({
              repositories: dash.active_courses_count,
              commits: dash.pending_grading,
              users: dash.students_total,
            });
            setRecentActions([]);
          }
        } else if (me.role === "student") {
          await loadStudentBundle();
        } else {
          const [repos, myCommits, totalUsers, logsData] = await Promise.all([
            getMyRepositories().catch(() => []),
            getMyCommits().catch(() => ({ commits: 0, repositories: 0 })),
            getTotalUsers().catch(() => ({ total_users: 0 })),
            getLogs(
              { date_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
              { limit: 10, offset: 0 },
            ).catch(() => ({ logs: [], total: 0 })),
          ]);
          if (!cancelled) {
            setStats({
              repositories: repos.length,
              commits: myCommits.commits,
              users: totalUsers.total_users,
            });
            const userLogs = logsData.logs.filter((log) => log.user_id === me.id).slice(0, 5);
            setRecentActions(userLogs);
            setStudentSummary(null);
            setStudentFeed([]);
            setGroupRanking(null);
          }
        }
      } finally {
        if (!cancelled) setRoleDataLoading(false);
      }
    }

    void loadRoleData();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me?.id, me?.role]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setSuccess(null);

    if (newPassword !== repeatNewPassword) {
      setPasswordError(t("admin.profile.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t("admin.profile.passwordTooShort"));
      return;
    }
    if (oldPassword === newPassword) {
      setPasswordError(t("admin.profile.passwordSameAsOld"));
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setRepeatNewPassword("");
      setSuccess(t("admin.profile.passwordChanged"));
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t("admin.profile.passwordChangeError"));
    } finally {
      setSaving(false);
    }
  }

  const isStudent = me?.role === "student";
  const isTeacher = me?.role === "teacher" || me?.role === "laborant";
  const loading = authLoading || roleDataLoading;
  const studentStatsReady =
    isStudent && !studentBundleError && !studentBundleLoading && studentSummary != null;
  const statDisplay = (value: number, ready = true) =>
    isStudent && !ready ? "—" : String(value);

  const roleBadge = me?.role === "admin"
    ? { text: t("admin.profile.roleAdmin"), bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }
    : me?.role === "teacher"
    ? { text: t("admin.profile.roleTeacher"), bg: "rgba(37, 99, 235, 0.2)", color: "#2563eb" }
    : me?.role === "laborant"
    ? { text: t("admin.profile.roleLaborant"), bg: "rgba(168, 85, 247, 0.2)", color: "#a855f7" }
    : { text: t("admin.profile.roleStudent"), bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };

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
          {t("admin.profile.title")}
        </h1>
        <p style={{ color: theme.text2, fontSize: "12px" }}>
          {t("admin.profile.subtitle")}
        </p>
      </div>

      {loading ? (
        <div style={{ color: theme.text2 }}>{t("common.loading")}</div>
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
                  <span style={{ fontSize: "10px", color: "#fff" }}>{t("admin.profile.editAvatar")}</span>
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
                  {statDisplay(stats.repositories, !isStudent || studentStatsReady)}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {isTeacher
                    ? t("admin.profile.coursesMany")
                    : countLabel(language, "repo", stats.repositories)}
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
                  {isStudent
                    ? statDisplay(studentSummary?.submitted ?? stats.users, studentStatsReady)
                    : stats.users}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {isStudent
                    ? t("admin.profile.worksSubmitted")
                    : isTeacher
                      ? t("admin.profile.studentsMany")
                      : countLabel(language, "user", stats.users)}
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
                  {isStudent
                    ? statDisplay(studentSummary?.commits ?? stats.commits, studentStatsReady)
                    : stats.commits}
                </div>
                <div style={{ color: theme.text2, fontSize: "10px" }}>
                  {isTeacher
                    ? t("admin.profile.pendingReview")
                    : countLabel(language, "commit", stats.commits)}
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
                {t("admin.profile.infoSection")}
              </h4>
              <span style={{ color: theme.text2, fontSize: "10px" }}>
                {t("admin.profile.readOnly")}
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
                <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.fieldName")}</span>
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
                <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.fieldRole")}</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>
                  {roleLabel(me?.role, t)}
                </span>
              </div>

              {isTeacher ? (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${theme.border}`,
                }}>
                  <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.fieldDepartment")}</span>
                  <span style={{ color: theme.text, fontSize: "11px" }}>
                    {teacherDepartment?.trim() || "—"}
                  </span>
                </div>
              ) : null}

              {isTeacher && teacherAverageGrade != null ? (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${theme.border}`,
                }}>
                  <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.fieldAvgGrade")}</span>
                  <span style={{ color: theme.text, fontSize: "11px" }}>{teacherAverageGrade}</span>
                </div>
              ) : null}

              {/* Дата регистрации */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.registeredAt")}</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{me?.created_at ? new Date(me.created_at).toLocaleDateString(dateLocale) : "—"}</span>
              </div>

              {/* Последний вход */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: "8px 0",
                borderBottom: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.lastLogin")}</span>
                <span style={{ color: theme.text, fontSize: "11px" }}>{formatLastLogin(me?.last_login || null, tp, dateLocale)}</span>
              </div>

              {/* Статус */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0 0 0"
              }}>
                <span style={{ color: theme.text2, fontSize: "11px" }}>{t("admin.profile.fieldStatus")}</span>
                <span style={{
                  color: me?.is_blocked ? "#ef4444" : "#22c55e",
                  fontSize: "11px",
                  fontWeight: "500"
                }}>
                  {me?.is_blocked ? t("admin.profile.statusBlocked") : t("admin.profile.statusActive")}
                </span>
              </div>
            </div>
          </div>

          {isStudent && groupRanking ? (
            <div
              style={{
                backgroundColor: theme.bg3,
                border: `1px solid ${theme.border}`,
                borderRadius: "12px",
                padding: "16px 20px",
              }}
            >
              <h4 style={{ color: theme.text, fontSize: "12px", fontWeight: "600", margin: "0 0 8px 0" }}>
                {t("admin.profile.groupRankingTitle")} {groupRanking.group_name ? `· ${groupRanking.group_name}` : ""}
              </h4>
              {groupRanking.your_place != null ? (
                <p style={{ color: theme.text2, fontSize: "11px", marginBottom: "8px" }}>
                  {t("admin.profile.groupPlace")}: <strong style={{ color: theme.text }}>{groupRanking.your_place}</strong>
                  {groupRanking.your_points != null ? ` · ${groupRanking.your_points} ${t("admin.profile.groupPoints")}` : ""}
                  {groupRanking.top_percent_label ? ` · ${groupRanking.top_percent_label}` : ""}
                </p>
              ) : (
                <p style={{ color: theme.text2, fontSize: "11px", marginBottom: "8px" }}>
                  {t("admin.profile.rankingUnavailable")}
                </p>
              )}
              {groupRanking.entries.slice(0, 5).map((e) => (
                <div
                  key={e.student_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    padding: "3px 0",
                    color: e.is_you ? theme.accent2 : theme.text2,
                    fontWeight: e.is_you ? 600 : 400,
                  }}
                >
                  <span>
                    {e.place}. {e.name}
                  </span>
                  <span>{e.points}</span>
                </div>
              ))}
            </div>
          ) : null}
          </div>

          {/* Правая колонка — обёртка */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {isStudent && studentBundleError ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: theme.danger,
                  fontSize: "12px",
                }}
              >
                <span style={{ flex: "1 1 200px" }}>{studentBundleError}</span>
                <button
                  type="button"
                  onClick={() => void loadStudentBundle(true)}
                  disabled={studentBundleLoading}
                  style={{
                    border: `1px solid ${theme.danger}`,
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 500,
                    backgroundColor: "transparent",
                    color: theme.danger,
                    cursor: studentBundleLoading ? "wait" : "pointer",
                    opacity: studentBundleLoading ? 0.6 : 1,
                  }}
                >
                  {t("common.refresh")}
                </button>
              </div>
            ) : null}
            {/* Блок Смена пароля */}
          <div style={{
            backgroundColor: theme.bg3,
            border: `1px solid ${theme.border}`,
            borderRadius: "12px",
            padding: "20px"
          }}>
              <h3 style={{ color: theme.text, fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>
                {t("admin.profile.changePasswordTitle")}
              </h3>

              <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ color: theme.text2, fontSize: "12px", display: "block", marginBottom: "4px" }}>
                  {t("admin.profile.oldPasswordLabel")}
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder={t("admin.profile.currentPassword")}
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
                  {t("admin.profile.newPasswordLabel")}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("admin.profile.newPasswordMin")}
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
                  {t("admin.profile.repeatPassword")}
                </label>
                <input
                  type="password"
                  value={repeatNewPassword}
                  onChange={(e) => setRepeatNewPassword(e.target.value)}
                  placeholder={t("admin.profile.repeatPassword")}
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

              {passwordError ? (
                <div style={{ 
                  backgroundColor: "rgba(239, 68, 68, 0.1)", 
                  border: "1px solid rgba(239, 68, 68, 0.3)", 
                  borderRadius: "6px", 
                  padding: "8px 12px",
                  color: "#ef4444",
                  fontSize: "12px"
                }}>
                  {passwordError}
                </div>
              ) : null}

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
                  {saving ? t("admin.profile.changingPassword") : t("admin.profile.changePassword")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOldPassword("");
                    setNewPassword("");
                    setRepeatNewPassword("");
                    setPasswordError(null);
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
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>

          <GitAuthPanel isDarkTheme={isDarkTheme} />

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
                {isStudent ? t("admin.profile.activitySection") : t("admin.profile.actionsSection")}
              </h4>
              <span style={{ color: theme.text2, fontSize: "10px" }}>
                {isStudent ? t("admin.profile.activityFeed") : t("admin.profile.last24h")}
              </span>
            </div>

            {/* Список действий */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {isStudent ? (
                studentBundleLoading ? (
                  <div style={{ color: theme.text2, fontSize: "11px", padding: "8px 0" }}>
                    {t("common.loading")}
                  </div>
                ) : studentBundleError ? (
                  <div style={{ color: theme.text2, fontSize: "11px", padding: "8px 0" }}>
                    {t("student.errors.loadProfile")}
                  </div>
                ) : studentFeed.length === 0 ? (
                  <div style={{ color: theme.text2, fontSize: "11px", padding: "8px 0" }}>
                    {t("admin.profile.noEvents")}
                  </div>
                ) : (
                  studentFeed.map((item, index) => {
                    const isLast = index === studentFeed.length - 1;
                    const row = (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "8px",
                          padding: "8px 0",
                          borderBottom: isLast ? "none" : `1px solid ${theme.border}`,
                        }}
                      >
                        <div style={{ fontSize: "11px", color: theme.text }}>
                          {item.text}
                          {item.bold ? <strong style={{ color: theme.accent2 }}> {item.bold}</strong> : null}
                          {item.text_after ?? ""}
                        </div>
                        <span style={{ color: theme.text2, fontSize: "10px", whiteSpace: "nowrap" }}>
                          {item.time_label}
                        </span>
                      </div>
                    );
                    return item.href ? (
                      <Link key={item.id} to={item.href} style={{ textDecoration: "none", color: "inherit" }}>
                        {row}
                      </Link>
                    ) : (
                      <div key={item.id}>{row}</div>
                    );
                  })
                )
              ) : recentActions.length === 0 ? (
                <div style={{ color: theme.text2, fontSize: "11px", padding: "8px 0" }}>
                  {t("admin.profile.noActions24h")}
                </div>
              ) : (
                recentActions.map((action, index) => {
                  const { title, subtitle } = getActionDescription(action, t);
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
                        {formatActionTime(action.created_at, t, tp)}
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

