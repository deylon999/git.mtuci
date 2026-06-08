import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock,
  Edit3,
  GitFork,
  Lock,
  UserRound,
} from "lucide-react";
import { changeMyPassword, uploadAvatarWithMode } from "../api/authApi";
import { getLogs, getMyCommits, getRecentActivity, getTotalUsers, type ActivityItem } from "../api/adminApi";
import { getMyRepositories, type Repository } from "../api/repositoriesApi";
import {
  getStudentGrades,
  getStudentRepoCommits,
  getStudentRepositories,
  type StudentActivityFeedItem,
  type StudentGradeCourse,
  type StudentActivitySummary,
  type StudentGroupRanking,
  type StudentRepoRecentCommit,
  type StudentRepositoryItem,
  type StudentRepositoriesStats,
} from "../api/studentDashboardApi";
import {
  getStudentProfileBundleDeduped,
  invalidateStudentProfileBundleDedup,
} from "../api/studentRequestDedup";
import { getTeacherDashboardFull, getTeacherStudents } from "../api/teacherDashboardApi";
import AvatarUploadModal from "../components/AvatarUploadModal";
import GitAuthPanel from "../components/GitAuthPanel";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";
import type { LogEntry, UserRead } from "../api/types";

interface ProfilePageProps {
  isDarkTheme?: boolean;
}

type ProfileTab = "repos" | "activity" | "prs";

interface ProfileRepo {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  visibility: string;
  commits: number | null;
  forks: number | null;
  updatedAt: string | null;
  href: string;
  badge?: string | null;
}

interface ProfileStats {
  repositories: number;
  commits: number;
  commitsWeek: number;
  courses: number;
  assignments: number;
  progress: number;
  users: number;
  prsOpen: number;
  submitted: number;
  inReview: number;
}

interface CommitGraphDay {
  count: number;
  date: string;
}

interface CommitGraphEvent {
  timestamp: string | null;
}

interface ProfileCourseRow {
  id: string;
  title: string;
  sub: string;
  score: string;
  progress: number;
  color: string;
  scoreLabel: string;
}

const emptyStats: ProfileStats = {
  repositories: 0,
  commits: 0,
  commitsWeek: 0,
  courses: 0,
  assignments: 0,
  progress: 0,
  users: 0,
  prsOpen: 0,
  submitted: 0,
  inReview: 0,
};

const languageColors: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  "c++": "#f34b7d",
  c: "#555555",
  java: "#b07219",
  go: "#00ADD8",
  rust: "#dea584",
};

function initials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "П";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function roleLabel(role?: string | null): string {
  if (role === "admin") return "Администратор";
  if (role === "teacher") return "Преподаватель";
  if (role === "laborant") return "Лаборант";
  if (role === "student") return "Студент";
  return "Пользователь";
}

