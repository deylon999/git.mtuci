import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  GitCommit,
  Bell,
  FolderGit2,
  Github,
  GitPullRequest,
  MessageSquare,
} from "lucide-react";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { useStudentDashboardCore } from "../hooks/useStudentDashboardCore";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { pluralWord } from "../i18n/plural";
import { pluralDeadlines } from "../utils/studentDeadlines";
import { formatTodayLong } from "../utils/studentDeadlineGroups";
import { getTheme, type ThemeColors } from "../theme";

const COURSE_AVATAR_PALETTE = [
  { bg: "rgba(37,99,235,0.15)", color: "#60a5fa" },
  { bg: "rgba(139,92,246,0.15)", color: "#a78bfa" },
  { bg: "rgba(76,175,80,0.15)", color: "#4caf50" },
];

const LANG_COLORS: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  java: "#b07219",
};

function courseInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

function courseAvatarStyle(courseId: string) {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) hash = (hash + courseId.charCodeAt(i)) % COURSE_AVATAR_PALETTE.length;
  return COURSE_AVATAR_PALETTE[hash];
}

function repoInitials(name: string): string {
  const parts = name.split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface DashboardPageProps {
  isDarkTheme?: boolean;
}

type BadgeVariant = "ok" | "warn" | "err" | "info" | "gray";

function Badge({
  children,
  variant,
  theme,
}: {
  children: React.ReactNode;
  variant: BadgeVariant;
  theme: ThemeColors;
}) {
  const styles: Record<BadgeVariant, { bg: string; color: string }> = {
    ok: { bg: `${theme.success}20`, color: theme.success },
    warn: { bg: `${theme.warning}20`, color: theme.warning },
    err: { bg: `${theme.danger}20`, color: theme.danger },
    info: { bg: `${theme.accent}20`, color: theme.accent2 },
    gray: { bg: theme.bg4, color: theme.text2 },
  };
  const s = styles[variant];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        border: variant === "gray" ? `1px solid ${theme.border}` : undefined,
      }}
    >
      {children}
    </span>
  );
}

function Card({
  children,
  theme,
  className = "",
}: {
  children: React.ReactNode;
  theme: ThemeColors;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border overflow-hidden ${className}`} style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
      {children}
    </div>
  );
}

function CardHead({
  title,
  theme,
  action,
  subtitle,
}: {
  title: string;
  theme: ThemeColors;
  action?: { label: string; to: string };
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 border-b text-sm font-semibold"
      style={{ backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }}
    >
      <span>{title}</span>
      {subtitle ? (
        <span className="text-xs font-normal" style={{ color: theme.text2 }}>
          {subtitle}
        </span>
      ) : action ? (
        <Link to={action.to} className="text-xs font-normal" style={{ color: theme.accent2 }}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function StatIcon({ type, theme }: { type: string; theme: ThemeColors }) {
  const iconClass = "h-[18px] w-[18px]";
  switch (type) {
    case "repo":
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${theme.accent}18` }}>
          <FolderGit2 className={iconClass} style={{ color: theme.accent2 }} />
        </div>
      );
    case "commits":
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(139,92,246,0.1)" }}>
          <GitCommit className={iconClass} style={{ color: "#a78bfa" }} />
        </div>
      );
    case "courses":
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${theme.success}18` }}>
          <BookOpen className={iconClass} style={{ color: theme.success }} />
        </div>
      );
    default:
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${theme.danger}18` }}>
          <AlertCircle className={iconClass} style={{ color: theme.danger }} />
        </div>
      );
  }
}

