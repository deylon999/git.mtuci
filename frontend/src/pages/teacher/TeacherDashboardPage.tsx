import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, GitCommit } from "lucide-react";
import { getMe } from "../../api/authApi";
import { getTeacherDashboardFull, type TeacherDashboardFull } from "../../api/teacherDashboardApi";
import {
  TeacherActivityRow,
  TeacherAlertBanner,
  TeacherChartBars,
  TeacherCourseMiniRow,
  TeacherDeadlineRow,
  TeacherEmptyState,
  TeacherLinkBtn,
  TeacherLoadingBlock,
  TeacherMainAside,
  TeacherPageShell,
  TeacherPendingRow,
  TeacherStatGrid,
  TeacherSurface,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { waitingBadgeTone } from "../../components/teacher/teacherUiConstants";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface Props {
  isDarkTheme?: boolean;
}

const ACTIVITY_ICON_STYLES = [
  { bg: "rgba(37,99,235,0.12)", stroke: "#60a5fa" },
  { bg: "rgba(76,175,80,0.12)", stroke: "#4caf50" },
  { bg: "rgba(139,92,246,0.12)", stroke: "#a78bfa" },
  { bg: "rgba(245,158,11,0.12)", stroke: "#f59e0b" },
];

function deadlineUrgencyColor(deadlineIso: string, theme: ReturnType<typeof useTeacherTheme>): string {
  const now = new Date();
  const d = new Date(deadlineIso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() <= today.getTime()) return theme.danger;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day.getTime() === tomorrow.getTime()) return theme.warning;
  return theme.text2;
}