function roleBadgeClass(role?: string | null): string {
  if (role === "admin") return "badge-red";
  if (role === "teacher") return "badge-blue";
  if (role === "laborant") return "badge-purple";
  return "badge-green";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelative(value?: string | null): string {
  if (!value) return "недавно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "недавно";
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "только что";
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} мин назад`;
  if (diff < day) return `${Math.floor(diff / hour)} ч назад`;
  if (diff < day * 7) return `${Math.floor(diff / day)} дн назад`;
  return formatDate(value);
}

function languageColor(language?: string | null): string {
  if (!language) return "#6b7280";
  return languageColors[language.toLowerCase()] ?? "#60a5fa";
}

function courseAbbr(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "К";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

function courseProgressColor(percent: number | null | undefined): string {
  if (percent == null) return "#94a3b8";
  if (percent >= 75) return "#4caf50";
  if (percent >= 40) return "#60a5fa";
  return "#f59e0b";
}

function formatScoreValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function mapStudentGradeCourse(course: StudentGradeCourse): ProfileCourseRow {
  const percent = course.percent ?? (course.max_points > 0 ? (course.earned_points / course.max_points) * 100 : null);
  const earned = formatScoreValue(course.earned_points);
  const max = formatScoreValue(course.max_points || course.grade_max || 0);
  return {
    id: course.course_id,
    title: course.title,
    sub: course.teacher_name ? course.teacher_name : `${course.assignments_submitted}/${course.assignments_total} работ`,
    score: `${earned}/${max}`,
    progress: Math.max(0, Math.min(100, Math.round(percent ?? 0))),
    color: courseProgressColor(percent),
    scoreLabel: "баллов",
  };
}

function mapTeacherCourse(course: { course_id: string; title: string; students_count: number; assignments_count: number; pending_count: number }): ProfileCourseRow {
  const progress = course.assignments_count > 0
    ? Math.max(0, Math.min(100, Math.round(((course.assignments_count - course.pending_count) / course.assignments_count) * 100)))
    : 0;
  return {
    id: course.course_id,
    title: course.title,
    sub: `${course.students_count} студентов, ${course.assignments_count} заданий`,
    score: course.pending_count ? String(course.pending_count) : "0",
    progress,
    color: course.pending_count ? "#f59e0b" : "#4caf50",
    scoreLabel: "на ревью",
  };
}

function mapRepository(repo: Repository): ProfileRepo {
  return {
    id: repo.id,
    name: repo.gitea_repo_name || repo.name,
    description: repo.description,
    language: null,
    visibility: "private",
    commits: null,
    forks: null,
    updatedAt: repo.updated_at,
    href: `/repositories/${repo.id}`,
  };
}

function mapStudentRepository(repo: StudentRepositoryItem): ProfileRepo {
  return {
    id: repo.repository_id || repo.id,
    name: repo.gitea_path || repo.name,
    description: repo.description,
    language: repo.language,
    visibility: repo.visibility,
    commits: repo.commits_count,
    forks: repo.forks_count,
    updatedAt: repo.updated_at,
    href: repo.repository_id ? `/repositories/${repo.repository_id}` : "/repositories",
    badge: repo.source === "assignment" ? repo.assignment_label || "Курсовой" : null,
  };
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatGraphDate(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function buildCommitWeeks(events: CommitGraphEvent[]): CommitGraphDay[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = addDays(today, -363);
  const counts = new Map<string, number>();

  for (const event of events) {
    if (!event.timestamp) continue;
    const date = new Date(event.timestamp);
    if (Number.isNaN(date.getTime())) continue;
    date.setHours(0, 0, 0, 0);
    if (date < start || date > today) continue;
    const key = dateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 52 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const day = addDays(start, weekIndex * 7 + dayIndex);
      const key = dateKey(day);
      return { count: counts.get(key) ?? 0, date: key };
    }),
  );
}

function feedDotClass(type: StudentActivityFeedItem["type"] | string): string {
  if (type === "commit" || type === "success") return "feed-success";
  if (type === "deadline") return "feed-warning";
  if (type === "pr") return "feed-accent";
  return "feed-muted";
}

export default function ProfilePage({ isDarkTheme = true }: ProfilePageProps) {
  const navigate = useNavigate();
  const { t } = useUserPreferences();
  const { user: me, loading: authLoading, refreshUser } = useAuthUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats>(emptyStats);
  const [repos, setRepos] = useState<ProfileRepo[]>([]);
  const [studentSummary, setStudentSummary] = useState<StudentActivitySummary | null>(null);
  const [studentFeed, setStudentFeed] = useState<StudentActivityFeedItem[]>([]);
  const [groupRanking, setGroupRanking] = useState<StudentGroupRanking | null>(null);
  const [recentActions, setRecentActions] = useState<LogEntry[]>([]);
  const [courseRows, setCourseRows] = useState<ProfileCourseRow[]>([]);
  const [commitEvents, setCommitEvents] = useState<CommitGraphEvent[]>([]);
  const [commitGraphTotal, setCommitGraphTotal] = useState(0);
  const [teacherDepartment, setTeacherDepartment] = useState<string | null>(null);
  const [teacherAverageGrade, setTeacherAverageGrade] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("repos");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isStudent = me?.role === "student";
  const isTeacherLike = me?.role === "teacher" || me?.role === "laborant";
  const showGroupRanking = Boolean(isStudent && (me?.group_name || groupRanking?.group_name));
  const commitWeeks = useMemo(() => buildCommitWeeks(commitEvents), [commitEvents]);
  const displayedCommitsTotal = commitGraphTotal || stats.commits;
  const displayedCommitsWeek = useMemo(() => {
    if (commitEvents.length === 0) return stats.commitsWeek;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return commitEvents.filter((event) => {
      if (!event.timestamp) return false;
      const date = new Date(event.timestamp);
      return !Number.isNaN(date.getTime()) && date >= weekAgo;
    }).length;
  }, [commitEvents, stats.commitsWeek]);
  const prFeed = studentFeed.filter((item) => item.type === "pr");

  async function loadCommitGraphData(userId: string) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 364);
    const filters = { dateFrom: dateFrom.toISOString(), userId };
    const loaded: ActivityItem[] = [];
    let total = 0;

    for (const activityType of ["commit", "push"]) {
      let offset = 0;
      const limit = 100;
      for (let page = 0; page < 10; page += 1) {
        const response = await getRecentActivity(limit, offset, { ...filters, activityType });
        loaded.push(...response.activities);
        if (page === 0) total += response.total;
        if (response.activities.length < limit || offset + limit >= response.total) break;
        offset += limit;
      }
    }

    setCommitEvents(loaded);
    setCommitGraphTotal(total || loaded.length);
  }

  async function loadStudentCommitGraphData(repositories: StudentRepositoryItem[], userId: string) {
    const candidates = repositories.filter((repo) => repo.id).slice(0, 20);
    if (candidates.length === 0) {
      await loadCommitGraphData(userId);
      return;
    }

    const responses = await Promise.allSettled(
      candidates.flatMap((repo) => [
        getStudentRepoCommits(repo.id, undefined, 1, 50),
        getStudentRepoCommits(repo.id, undefined, 2, 50),
      ]),
    );
    const commits: StudentRepoRecentCommit[] = [];

    for (const response of responses) {
      if (response.status !== "fulfilled") continue;
      commits.push(...response.value.commits);
    }

    if (commits.length === 0) {
      await loadCommitGraphData(userId);
      return;
    }

    setCommitEvents(commits.map((commit) => ({ timestamp: commit.committed_at })));
    setCommitGraphTotal(commits.length);
  }

  async function loadStudentData() {
    const [bundle, repoResponse, gradesResponse] = await Promise.all([
      getStudentProfileBundleDeduped(8),
      getStudentRepositories("lite").catch(() => null),
      getStudentGrades(200).catch(() => null),
    ]);
    const summary = bundle.activity_summary;
    const repoStats: StudentRepositoriesStats = repoResponse?.stats ?? bundle.repositories_stats;
    const gradeCourses = gradesResponse?.courses ?? [];
    setStats({
      repositories: repoStats.total,
      commits: repoStats.total_commits || summary.commits,
      commitsWeek: repoStats.commits_week,
      courses: gradeCourses.length || repoStats.course_count,
      assignments: summary.submitted,
      progress: summary.week_progress_percent,
      users: summary.submitted,
      prsOpen: summary.prs_open,
      submitted: summary.submitted,
      inReview: summary.in_review,
    });
    const studentRepositories = repoResponse?.repositories ?? [];
    setRepos(studentRepositories.slice(0, 6).map(mapStudentRepository));
    setStudentSummary(summary);
    setStudentFeed(bundle.activity_feed);
    setGroupRanking(bundle.group_ranking);
    setCourseRows(gradeCourses.slice(0, 4).map(mapStudentGradeCourse));
    setRecentActions([]);
    if (me?.id) {
      await loadStudentCommitGraphData(studentRepositories, me.id).catch(() => {
        setCommitEvents([]);
        setCommitGraphTotal(0);
      });
    }
  }

  async function loadRoleData(force = false) {
    if (!me) return;
    setLoading(true);
    setLoadError(null);
    try {
      if (me.role === "student") {
        if (force) invalidateStudentProfileBundleDedup();
        await loadStudentData();
      } else if (me.role === "teacher" || me.role === "laborant") {
        const [dash, studentsSummary, ownRepos] = await Promise.all([
          getTeacherDashboardFull().catch(() => null),
          getTeacherStudents(1).catch(() => null),
          getMyRepositories().catch(() => []),
          loadCommitGraphData(me.id).catch(() => {
            setCommitEvents([]);
            setCommitGraphTotal(0);
          }),
        ]);
        setTeacherDepartment(dash?.department ?? null);
        setTeacherAverageGrade(studentsSummary?.average_grade ?? null);
        setCourseRows((dash?.courses ?? []).slice(0, 4).map(mapTeacherCourse));
        setRepos(ownRepos.slice(0, 6).map(mapRepository));
        setStats({
          ...emptyStats,
          repositories: ownRepos.length,
          commits: dash?.pending_grading ?? 0,
          commitsWeek: dash?.pending_grading ?? 0,
          courses: dash?.active_courses_count ?? 0,
          assignments: dash?.pending_grading ?? 0,
          users: dash?.students_total ?? 0,
          progress: studentsSummary?.average_grade ?? 0,
        });
        setStudentSummary(null);
        setStudentFeed([]);
        setGroupRanking(null);
        setRecentActions([]);
      } else {
        const [ownRepos, myCommits, totalUsers, logsData] = await Promise.all([
          getMyRepositories().catch(() => []),
          getMyCommits().catch(() => ({ commits: 0, repositories: 0 })),
          getTotalUsers().catch(() => ({ total_users: 0 })),
          getLogs(
            { date_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
            { limit: 10, offset: 0 },
          ).catch(() => ({ logs: [], total: 0 })),
          loadCommitGraphData(me.id).catch(() => {
            setCommitEvents([]);
            setCommitGraphTotal(0);
          }),
        ]);
        setRepos(ownRepos.slice(0, 6).map(mapRepository));
        setStats({
          ...emptyStats,
          repositories: ownRepos.length,
          commits: myCommits.commits,
          commitsWeek: myCommits.commits,
          users: totalUsers.total_users,
          progress: totalUsers.total_users > 0 ? 100 : 0,
        });
        setRecentActions(logsData.logs.filter((log) => log.user_id === me.id).slice(0, 8));
        setCourseRows([]);
        setStudentSummary(null);
        setStudentFeed([]);
        setGroupRanking(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !me) return;
    void loadRoleData();
  }, [authLoading, me?.id, me?.role]);

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsModalOpen(true);
  }

  async function onAvatarConfirm(file: File) {
    setAvatarLoading(true);
    try {
      const updated = await uploadAvatarWithMode(file, "cover");
      await refreshUser({ force: true });
      window.dispatchEvent(new CustomEvent("avatarUpdated", { detail: updated }));
      setIsModalOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить аватар");
    } finally {
      setAvatarLoading(false);
    }
  }

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setSuccess(null);
    if (newPassword !== repeatNewPassword) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Пароль должен быть не короче 8 символов");
      return;
    }
    if (oldPassword === newPassword) {
      setPasswordError("Новый пароль совпадает со старым");
      return;
    }
    setSaving(true);
    try {
      await changeMyPassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setRepeatNewPassword("");
      setSuccess("Пароль изменён");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Не удалось изменить пароль");
    } finally {
      setSaving(false);
    }
  }

  const profileName = me?.full_name || me?.email || "Профиль";
  const loginLine = [me?.mtuci_login, me?.email].filter(Boolean).join(" · ");
  const avatarUrl = me?.avatar_url ? `${me.avatar_url}?t=${Date.now()}` : null;

  return (
    <div className="profile-html-page" data-theme={isDarkTheme ? "dark" : "light"}>
      <style>{profileStyles}</style>

      {authLoading || loading ? (
        <div className="card loading-card">{t("common.loading")}</div>
      ) : me ? (
        <>
          <div className="breadcrumb">
            <Link to="/dashboard">Главное</Link>
            <span>/</span>
            <span>{profileName}</span>
          </div>

          {loadError ? (
            <div className="error-box">
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadRoleData(true)}>Повторить</button>
            </div>
          ) : null}

          <section className="profile-header">
            <button className="profile-avatar" type="button" onClick={() => fileInputRef.current?.click()} title="Изменить аватар">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(profileName)}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarChange} style={{ display: "none" }} />

            <div className="profile-info">
              <div className="profile-name-row">
                <h1 className="profile-name">{profileName}</h1>
                <span className={`badge ${roleBadgeClass(me.role)}`}>{roleLabel(me.role)}</span>
                <span className={`badge ${me.is_blocked ? "badge-red" : "badge-green"}`}>
                  {me.is_blocked ? "Заблокирован" : "Активен"}
                </span>
              </div>
              <div className="profile-login">{loginLine || "логин не указан"}</div>
              <div className="profile-meta">
                <MetaItem icon={<CalendarDays />}>Зарегистрирован {formatDate(me.created_at)}</MetaItem>
                {me.group_name ? <MetaItem icon={<UserRound />}>Группа {me.group_name}</MetaItem> : null}
                <MetaItem icon={<Clock />}>Сейчас онлайн</MetaItem>
                <MetaItem icon={<GitFork />}>{stats.repositories} репозиториев</MetaItem>
              </div>
            </div>

            <div className="profile-actions">
              <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>
                <Edit3 />
                Аватар
              </button>
              <button className="btn btn-danger" type="button" disabled>
                <Lock />
                {me.is_blocked ? "Заблокирован" : "Блокировка"}
              </button>
            </div>
          </section>

          <section className="stats-row">
            <StatBox delta={displayedCommitsWeek ? `+${displayedCommitsWeek} за неделю` : "за последний год"} label="Коммитов всего" value={displayedCommitsTotal} />
            <StatBox delta={isStudent ? "включая учебные" : "личные и рабочие"} label="Репозиториев" value={stats.repositories} />
            <StatBox
              delta={isTeacherLike ? `${stats.assignments} на проверке` : `${stats.assignments} заданий`}
              label={isTeacherLike ? "Активных курсов" : "Активных курса"}
              value={isTeacherLike ? stats.courses : Math.max(stats.courses, 0)}
            />
            <StatBox
              progress={Math.max(0, Math.min(100, Math.round(stats.progress || 0)))}
              label={isTeacherLike ? "Средняя оценка" : "Средний прогресс"}
              value={`${Math.max(0, Math.min(100, Math.round(stats.progress || 0)))}%`}
              tone="success"
            />
          </section>

          <section className="content-grid">
            <div className="main-column">
              <CommitGraph total={commitGraphTotal} weeks={commitWeeks} />

              <div className="card">
                <div className="tabs">
                  <Tab active={activeTab === "repos"} count={repos.length} onClick={() => setActiveTab("repos")}>Репозитории</Tab>
                  <Tab
                    active={activeTab === "activity"}
                    count={isStudent ? studentFeed.length : recentActions.length}
                    onClick={() => setActiveTab("activity")}
                  >
                    Активность
                  </Tab>
                  <Tab active={activeTab === "prs"} count={isStudent ? prFeed.length : stats.prsOpen} onClick={() => setActiveTab("prs")}>Pull Requests</Tab>
                </div>

                {activeTab === "repos" ? (
                  <div>
                    {repos.length === 0 ? <EmptyLine text="Репозитории пока не найдены" /> : null}
                    {repos.map((repo) => <RepositoryRow key={repo.id} repo={repo} onOpen={() => navigate(repo.href)} />)}
                    {repos.length > 0 ? (
                      <div className="card-more">
                        <Link to="/repositories">Показать все репозитории →</Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "activity" ? (
                  <div>
                    {isStudent ? (
                      studentFeed.length === 0 ? <EmptyLine text="Активность пока не найдена" /> : studentFeed.map((item) => <FeedRow key={item.id} item={item} />)
                    ) : recentActions.length === 0 ? (
                      <EmptyLine text="За последние 24 часа действий нет" />
                    ) : (
                      recentActions.map((log) => <LogRow key={log.id} log={log} />)
                    )}
                  </div>
                ) : null}

                {activeTab === "prs" ? (
                  <div>
                    {isStudent && prFeed.length > 0 ? (
                      prFeed.map((item) => <FeedRow key={item.id} item={item} />)
                    ) : (
                      <EmptyLine text="Pull Requests пока не найдены" />
                    )}
                  </div>
                ) : null}
              </div>

              <section className="settings-grid">
                <PasswordCard
                  newPassword={newPassword}
                  oldPassword={oldPassword}
                  passwordError={passwordError}
                  repeatNewPassword={repeatNewPassword}
                  saving={saving}
                  success={success}
                  setNewPassword={setNewPassword}
                  setOldPassword={setOldPassword}
                  setPasswordError={setPasswordError}
                  setRepeatNewPassword={setRepeatNewPassword}
                  setSuccess={setSuccess}
                  onSubmit={onPasswordSubmit}
                />
                <div className="git-auth-wrap">
                  <GitAuthPanel isDarkTheme={isDarkTheme} />
                </div>
              </section>
            </div>

            <aside className="side-column">
              <CoursesCard
                courses={isStudent ? Math.max(stats.courses, 0) : Math.max(stats.courses, 0)}
                rows={courseRows}
                isTeacherLike={isTeacherLike}
              />
              <GitStatsCard
                stats={stats}
                studentSummary={studentSummary}
                totalCommits={displayedCommitsTotal}
                weekCommits={displayedCommitsWeek}
              />
              {showGroupRanking ? <RankingCard currentUser={me} ranking={groupRanking} /> : null}
              <InfoCard department={teacherDepartment} me={me} />
            </aside>
          </section>
        </>
      ) : null}

      {isModalOpen ? (
        <AvatarUploadModal
          file={selectedFile}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          onConfirm={onAvatarConfirm}
          isUploading={avatarLoading}
        />
      ) : null}
    </div>
  );
}

function MetaItem({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="profile-meta-item">
      {icon}
      {children}
    </div>
  );
}

function StatBox({
  delta,
  label,
  progress,
  tone,
  value,
}: {
  delta?: string;
  label: string;
  progress?: number;
  tone?: "success";
  value: ReactNode;
}) {
  return (
    <div className="stat-box">
      <div className={`stat-box-num ${tone === "success" ? "success-text" : ""}`}>{value}</div>
      <div className="stat-box-label">{label}</div>
      {progress != null ? (
        <div className="progress-wrap">
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="stat-box-delta">{delta}</div>
      )}
    </div>
  );
}

function CommitGraph({ total, weeks }: { total: number; weeks: CommitGraphDay[][] }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">График коммитов</span>
        <select className="mini-select" value="2026" onChange={() => undefined}>
          <option>2026</option>
          <option>2025</option>
        </select>
      </div>
      <div className="commit-graph-wrap">
        <div className="commit-graph-header">
          <span className="commit-graph-title">{total} коммитов за последний год</span>
        </div>
        <div className="graph-grid">
          {weeks.map((week, wi) => (
            <div className="graph-week" key={wi}>
              {week.map((day, di) => {
                const level = day.count === 0 ? "l0" : day.count <= 1 ? "l1" : day.count <= 3 ? "l2" : day.count <= 5 ? "l3" : "l4";
                const title = day.count === 0
                  ? `${formatGraphDate(day.date)}: нет коммитов`
                  : `${formatGraphDate(day.date)}: ${day.count} коммитов`;
                return <div className={`graph-day ${level}`} key={`${wi}-${di}`} title={title} />;
              })}
            </div>
          ))}
        </div>
        <div className="graph-legend">
          <span>Меньше</span>
          <i className="graph-legend-box l0" />
          <i className="graph-legend-box l1" />
          <i className="graph-legend-box l2" />
          <i className="graph-legend-box l3" />
          <i className="graph-legend-box l4" />
          <span>Больше</span>
        </div>
      </div>
    </div>
  );
}

function Tab({ active, children, count, onClick }: { active: boolean; children: ReactNode; count: number; onClick: () => void }) {
  return (
    <button className={`tab ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {children}
      <span className="tab-count">{count}</span>
    </button>
  );
}