function activityIcon(type: string, theme: ThemeColors) {
  const box = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg";
  const icon = "h-3.5 w-3.5";
  switch (type) {
    case "success":
      return (
        <div className={box} style={{ backgroundColor: `${theme.success}18` }}>
          <Check className={icon} style={{ color: theme.success }} />
        </div>
      );
    case "commit":
      return (
        <div className={box} style={{ backgroundColor: `${theme.accent}18` }}>
          <GitCommit className={icon} style={{ color: theme.accent2 }} />
        </div>
      );
    case "comment":
      return (
        <div className={box} style={{ backgroundColor: `${theme.warning}18` }}>
          <MessageSquare className={icon} style={{ color: theme.warning }} />
        </div>
      );
    case "pr":
      return (
        <div className={box} style={{ backgroundColor: `${theme.accent}18` }}>
          <GitPullRequest className={icon} style={{ color: theme.accent2 }} />
        </div>
      );
    case "repo":
      return (
        <div className={box} style={{ backgroundColor: `${theme.success}18` }}>
          <FolderGit2 className={icon} style={{ color: theme.success }} />
        </div>
      );
    case "notification":
      return (
        <div className={box} style={{ backgroundColor: `${theme.warning}18` }}>
          <Bell className={icon} style={{ color: theme.warning }} />
        </div>
      );
    default:
      return (
        <div className={box} style={{ backgroundColor: `${theme.danger}18` }}>
          <AlertCircle className={icon} style={{ color: theme.danger }} />
        </div>
      );
  }
}

function deadlineDotColor(urgency: string, theme: ThemeColors) {
  switch (urgency) {
    case "danger":
      return theme.danger;
    case "warning":
      return theme.warning;
    case "info":
      return theme.accent2;
    default:
      return theme.text3;
  }
}

function deadlineTimeColor(urgency: string, theme: ThemeColors) {
  switch (urgency) {
    case "danger":
      return theme.danger;
    case "warning":
      return theme.warning;
    default:
      return theme.text2;
  }
}

function courseScoreColor(variant: string, theme: ThemeColors) {
  switch (variant) {
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    default:
      return theme.text2;
  }
}