function formatDeadlineLabel(
  deadlineIso: string,
  language: string,
  t: (key: string) => string,
): string {
  const d = new Date(deadlineIso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString(language === "en" ? "en-US" : "ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (day.getTime() === today.getTime()) {
    return `${t("common.today")} ${time}`;
  }
  return d.toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatWaitingBadge(
  item: { is_stale: boolean; waiting_hours: number; submitted_at: string },
  tp: (key: string, params: Record<string, string | number>) => string,
): string {
  const roundedHours = Math.max(1, Math.round(item.waiting_hours));
  if (item.is_stale || roundedHours >= 1) {
    return tp("teacher.codeReview.waitingHours", { hours: roundedHours });
  }
  return formatRelativeTime(new Date(item.submitted_at));
}

export default function TeacherDashboardPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeacherDashboardFull | null>(null);
  const [department, setDepartment] = useState<string | null>(null);

  const dateLabel = new Date().toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [me, dash] = await Promise.all([getMe(), getTeacherDashboardFull()]);
        if (cancelled) return;
        setData(dash);
        const prefs = me as { preferences?: Record<string, unknown> };
        const dept =
          dash.department ??
          (typeof prefs?.preferences?.department === "string" ? prefs.preferences.department : null);
        setDepartment(dept);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("teacher.errors.dashboardLoadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const displayName = data?.greeting_name ?? t("teacher.dashboard.greetingFallback");
  const subtitle = [department, dateLabel].filter(Boolean).join(" · ");

  const chartItems =
    data?.activity_by_day.map((d) => ({
      label: new Date(d.date).toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
        weekday: "short",
      }),
      value: d.commits,
    })) ?? [];

  return (
    <TeacherPageShell className="gap-3.5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold leading-tight" style={{ color: theme.text }}>
            {tp("teacher.dashboard.greeting", { name: displayName })}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-xs" style={{ color: theme.text2 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TeacherLinkBtn to="/teacher/activity" theme={theme} variant="default">
            {t("teacher.dashboard.activityBtn")}
          </TeacherLinkBtn>
          <TeacherLinkBtn to="/courses?create=1" theme={theme} variant="purple">
            + {t("teacher.courses.createCourse")}
          </TeacherLinkBtn>
        </div>
      </div>

      {!loading && data && data.pending_grading > 0 ? (
        <TeacherAlertBanner
          theme={theme}
          to="/teacher/code-review"
          icon={<AlertCircle className="h-3.5 w-3.5 shrink-0" />}
        >
          <span>
            {tp(
              data.pending_grading === 1
                ? "teacher.dashboard.pendingBannerOne"
                : "teacher.dashboard.pendingBannerMany",
              { count: data.pending_grading },
            )}{" "}
            —{" "}
            <span className="font-medium underline">{t("teacher.dashboard.pendingBannerLink")}</span>
          </span>
        </TeacherAlertBanner>
      ) : null}

      {loading ? (
        <TeacherLoadingBlock theme={theme} label={t("teacher.dashboard.loading")} />
      ) : error ? (
        <p className="text-xs rounded-lg border px-3 py-2" style={{ color: theme.danger, borderColor: theme.border }}>
          {error}
        </p>
      ) : data ? (
        <>
          <TeacherStatGrid
            theme={theme}
            items={[
              {
                label: t("teacher.dashboard.statActiveCourses"),
                value: data.active_courses_count,
                sub: t("teacher.dashboard.statActiveCoursesSub"),
              },
              {
                label: t("teacher.dashboard.statStudentsTotal"),
                value: data.students_total,
                sub: t("teacher.dashboard.statStudentsSub"),
              },
              {
                label: t("teacher.dashboard.statPending"),
                value: data.pending_grading,
                sub: t("teacher.dashboard.statPendingSub"),
                color: data.pending_grading > 0 ? theme.danger : theme.text,
              },
              {
                label: t("teacher.dashboard.statCommitsToday"),
                value: data.commits_today,
                sub: t("teacher.dashboard.statCommitsSub"),
              },
            ]}
          />

          <TeacherMainAside
            main={
              <>
                <TeacherSurface
                  theme={theme}
                  title={t("teacher.dashboard.pendingWorkTitle")}
                  action={
                    <Link
                      to="/teacher/code-review"
                      className="text-[11px] font-normal hover:underline"
                      style={{ color: theme.accent2 }}
                    >
                      {t("teacher.dashboard.viewAll")}
                    </Link>
                  }
                  noPadding
                >
                  {data.pending_work.length === 0 ? (
                    <TeacherEmptyState theme={theme} compact>
                      {t("teacher.dashboard.noPendingWork")}
                    </TeacherEmptyState>
                  ) : (
                    data.pending_work.slice(0, 6).map((item) => (
                      <TeacherPendingRow
                        key={item.submission_id}
                        theme={theme}
                        studentName={item.student_name}
                        titleLine={`${item.student_name} — ${item.assignment_title}`}
                        subLine={`${item.course_title}${item.repo_name ? ` · ${item.repo_name}` : ""}`}
                        waitingLabel={formatWaitingBadge(item, tp)}
                        badgeTone={waitingBadgeTone(item.waiting_hours, item.is_stale)}
                        urgent={item.is_stale}
                        reviewHref={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                        gradeLabel={t("teacher.dashboard.review")}
                      />
                    ))
                  )}
                </TeacherSurface>

                <TeacherSurface theme={theme} title={t("teacher.dashboard.recentCommitsTitle")} noPadding>
                  {data.recent_commits.length === 0 ? (
                    <TeacherEmptyState theme={theme} compact>
                      {t("teacher.dashboard.noCommits")}
                    </TeacherEmptyState>
                  ) : (
                    data.recent_commits.slice(0, 8).map((c, i) => {
                      const style = ACTIVITY_ICON_STYLES[i % ACTIVITY_ICON_STYLES.length];
                      return (
                        <TeacherActivityRow
                          key={`${c.created_at}-${i}`}
                          theme={theme}
                          icon={
                            <GitCommit className="h-3.5 w-3.5" style={{ color: style.stroke }} />
                          }
                          iconBg={style.bg}
                          text={
                            <>
                              <strong>{c.student_name}</strong>
                              {c.repo_name ? (
                                <span>
                                  {" "}
                                  → {c.repo_name}
                                  {c.message ? (
                                    <span className="font-mono" style={{ color: theme.text2 }}>
                                      : «{c.message.length > 48 ? `${c.message.slice(0, 48)}…` : c.message}»
                                    </span>
                                  ) : null}
                                </span>
                              ) : c.message ? (
                                <span className="font-mono" style={{ color: theme.text2 }}>
                                  : «{c.message.length > 48 ? `${c.message.slice(0, 48)}…` : c.message}»
                                </span>
                              ) : null}
                            </>
                          }
                          time={`${formatRelativeTime(new Date(c.created_at))}`}
                        />
                      );
                    })
                  )}
                </TeacherSurface>
              </>
            }
            aside={
              <>
                <TeacherSurface theme={theme} title={t("teacher.dashboard.myCoursesTitle")} noPadding>
                  {data.courses.length === 0 ? (
                    <TeacherEmptyState theme={theme} compact>
                      {t("teacher.dashboard.noCourses")}
                    </TeacherEmptyState>
                  ) : (
                    <div className="px-3.5 py-2.5 flex flex-col gap-2">
                      {data.courses.slice(0, 6).map((c) => (
                        <TeacherCourseMiniRow
                          key={c.course_id}
                          theme={theme}
                          courseId={c.course_id}
                          title={c.title}
                          meta={tp("teacher.dashboard.courseMetaLong", {
                            students: c.students_count,
                            assignments: c.assignments_count,
                          })}
                          pendingCount={c.pending_count}
                          to={`/courses/${c.course_id}`}
                        />
                      ))}
                    </div>
                  )}
                </TeacherSurface>

                <TeacherSurface theme={theme} title={t("teacher.dashboard.deadlinesTitle")} noPadding>
                  {data.deadlines.length === 0 ? (
                    <TeacherEmptyState theme={theme} compact>
                      {t("teacher.dashboard.noDeadlines")}
                    </TeacherEmptyState>
                  ) : (
                    data.deadlines.slice(0, 5).map((d) => (
                      <TeacherDeadlineRow
                        key={d.assignment_id}
                        theme={theme}
                        assignmentTitle={d.assignment_title}
                        courseTitle={d.course_title}
                        deadlineLabel={formatDeadlineLabel(d.deadline, language, t)}
                        submittedLabel={tp("teacher.dashboard.submittedRatio", {
                          submitted: d.submitted_count,
                          total: d.total_students,
                        })}
                        urgencyColor={deadlineUrgencyColor(d.deadline, theme)}
                      />
                    ))
                  )}
                </TeacherSurface>

                <TeacherSurface
                  theme={theme}
                  title={t("teacher.dashboard.activityTitle")}
                  subtitle={t("teacher.dashboard.activitySubtitle")}
                  noPadding
                >
                  <TeacherChartBars theme={theme} items={chartItems} />
                </TeacherSurface>
              </>
            }
          />
        </>
      ) : null}
    </TeacherPageShell>
  );
}
