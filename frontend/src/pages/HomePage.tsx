import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMe } from "../api/authApi";
import { getCourses } from "../api/coursesApi";
import {
  getTeacherActivity,
  getTeacherDashboardFull,
  type TeacherActivityItem,
  type TeacherDashboardFull,
} from "../api/teacherDashboardApi";
import { getTheme } from "../theme";
import type { UserRead, Course as CourseType } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface HomePageProps {
  isDarkTheme?: boolean;
}

function formatDeadlineTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deadlineUrgency(deadlineIso: string): "today" | "tomorrow" | "later" {
  const now = new Date();
  const d = new Date(deadlineIso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() <= today.getTime()) return "today";
  if (day.getTime() === tomorrow.getTime()) return "tomorrow";
  return "later";
}

function getUrgencyLabel(
  urgency: "today" | "tomorrow" | "later",
  t: (key: string) => string,
) {
  switch (urgency) {
    case "today":
      return t("admin.home.deadlineToday");
    case "tomorrow":
      return t("admin.home.deadlineTomorrow");
    case "later":
      return t("admin.home.deadlineLater");
  }
}

function getUrgencyColor(urgency: "today" | "tomorrow" | "later", theme: ReturnType<typeof getTheme>) {
  switch (urgency) {
    case "today":
      return theme.danger;
    case "tomorrow":
      return theme.warning;
    case "later":
      return theme.text2;
  }
}

function activityLine(item: TeacherActivityItem, t: (key: string) => string): string {
  const who = item.student_name ?? t("roles.student");
  const repo = item.repo_name ? ` · ${item.repo_name}` : "";
  const msg = item.message?.trim();
  if (msg) return `${who}${repo}: ${msg}`;
  return `${who}${repo} (${item.activity_type})`;
}