function RepositoryRow({ onOpen, repo }: { onOpen: () => void; repo: ProfileRepo }) {
  return (
    <button className="repo-item" type="button" onClick={onOpen}>
      <div className="repo-item-top">
        <span className="repo-item-name">{repo.name}</span>
        <span className={`repo-item-vis ${repo.visibility === "private" ? "private" : ""}`}>
          {repo.visibility === "private" ? "Private" : "Public"}
        </span>
        {repo.badge ? <span className="badge badge-blue repo-badge">{repo.badge}</span> : null}
      </div>
      {repo.description ? <div className="repo-item-desc">{repo.description}</div> : null}
      <div className="repo-item-meta">
        {repo.language ? (
          <span>
            <i className="lang-dot" style={{ background: languageColor(repo.language) }} />
            {repo.language}
          </span>
        ) : null}
        {repo.commits != null ? <span>{repo.commits} коммитов</span> : null}
        {repo.forks ? <span>{repo.forks} форков</span> : null}
        <span className="muted">обновлён {formatRelative(repo.updatedAt)}</span>
      </div>
    </button>
  );
}

function FeedRow({ item }: { item: StudentActivityFeedItem }) {
  const content = (
    <div className="feed-item">
      <div className={`feed-dot ${feedDotClass(item.type)}`} />
      <div>
        <div className="feed-text">
          {item.text}
          {item.bold ? <strong> {item.bold}</strong> : null}
          {item.text_after ?? ""}
        </div>
        <div className="feed-time">{item.time_label}</div>
      </div>
      {item.badge ? <span className={`badge badge-${item.badge_variant === "ok" ? "green" : item.badge_variant === "warn" ? "yellow" : "blue"}`}>{item.badge}</span> : null}
    </div>
  );
  return item.href ? <Link to={item.href}>{content}</Link> : content;
}