export default function DashboardPage({ isDarkTheme = false }: DashboardPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const {
    loading,
    error,
    firstName,
    groupName,
    deadlines,
    deadlinesToday,
    deadlinesTodaySub,
    kpi,
    courses,
    recentRepos,
    activitySummary,
    activityFeed,
    groupRanking,
    refetch,
  } = useStudentDashboardCore();

  const dashboardCourses = useMemo(() => courses.slice(0, 3), [courses]);

  const stats = useMemo(() => {
    if (!kpi) {
      return [
        { label: t("student.dashboard.statRepos"), value: "—", sub: "…", icon: "repo" as const, highlight: false },
        { label: t("student.dashboard.statCommitsWeek"), value: "—", sub: "…", icon: "commits" as const, highlight: false },
        { label: t("student.dashboard.statCoursesActive"), value: "—", sub: "…", icon: "courses" as const, highlight: false },
        {
          label: t("student.dashboard.statDeadlinesToday"),
          value: "—",
          sub: "…",
          icon: "deadline" as const,
          highlight: false,
        },
      ];
    }
    return [
      { label: t("student.dashboard.statRepos"), value: String(kpi.reposTotal), sub: kpi.reposWeekSub, icon: "repo" as const, highlight: false },
      { label: t("student.dashboard.statCommitsWeek"), value: String(kpi.commitsWeek), sub: kpi.commitsWeekSub, icon: "commits" as const, highlight: false },
      { label: t("student.dashboard.statCoursesActive"), value: String(kpi.coursesActive), sub: kpi.coursesSub, icon: "courses" as const, highlight: false },
      {
        label: t("student.dashboard.statDeadlinesToday"),
        value: String(kpi.deadlinesToday),
        sub: kpi.deadlinesTodaySub,
        icon: "deadline" as const,
        highlight: kpi.deadlinesToday > 0,
      },
    ];
  }, [kpi, t]);

  const weekProgress = useMemo(() => {
    if (!activitySummary) {
      return { percent: 0, commits: 0, prsOpen: 0, submitted: 0, inReview: 0 };
    }
    return {
      percent: activitySummary.week_progress_percent,
      commits: activitySummary.commits,
      prsOpen: activitySummary.prs_open,
      submitted: activitySummary.submitted,
      inReview: activitySummary.in_review,
    };
  }, [activitySummary]);

  const welcomeName = loading ? "…" : firstName || t("student.dashboard.studentFallback");
  const groupLine = groupName
    ? tp("student.dashboard.groupLine", { name: groupName })
    : t("student.dashboard.groupMissing");
  return (
    <div className="w-full flex flex-col gap-3.5">
      {error ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3"
          style={{
            backgroundColor: `${theme.danger}12`,
            borderColor: `${theme.danger}40`,
            color: theme.danger,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border px-3 py-1 text-xs font-medium"
            style={{ borderColor: `${theme.danger}55`, color: theme.danger }}
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
              {tp("student.dashboard.greeting", { name: welcomeName })}
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
              {groupLine} · {formatTodayLong(new Date(), language)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled
              title={t("student.dashboard.importGithubTitle")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium opacity-50 cursor-not-allowed"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
            >
              <Github className="h-3.5 w-3.5" />
              {t("student.dashboard.importGithub")}
            </button>
          </div>
        </div>
        {!loading && deadlinesToday > 0 ? (
          <div
            className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{
              backgroundColor: `${theme.danger}14`,
              borderColor: `${theme.danger}55`,
              color: theme.danger,
            }}
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>
              {tp("student.deadline.todayCount", {
                n: deadlinesToday,
                word: pluralDeadlines(deadlinesToday, language),
              })}
              {deadlinesTodaySub ? ` — ${deadlinesTodaySub}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{
              backgroundColor: theme.bg3,
              borderColor: stat.highlight ? `${theme.danger}50` : theme.border,
            }}
          >
            <StatIcon type={stat.icon} theme={theme} />
            <div className="min-w-0">
              <p className="text-xs" style={{ color: theme.text2 }}>
                {stat.label}
              </p>
              <p className="text-2xl font-semibold leading-tight" style={{ color: stat.highlight ? theme.danger : theme.text }}>
                {stat.value}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: stat.highlight ? theme.danger : theme.text2 }}>
                {stat.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,22rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(300px,24rem)] gap-3.5">
        <div className="flex flex-col gap-3.5 min-w-0">
          <Card theme={theme}>
            <CardHead title={t("student.dashboard.activityTitle")} subtitle={t("student.dashboard.activitySubtitle")} theme={theme} />
            <div className="p-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span style={{ color: theme.text }}>{t("student.dashboard.weekProgress")}</span>
                <span className="font-semibold" style={{ color: theme.accent2 }}>
                  {loading ? "…" : `${weekProgress.percent}%`}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${weekProgress.percent}%`, backgroundColor: theme.accent }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[
                  { val: loading ? "…" : weekProgress.commits, label: t("student.dashboard.commits") },
                  { val: loading ? "…" : weekProgress.prsOpen, label: t("student.dashboard.prsOpen") },
                  { val: loading ? "…" : weekProgress.submitted, label: t("student.dashboard.submitted"), color: theme.success },
                  { val: loading ? "…" : weekProgress.inReview, label: t("student.dashboard.inReview"), color: theme.warning },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg py-2 text-center" style={{ backgroundColor: theme.bg2 }}>
                    <p className="text-base font-semibold" style={{ color: item.color ?? theme.text }}>
                      {item.val}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: theme.text2 }}>
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card theme={theme}>
            <CardHead
              title={t("student.dashboard.reposTitle")}
              subtitle={t("student.dashboard.reposSubtitle")}
              theme={theme}
              action={{ label: t("student.dashboard.viewAll"), to: "/repositories" }}
            />
            {loading ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>{t("common.loading")}</div>
            ) : recentRepos.length === 0 ? (
              <div className="px-3.5 py-6 text-center">
                <p className="text-sm" style={{ color: theme.text2 }}>
                  {t("student.dashboard.noRepos")}
                </p>
              </div>
            ) : (
              recentRepos.map((repo) => {
                const langKey = (repo.language ?? "").toLowerCase();
                const langColor = LANG_COLORS[langKey] ?? theme.text3;
                const href = repo.course_id && repo.assignment_id ? `/courses/${repo.course_id}/assignments/${repo.assignment_id}` : "/repositories";
                return (
              <Link
                key={repo.id}
                to={href}
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b last:border-b-0 transition-colors hover:opacity-90"
                style={{ borderColor: theme.border }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                  style={{ backgroundColor: `${theme.accent}18`, color: theme.accent2 }}
                >
                  {repoInitials(repo.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                    {repo.name}
                  </p>
                  <p className="text-[10px] font-mono truncate" style={{ color: theme.text2 }}>
                    {repo.language ? (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle"
                        style={{ backgroundColor: langColor }}
                      />
                    ) : null}
                    {repo.language ?? "—"}
                    {repo.assignment_label ? ` · ${repo.assignment_label}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  {repo.commits_count != null ? (
                    <p className="text-xs" style={{ color: theme.text2 }}>
                      {repo.commits_count}
                      {repo.commits_count >= 100 ? "+" : ""}{" "}
                      {pluralWord(language, "student.plural.commits", repo.commits_count)}
                    </p>
                  ) : null}
                  <p className="text-[10px]" style={{ color: theme.text3 }}>
                    {formatRelativeTime(repo.updated_at, new Date(), language)}
                  </p>
                </div>
                <Badge variant={repo.visibility === "public" ? "ok" : "gray"} theme={theme}>
                  {repo.visibility === "public"
                    ? t("student.repos.visibilityPublic")
                    : t("student.repos.visibilityPrivate")}
                </Badge>
              </Link>
                );
              })
            )}

          </Card>

          <Card theme={theme}>
            <CardHead title={t("student.dashboard.activityFeedTitle")} theme={theme} />
            {loading ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>
                {t("common.loading")}
              </div>
            ) : activityFeed.length === 0 ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>
                {t("student.dashboard.noActivity")}
              </div>
            ) : (
              activityFeed.map((act) => {
                const content = (
                  <>
                    {activityIcon(act.type, theme)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: theme.text }}>
                        {act.text}
                        {act.bold ? <strong className="font-medium">{act.bold}</strong> : null}
                        {act.text_after}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: theme.text3 }}>
                        {act.time_label}
                      </p>
                    </div>
                    {act.badge ? (
                      <Badge variant={act.badge_variant ?? "gray"} theme={theme}>
                        {act.badge}
                      </Badge>
                    ) : null}
                  </>
                );
                const rowClass =
                  "flex items-start gap-2.5 px-3.5 py-2.5 border-b last:border-b-0 transition-colors hover:opacity-90";
                return act.href ? (
                  <Link key={act.id} to={act.href} className={rowClass} style={{ borderColor: theme.border }}>
                    {content}
                  </Link>
                ) : (
                  <div key={act.id} className={rowClass} style={{ borderColor: theme.border }}>
                    {content}
                  </div>
                );
              })
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card theme={theme}>
            <CardHead title={t("student.dashboard.deadlinesTitle")} theme={theme} action={{ label: t("student.dashboard.viewAll"), to: "/deadlines" }} />
            {loading ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>
                {t("common.loading")}
              </div>
            ) : deadlines.length === 0 ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>
                {t("student.dashboard.noUpcomingDeadlines")}
              </div>
            ) : (
              deadlines.slice(0, 8).map((dl) => (
                <Link
                  key={dl.id}
                  to={`/courses/${dl.courseId}/assignments/${dl.assignmentId}`}
                  className="flex items-center justify-between gap-2 px-3.5 py-2 border-b last:border-b-0 transition-colors hover:opacity-90"
                  style={{ borderColor: theme.border }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: deadlineDotColor(dl.urgency, theme) }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                        {dl.name}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: theme.text2 }}>
                        {dl.course}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-medium whitespace-nowrap shrink-0"
                    style={{ color: deadlineTimeColor(dl.urgency, theme) }}
                  >
                    {dl.timeLabel}
                  </span>
                </Link>
              ))
            )}
          </Card>

          <Card theme={theme}>
            <CardHead
              title={t("student.dashboard.coursesTitle")}
              theme={theme}
              action={courses.length > 3 ? { label: t("student.dashboard.viewAll"), to: "/courses" } : undefined}
            />
            {loading ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>{t("common.loading")}</div>
            ) : courses.length === 0 ? (
              <div className="px-3.5 py-6 text-sm text-center" style={{ color: theme.text2 }}>{t("student.dashboard.noCourses")}</div>
            ) : (
              dashboardCourses.map((course) => {
                const avatar = courseAvatarStyle(course.id);
                const courseHref =
                  course.has_platform !== false && course.platform_course_id
                    ? `/courses/${course.platform_course_id}`
                    : null;
                const row = (
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 border-b last:border-b-0 transition-colors hover:opacity-90"
                style={{ borderColor: theme.border }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                  style={{ backgroundColor: avatar.bg, color: avatar.color }}
                >
                  {courseInitials(course.title)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {course.title}
                  </p>
                  <p className="text-[10px]" style={{ color: theme.text2 }}>
                    {(course.teacher_name ?? "—") +
                      " · " +
                      tp("student.dashboard.assignmentsCount", { n: course.assignments_count })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold" style={{ color: courseScoreColor(course.score_color, theme) }}>
                    {course.score_label ?? (course.score != null ? String(course.score) : "—")}
                  </p>
                  <p className="text-[10px]" style={{ color: theme.text2 }}>
                    {course.score_label ?? tp("student.dashboard.scoreOf", { max: course.score_max })}
                  </p>
                </div>
              </div>
                );
                return courseHref ? (
                  <Link key={course.id} to={courseHref} style={{ textDecoration: "none", color: "inherit" }}>
                    {row}
                  </Link>
                ) : (
                  <div key={course.id}>{row}</div>
                );
              })
            )}
          </Card>

          <Card theme={theme}>
            <CardHead
              title={t("student.dashboard.rankingTitle")}
              subtitle={groupRanking?.group_name ?? groupName ?? undefined}
              theme={theme}
            />
            <div className="p-3.5">
              {loading ? (
                <p className="text-sm text-center py-4" style={{ color: theme.text2 }}>
                  {t("common.loading")}
                </p>
              ) : !groupRanking?.group_name ? (
                <p className="text-sm text-center py-4" style={{ color: theme.text2 }}>
                  {t("student.dashboard.rankingSetGroup")}
                </p>
              ) : groupRanking.your_place == null ? (
                <p className="text-sm text-center py-4" style={{ color: theme.text2 }}>
                  {t("student.dashboard.rankingNoGrades")}
                </p>
              ) : (
                <>
                  <div
                    className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 mb-2.5"
                    style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                  >
                    <span className="text-lg font-bold w-6 text-center" style={{ color: theme.accent2 }}>
                      {groupRanking.your_place}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium" style={{ color: theme.text }}>
                        {groupRanking.your_name ?? firstName} {t("student.dashboard.you")}
                      </p>
                      <p className="text-[10px]" style={{ color: theme.text2 }}>
                        {tp("student.dashboard.points", { n: groupRanking.your_points ?? 0 })}
                      </p>
                    </div>
                    {groupRanking.top_percent_label ? (
                      <Badge variant="info" theme={theme}>
                        {groupRanking.top_percent_label}
                      </Badge>
                    ) : null}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {groupRanking.entries.map((row) => (
                      <li
                        key={`${row.place}-${row.student_id}`}
                        className="flex items-center gap-2 text-xs py-1 border-b last:border-b-0"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: row.is_you ? `${theme.accent}08` : undefined,
                          borderRadius: row.is_you ? 4 : undefined,
                          paddingLeft: row.is_you ? 4 : undefined,
                        }}
                      >
                        <span
                          className="w-4 text-center font-semibold"
                          style={{
                            color: row.place === 1 ? theme.warning : row.is_you ? theme.accent2 : theme.text2,
                          }}
                        >
                          {row.place}
                        </span>
                        <span
                          className="flex-1 truncate"
                          style={{
                            color: row.is_you ? theme.accent2 : theme.text,
                            fontWeight: row.is_you ? 500 : 400,
                          }}
                        >
                          {row.name}
                        </span>
                        <span style={{ color: row.is_you ? theme.accent2 : theme.text2 }}>
                          {tp("student.dashboard.points", { n: row.points })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}