export default function HomePage({ isDarkTheme = false }: HomePageProps) {
  const { t, tp, language } = useUserPreferences();
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [courses, setCourses] = useState<CourseType[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [teacherFull, setTeacherFull] = useState<TeacherDashboardFull | null>(null);
  const [activity, setActivity] = useState<TeacherActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const theme = getTheme(isDarkTheme);
  const isTeacherLike = user?.role === "teacher" || user?.role === "laborant";
  const dateLocale = language === "en" ? "en-US" : "ru-RU";

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const me = await getMe();
        if (cancelled) return;
        setUser(me);

        const coursesResult = await getCourses().catch(() => [] as CourseType[]);
        if (!cancelled) {
          setCourses(coursesResult);
          setCoursesLoading(false);
        }

        if (me.role === "teacher" || me.role === "laborant") {
          setActivityLoading(true);
          const [full, act] = await Promise.all([
            getTeacherDashboardFull().catch(() => null),
            getTeacherActivity(12).catch(() => [] as TeacherActivityItem[]),
          ]);
          if (!cancelled) {
            setTeacherFull(full);
            setActivity(act);
            setActivityLoading(false);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          setLoading(false);
          setCoursesLoading(false);
          setActivityLoading(false);
        }
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyProgress = useMemo(() => {
    const days = teacherFull?.activity_by_day ?? [];
    if (days.length === 0) return 0;
    const max = Math.max(...days.map((d) => d.commits), 1);
    const total = days.reduce((s, d) => s + d.commits, 0);
    return Math.min(100, Math.round((total / (max * days.length)) * 100));
  }, [teacherFull?.activity_by_day]);

  const filteredActivity = useMemo(() => {
    if (selectedCourse === "all") return activity;
    return activity.filter((a) => a.repo_name?.includes(selectedCourse));
  }, [activity, selectedCourse]);

  const deadlines = useMemo(() => {
    const rows = teacherFull?.deadlines ?? [];
    return [...rows]
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 8);
  }, [teacherFull?.deadlines]);

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: theme.bg }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: theme.text }}>
          {tp("admin.home.greeting", {
            name: loading ? "..." : user?.full_name || user?.email || t("admin.home.defaultName"),
          })}
        </h1>
      </div>

      {isTeacherLike && teacherFull ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            [t("admin.home.statCourses"), teacherFull.active_courses_count],
            [t("admin.home.statStudents"), teacherFull.students_total],
            [t("admin.home.statAssignments"), teacherFull.courses.reduce((s, c) => s + c.assignments_count, 0)],
            [t("admin.home.statPending"), teacherFull.pending_grading],
            [t("admin.home.statSubmissionsWeek"), teacherFull.commits_today],
            [t("admin.home.statOverdue"), teacherFull.deadlines.filter((d) => new Date(d.deadline) < new Date()).length],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border p-3"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <p className="text-xs" style={{ color: theme.text2 }}>
                {label}
              </p>
              <p className="mt-1 text-xl font-semibold" style={{ color: theme.text }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {isTeacherLike ? (
        <div className="mb-6">
          <Link
            to="/teacher/code-review"
            className="inline-flex rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {tp("admin.home.gradingQueue", { n: teacherFull?.pending_grading ?? 0 })}
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div
            className="rounded-xl border p-5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold transition-colors" style={{ color: theme.text }}>
                {t("admin.home.activityWeek")}
              </h2>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[#372579] focus:ring-1 focus:ring-[#372579] transition-colors max-w-[200px]"
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              >
                <option value="all">{t("admin.home.allCoursesOption")}</option>
                {coursesLoading ? (
                  <option disabled>{t("admin.home.loadingCoursesOption")}</option>
                ) : courses.length === 0 ? (
                  <option disabled>{t("admin.home.noCoursesOption")}</option>
                ) : (
                  courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="mb-2">
              <div className="h-3 w-full rounded-full transition-colors" style={{ backgroundColor: theme.bg4 }}>
                <div
                  className="h-3 rounded-full transition-all"
                  style={{ backgroundColor: theme.accent, width: `${weeklyProgress}%` }}
                />
              </div>
            </div>
            <div className="text-sm font-medium transition-colors" style={{ color: theme.text }}>
              {weeklyProgress}%
            </div>
          </div>

          <div
            className="rounded-xl border p-5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <h2 className="mb-3 text-lg font-semibold transition-colors" style={{ color: theme.text }}>
              {t("admin.home.recentActions")}
            </h2>
            {activityLoading ? (
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("common.loading")}
              </p>
            ) : filteredActivity.length === 0 ? (
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("admin.home.noRecentActivity")}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredActivity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 text-sm transition-colors"
                    style={{ color: theme.text2 }}
                  >
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: theme.text3 }}>
                      {formatDeadlineTime(item.created_at, dateLocale)}
                    </span>
                    <span>{activityLine(item, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            className="rounded-xl border p-5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <h2 className="mb-4 text-lg font-semibold transition-colors" style={{ color: theme.text }}>
              {t("admin.home.activeCourses")}
            </h2>
            {coursesLoading ? (
              <div className="text-sm transition-colors" style={{ color: theme.text2 }}>
                {t("admin.home.loadingCoursesList")}
              </div>
            ) : courses.length === 0 ? (
              <div className="text-sm transition-colors" style={{ color: theme.text2 }}>
                {t("admin.home.noCoursesAvailable")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <Link
                    key={course.id}
                    to={`/courses/${course.id}`}
                    className="rounded-lg border p-4 transition hover:shadow-md"
                    style={{ backgroundColor: theme.bg2, borderColor: theme.border }}
                  >
                    <div className="mb-2 text-sm font-medium transition-colors" style={{ color: theme.text }}>
                      {course.title}
                    </div>
                    <div className="text-xs transition-colors" style={{ color: theme.text2 }}>
                      {course.description || t("admin.courses.noDescription")}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div
            className="rounded-xl border p-5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <h2 className="mb-4 text-lg font-semibold transition-colors" style={{ color: theme.text }}>
              {t("admin.home.deadlines")}
            </h2>
            {deadlines.length === 0 ? (
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("admin.home.noDeadlines")}
              </p>
            ) : (
              <ul className="space-y-3">
                {deadlines.map((deadline) => {
                  const urgency = deadlineUrgency(deadline.deadline);
                  return (
                    <li
                      key={deadline.assignment_id}
                      className="border-l-2 pl-3 transition-colors"
                      style={{ borderColor: theme.border }}
                    >
                      <div
                        className="text-xs transition-colors"
                        style={{ color: getUrgencyColor(urgency, theme) }}
                      >
                        {getUrgencyLabel(urgency, t)} · {formatDeadlineTime(deadline.deadline, dateLocale)}
                      </div>
                      <div className="text-sm transition-colors" style={{ color: theme.text2 }}>
                        {deadline.assignment_title}
                      </div>
                      <div className="text-[11px]" style={{ color: theme.text3 }}>
                        {deadline.course_title} · {deadline.submitted_count}/{deadline.total_students}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            className="rounded-xl border p-5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.bg2, borderColor: theme.border }}
          >
            <h2 className="mb-3 text-lg font-semibold transition-colors" style={{ color: theme.text }}>
              {t("admin.home.tips")}
            </h2>
            <p className="text-sm italic transition-colors" style={{ color: theme.text2 }}>
              &quot;{t("admin.home.pushReminder")}&quot;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