function LogRow({ log }: { log: LogEntry }) {
  return (
    <div className="feed-item">
      <div className={`feed-dot ${log.level === "ERROR" ? "feed-danger" : log.level === "WARNING" ? "feed-warning" : "feed-success"}`} />
      <div>
        <div className="feed-text">
          <strong>{log.source}</strong> {log.message}
        </div>
        <div className="feed-time">{formatRelative(log.created_at)}</div>
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="empty-line">{text}</div>;
}

function CoursesCard({
  courses,
  rows,
  isTeacherLike,
}: {
  courses: number;
  rows: ProfileCourseRow[];
  isTeacherLike: boolean;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Курсы</span>
        <span className="card-link">{courses || rows.length} активных</span>
      </div>
      {rows.length === 0 ? (
        <EmptyLine text={isTeacherLike ? "Курсы преподавателя пока не найдены" : "Активные курсы пока не найдены"} />
      ) : rows.map((row) => (
        <div className="course-item" key={row.id}>
          <div className="course-abbr" style={{ background: `${row.color}22`, color: row.color }}>{courseAbbr(row.title)}</div>
          <div className="course-info">
            <div className="course-name">{row.title}</div>
            <div className="course-teacher">{row.sub}</div>
            <div className="prog-bar">
              <div className="prog-fill" style={{ width: `${row.progress}%`, background: row.color }} />
            </div>
          </div>
          <div className="course-score">
            <div className="course-score-num" style={{ color: row.color }}>{row.score}</div>
            <div className="course-score-label">{row.scoreLabel}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GitStatsCard({
  stats,
  studentSummary,
  totalCommits,
  weekCommits,
}: {
  stats: ProfileStats;
  studentSummary: StudentActivitySummary | null;
  totalCommits: number;
  weekCommits: number;
}) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Git статистика</span></div>
      <MiniStat label="Всего коммитов" value={totalCommits} />
      <MiniStat label="За последнюю неделю" value={`+${weekCommits}`} tone="success" />
      <MiniStat label="PR открыто" value={studentSummary?.prs_open ?? stats.prsOpen} />
      <MiniStat label="Работ отправлено" value={studentSummary?.submitted ?? stats.submitted} />
      <MiniStat label="На ревью" value={studentSummary?.in_review ?? stats.inReview} />
    </div>
  );
}

function MiniStat({ label, tone, value }: { label: string; tone?: "success"; value: ReactNode }) {
  return (
    <div className="mini-stat">
      <span className="mini-stat-label">{label}</span>
      <span className={`mini-stat-val ${tone === "success" ? "success-text" : ""}`}>{value}</span>
    </div>
  );
}

function RankingCard({ currentUser, ranking }: { currentUser: UserRead; ranking: StudentGroupRanking | null }) {
  const entries = ranking?.entries?.slice(0, 5) ?? [];
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Рейтинг в группе</span>
        <span className="card-subtle">{ranking?.group_name || currentUser.group_name || "Группа"}</span>
      </div>
      {entries.length === 0 ? <EmptyLine text="Рейтинг пока недоступен" /> : null}
      {entries.map((entry) => (
        <div className={`rank-item ${entry.is_you ? "current" : ""}`} key={entry.student_id}>
          <div className={`rank-num ${entry.place <= 3 ? "top" : ""}`}>{entry.place}</div>
          <div className="rank-ava">{initials(entry.name)}</div>
          <div className="rank-name">
            {entry.name}
            {entry.is_you ? <span> (Вы)</span> : null}
          </div>
          <div className="rank-score">{entry.points}</div>
        </div>
      ))}
      <div className="card-footnote">
        {ranking?.your_place ? `${ranking.your_place} место · ${ranking.your_points ?? 0} баллов` : "место пока не рассчитано"}
      </div>
    </div>
  );
}

function InfoCard({ department, me }: { department: string | null; me: UserRead }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Информация</span></div>
      <MiniStat label="Email" value={me.email} />
      <MiniStat label="Роль" value={roleLabel(me.role)} />
      {me.group_name ? <MiniStat label="Группа" value={me.group_name} /> : null}
      {department ? <MiniStat label="Кафедра" value={department} /> : null}
      <MiniStat label="Регистрация" value={formatDate(me.created_at)} />
    </div>
  );
}

function PasswordCard({
  newPassword,
  oldPassword,
  onSubmit,
  passwordError,
  repeatNewPassword,
  saving,
  setNewPassword,
  setOldPassword,
  setPasswordError,
  setRepeatNewPassword,
  setSuccess,
  success,
}: {
  newPassword: string;
  oldPassword: string;
  onSubmit: (event: FormEvent) => void;
  passwordError: string | null;
  repeatNewPassword: string;
  saving: boolean;
  setNewPassword: (value: string) => void;
  setOldPassword: (value: string) => void;
  setPasswordError: (value: string | null) => void;
  setRepeatNewPassword: (value: string) => void;
  setSuccess: (value: string | null) => void;
  success: string | null;
}) {
  return (
    <div className="card password-card">
      <div className="card-header"><span className="card-title">Смена пароля</span></div>
      <form onSubmit={onSubmit} className="password-form">
        <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Текущий пароль" required />
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Новый пароль" required />
        <input type="password" value={repeatNewPassword} onChange={(e) => setRepeatNewPassword(e.target.value)} placeholder="Повторите пароль" required />
        {passwordError ? <div className="form-error">{passwordError}</div> : null}
        {success ? <div className="form-success">{success}</div> : null}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Сохраняем..." : "Изменить пароль"}</button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setOldPassword("");
              setNewPassword("");
              setRepeatNewPassword("");
              setPasswordError(null);
              setSuccess(null);
            }}
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

const profileStyles = `
.profile-html-page {
  --bg: #0f0f10;
  --bg2: #111111;
  --bg3: #1e1e1e;
  --bg4: #2a2a2a;
  --border: #30363d;
  --text: #e6e6e6;
  --text2: #888888;
  --text3: #444444;
  --accent: #2563eb;
  --accent2: #3b82f6;
  --danger: #e24b4a;
  --success: #4caf50;
  --warning: #f59e0b;
  color: var(--text);
  min-height: 100%;
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.profile-html-page[data-theme="light"] {
  --bg: #f8fafc;
  --bg2: #ffffff;
  --bg3: #f1f5f9;
  --bg4: #e2e8f0;
  --border: #d8e0ea;
  --text: #0f172a;
  --text2: #475569;
  --text3: #94a3b8;
  --accent: #2563eb;
  --accent2: #1d4ed8;
  --danger: #dc2626;
  --success: #15803d;
  --warning: #d97706;
}
.profile-html-page * { box-sizing: border-box; letter-spacing: 0; }
.breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text3); }
.breadcrumb a { color: var(--accent2); text-decoration: none; }
.profile-header { display: flex; align-items: flex-start; gap: 20px; }
.profile-avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg,#7c3aed,#3b82f6); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #fff; flex-shrink: 0; border: 2px solid var(--border); overflow: hidden; cursor: pointer; }
.profile-html-page[data-theme="light"] .profile-avatar { border-color: #fff; box-shadow: 0 10px 24px rgba(15,23,42,0.16); }
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.profile-info { flex: 1; min-width: 0; }
.profile-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.profile-name { font-size: 20px; font-weight: 700; color: var(--text); margin: 0; }
.profile-login { font-size: 13px; color: var(--text2); margin-top: 2px; font-family: 'Courier New', monospace; }
.profile-meta { display: flex; align-items: center; gap: 14px; margin-top: 8px; flex-wrap: wrap; }
.profile-meta-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text2); }
.profile-meta-item svg { width: 12px; height: 12px; }
.profile-actions { display: flex; gap: 8px; flex-shrink: 0; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 12px; border-radius: 7px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; border: 0.5px solid var(--border); background: var(--bg3); color: var(--text); transition: border-color .15s, color .15s, background .15s; }
.btn:hover:not(:disabled) { border-color: var(--accent2); color: var(--accent2); }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn svg { width: 12px; height: 12px; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-danger { color: var(--danger); border-color: rgba(226,75,74,0.3); }
.stats-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stat-box { background: var(--bg2); border: 0.5px solid var(--border); border-radius: 10px; padding: 14px 16px; min-width: 0; }
.profile-html-page[data-theme="light"] .stat-box,
.profile-html-page[data-theme="light"] .card {
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05);
}
.stat-box-num { font-size: 22px; font-weight: 700; font-family: 'Courier New', monospace; }
.stat-box-label { font-size: 11px; color: var(--text2); margin-top: 3px; }
.stat-box-delta { font-size: 10px; color: var(--success); margin-top: 4px; }
.success-text { color: var(--success); }
.content-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; align-items: start; }
.main-column, .side-column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.card { background: var(--bg2); border: 0.5px solid var(--border); border-radius: 10px; overflow: hidden; }
.loading-card { padding: 20px; color: var(--text2); }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 0.5px solid var(--border); }
.card-title { font-size: 12px; font-weight: 600; color: var(--text); }
.card-link, .card-subtle { font-size: 11px; color: var(--accent2); }
.card-subtle { color: var(--text3); }
.commit-graph-wrap { padding: 14px 16px 12px; }
.commit-graph-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.commit-graph-title { font-size: 11px; color: var(--text2); }
.graph-grid { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.graph-grid::-webkit-scrollbar { height: 3px; }
.graph-grid::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 2px; }
.graph-week { display: flex; flex-direction: column; gap: 3px; }
.graph-day { width: 11px; height: 11px; border-radius: 2px; cursor: pointer; }
.graph-day.l0, .graph-legend-box.l0 { background: var(--bg4); }
.graph-day.l1, .graph-legend-box.l1 { background: rgba(37,99,235,0.25); }
.graph-day.l2, .graph-legend-box.l2 { background: rgba(37,99,235,0.45); }
.graph-day.l3, .graph-legend-box.l3 { background: rgba(37,99,235,0.7); }
.graph-day.l4, .graph-legend-box.l4 { background: #3b82f6; }
.graph-legend { display: flex; align-items: center; gap: 4px; margin-top: 8px; justify-content: flex-end; }
.graph-legend span { font-size: 9px; color: var(--text3); }
.graph-legend-box { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.mini-select { background: var(--bg3); border: 0.5px solid var(--border); border-radius: 5px; color: var(--text2); font-size: 10px; padding: 3px 6px; outline: none; }
.tabs { display: flex; gap: 0; border-bottom: 0.5px solid var(--border); padding: 0 16px; overflow-x: auto; }
.tab { padding: 10px 14px; font-size: 12px; font-weight: 500; color: var(--text2); cursor: pointer; border: 0; border-bottom: 2px solid transparent; margin-bottom: -0.5px; transition: color .15s; background: transparent; font-family: inherit; white-space: nowrap; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent2); border-bottom-color: var(--accent2); }
.tab-count { background: var(--bg4); border-radius: 8px; padding: 0 5px; font-size: 10px; margin-left: 4px; }
.repo-item { width: 100%; padding: 12px 16px; border: 0; border-bottom: 0.5px solid var(--border); cursor: pointer; transition: background .1s; background: transparent; text-align: left; font-family: inherit; display: block; }
.repo-item:hover { background: var(--bg3); }
.repo-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.repo-item-name { font-size: 13px; font-weight: 500; color: var(--accent2); }
.repo-item-vis { font-size: 10px; border: 0.5px solid var(--border); border-radius: 10px; padding: 1px 7px; color: var(--text2); }
.repo-item-vis.private { border-color: rgba(226,75,74,0.3); color: var(--danger); }
.repo-badge { margin-left: auto; }
.repo-item-desc { font-size: 11px; color: var(--text2); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.repo-item-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.repo-item-meta span { font-size: 10px; color: var(--text2); display: flex; align-items: center; gap: 3px; }
.repo-item-meta .muted { color: var(--text3); }
.lang-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.card-more { padding: 10px 16px; text-align: center; border-top: 0.5px solid var(--border); }
.card-more a { font-size: 11px; color: var(--accent2); text-decoration: none; }
.feed-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 16px; border-bottom: 0.5px solid var(--border); color: inherit; }
a .feed-item { text-decoration: none; }
.feed-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }
.feed-success { background: var(--success); }
.feed-warning { background: var(--warning); }
.feed-accent { background: var(--accent2); }
.feed-danger { background: var(--danger); }
.feed-muted { background: var(--text3); }
.feed-text { font-size: 12px; color: var(--text2); line-height: 1.5; }
.feed-text strong { color: var(--text); font-weight: 500; }
.feed-time { font-size: 10px; color: var(--text3); font-family: 'Courier New', monospace; margin-top: 2px; }
.course-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 0.5px solid var(--border); }
.course-abbr { width: 32px; height: 32px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.course-info { flex: 1; min-width: 0; }
.course-name { font-size: 12px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.course-teacher { font-size: 10px; color: var(--text2); }
.course-score { text-align: right; flex-shrink: 0; }
.course-score-num { font-size: 12px; font-weight: 600; font-family: 'Courier New',monospace; }
.course-score-label { font-size: 10px; color: var(--text3); }
.prog-bar { height: 3px; background: var(--bg4); border-radius: 2px; overflow: hidden; margin-top: 4px; }
.prog-fill { height: 100%; border-radius: 2px; background: var(--success); }
.progress-wrap { margin-top: 6px; }
.badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 10px; }
.badge-blue { background: rgba(37,99,235,0.12); color: #60a5fa; border: 0.5px solid rgba(37,99,235,0.2); }
.badge-green { background: rgba(76,175,80,0.12); color: #4caf50; border: 0.5px solid rgba(76,175,80,0.2); }
.badge-red { background: rgba(226,75,74,0.12); color: #e24b4a; border: 0.5px solid rgba(226,75,74,0.2); }
.badge-yellow { background: rgba(245,158,11,0.12); color: #f59e0b; border: 0.5px solid rgba(245,158,11,0.2); }
.badge-purple { background: rgba(124,58,237,0.12); color: #a78bfa; border: 0.5px solid rgba(124,58,237,0.2); }
.profile-html-page[data-theme="light"] .badge-blue { background: rgba(37,99,235,0.10); color: #1d4ed8; border-color: rgba(37,99,235,0.22); }
.profile-html-page[data-theme="light"] .badge-green { background: rgba(22,163,74,0.10); color: #15803d; border-color: rgba(22,163,74,0.22); }
.profile-html-page[data-theme="light"] .badge-red { background: rgba(220,38,38,0.10); color: #b91c1c; border-color: rgba(220,38,38,0.22); }
.profile-html-page[data-theme="light"] .badge-yellow { background: rgba(217,119,6,0.12); color: #b45309; border-color: rgba(217,119,6,0.24); }
.profile-html-page[data-theme="light"] .badge-purple { background: rgba(124,58,237,0.10); color: #6d28d9; border-color: rgba(124,58,237,0.22); }
.mini-stat { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; border-bottom: 0.5px solid var(--border); }
.mini-stat-label { font-size: 12px; color: var(--text2); }
.mini-stat-val { font-size: 12px; font-weight: 600; color: var(--text); font-family: 'Courier New',monospace; text-align: right; word-break: break-word; }
.rank-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 0.5px solid var(--border); }
.rank-item.current { background: rgba(37,99,235,0.06); }
.rank-num { font-size: 13px; font-weight: 700; color: var(--text3); width: 18px; text-align: right; font-family: 'Courier New',monospace; flex-shrink: 0; }
.rank-num.top { color: var(--warning); }
.rank-ava { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex-shrink: 0; background: rgba(37,99,235,0.15); color: #60a5fa; }
.rank-name { flex: 1; font-size: 12px; font-weight: 500; color: var(--text2); min-width: 0; }
.rank-name span { color: var(--accent2); font-size: 10px; }
.rank-score { font-size: 12px; font-weight: 600; font-family: 'Courier New',monospace; color: var(--accent2); }
.card-footnote { padding: 8px 16px; text-align: center; border-top: 0.5px solid var(--border); font-size: 10px; color: var(--text3); }
.empty-line { padding: 18px 16px; font-size: 12px; color: var(--text2); text-align: center; }
.settings-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.password-form { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 16px; }
.password-form input { width: 100%; background: var(--bg3); border: 0.5px solid var(--border); border-radius: 7px; padding: 8px 10px; color: var(--text); font-size: 12px; outline: none; }
.password-form input::placeholder { color: var(--text3); }
.form-error, .form-success, .error-box { border-radius: 7px; padding: 8px 10px; font-size: 12px; }
.form-error, .error-box { background: rgba(226,75,74,0.1); border: 0.5px solid rgba(226,75,74,0.3); color: var(--danger); }
.form-success { background: rgba(76,175,80,0.1); border: 0.5px solid rgba(76,175,80,0.3); color: var(--success); }
.form-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.error-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.error-box button { border: 0.5px solid rgba(226,75,74,0.4); background: transparent; color: var(--danger); border-radius: 6px; padding: 5px 10px; font-size: 11px; cursor: pointer; }
.git-auth-wrap > div { margin: 0 !important; border-radius: 10px !important; }
@media (max-width: 1100px) {
  .content-grid { grid-template-columns: 1fr; }
  .side-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-grid { grid-template-columns: 1fr; }
}
@media (max-width: 780px) {
  .profile-header { flex-direction: column; }
  .profile-actions { width: 100%; flex-wrap: wrap; }
  .stats-row, .side-column { grid-template-columns: 1fr; }
  .profile-name { font-size: 18px; }
}
`;
