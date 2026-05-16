import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMe } from "../api/authApi";
import { getCourses } from "../api/coursesApi";
import { getTeacherDashboard, type TeacherDashboard } from "../api/teacherDashboardApi";
import { getTheme } from "../theme";
import type { UserRead, Course as CourseType } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface Activity {
  id: string;
  text: string;
  type: "submission" | "comment" | "deadline";
}

interface Course {
  id: string;
  name: string;
  rating: number;
}

interface Deadline {
  id: string;
  time: string;
  title: string;
  urgency: "today" | "tomorrow" | "later";
}

interface StudentRating {
  id: string;
  name: string;
  points: number;
}

interface CourseDisplay {
  id: string;
  name: string;
  rating: number;
}

const mockCourses: CourseDisplay[] = [
  { id: "1", name: "Databases", rating: 4 },
  { id: "2", name: "Web Development", rating: 3 },
  { id: "3", name: "Advanced Python", rating: 5 },
];

const mockDeadlines: Deadline[] = [
  { id: "1", time: "17:00", title: "Lab #3", urgency: "today" },
  { id: "2", time: "23:59", title: "DB Test", urgency: "tomorrow" },
  { id: "3", time: "", title: "Term paper", urgency: "later" },
];

const mockRatings: StudentRating[] = [
  { id: "1", name: "Petrov I.", points: 450 },
  { id: "2", name: "Ivanov A.", points: 420 },
  { id: "3", name: "Sidorov K.", points: 380 },
];

function getActivityIcon(type: Activity["type"]) {
  switch (type) {
    case "submission":
      return "✅";
    case "comment":
      return "💬";
    case "deadline":
      return "🔥";
  }
}

function StarRating({ rating, theme }: { rating: number; theme: any }) {
  return (
    <span style={{ color: theme.warning }}>
      {Array.from({ length: 5 }).map((_, i) =>
        i < rating ? "⭐" : "☆"
      )}
    </span>
  );
}

function getUrgencyLabel(
  urgency: Deadline["urgency"],
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

function getUrgencyColor(urgency: Deadline["urgency"], theme: any) {
  switch (urgency) {
    case "today":
      return theme.danger;
    case "tomorrow":
      return theme.warning;
    case "later":
      return theme.text2;
  }
}

interface HomePageProps {
  isDarkTheme?: boolean;
}

export default function HomePage({ isDarkTheme = false }: HomePageProps) {
  const { t, tp } = useUserPreferences();
  const mockActivities: Activity[] = [
    { id: "1", text: t("admin.home.activitySubmission"), type: "submission" },
    { id: "2", text: t("admin.home.activityComment"), type: "comment" },
    { id: "3", text: t("admin.home.activityDeadline"), type: "deadline" },
  ];
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [courses, setCourses] = useState<CourseType[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [teacherDash, setTeacherDash] = useState<TeacherDashboard | null>(null);

  const theme = getTheme(isDarkTheme);
  const isTeacherLike = user?.role === "teacher" || user?.role === "laborant";

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const me = await getMe();
        const tasks: Promise<unknown>[] = [getCourses()];
        if (me.role === "teacher" || me.role === "laborant") {
          tasks.push(getTeacherDashboard());
        }
        const results = await Promise.allSettled(tasks);
        if (!cancelled) {
          setUser(me);
          const coursesResult = results[0];
          if (coursesResult.status === "fulfilled") {
            setCourses(coursesResult.value as CourseType[]);
          }
          if (results[1]?.status === "fulfilled") {
            setTeacherDash(results[1].value as TeacherDashboard);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setLoading(false);
          setCoursesLoading(false);
        }
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyProgress = 75;

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: theme.bg }}>
      {/* Приветствие */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: theme.text }}>
          {tp("admin.home.greeting", {
            name: loading ? "..." : user?.full_name || user?.email || t("admin.home.defaultName"),
          })}
        </h1>
      </div>

      {isTeacherLike && teacherDash ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            [t("admin.home.statCourses"), teacherDash.courses_count],
            [t("admin.home.statStudents"), teacherDash.students_total],
            [t("admin.home.statAssignments"), teacherDash.assignments_total],
            [t("admin.home.statPending"), teacherDash.pending_grading],
            [t("admin.home.statSubmissionsWeek"), teacherDash.submissions_this_week],
            [t("admin.home.statOverdue"), teacherDash.overdue_assignments],
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
            to="/grading-queue"
            className="inline-flex rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {tp("admin.home.gradingQueue", { n: teacherDash?.pending_grading ?? 0 })}
          </Link>
        </div>
      ) : null}

      {/* Основная сетка: контент + сайдбар */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Левая колонка (основной контент) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Активность за неделю */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.activityWeek")}</h2>
              </div>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[#372579] focus:ring-1 focus:ring-[#372579] transition-colors"
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

            {/* Прогресс бар */}
            <div className="mb-2">
              <div className="h-3 w-full rounded-full transition-colors" style={{ backgroundColor: theme.bg4 }}>
                <div
                  className="h-3 rounded-full transition-all"
                  style={{ backgroundColor: theme.accent, width: `${weeklyProgress}%` }}
                />
              </div>
            </div>
            <div className="text-sm font-medium transition-colors" style={{ color: theme.text }}>{weeklyProgress}%</div>
          </div>

          {/* Последние действия */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <h2 className="mb-3 text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.recentActions")}</h2>
            <ul className="space-y-2">
              {mockActivities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-2 text-sm transition-colors" style={{ color: theme.text2 }}>
                  <span>{getActivityIcon(activity.type)}</span>
                  <span>{activity.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Активные курсы */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <h2 className="mb-4 text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.activeCourses")}</h2>
            {coursesLoading ? (
              <div className="text-sm transition-colors" style={{ color: theme.text2 }}>{t("admin.home.loadingCoursesList")}</div>
            ) : courses.length === 0 ? (
              <div className="text-sm transition-colors" style={{ color: theme.text2 }}>{t("admin.home.noCoursesAvailable")}</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <div
                    key={course.id}
                    className="rounded-lg border p-4 transition hover:shadow-md transition-colors"
                    style={{ backgroundColor: theme.bg2, borderColor: theme.border }}
                  >
                    <div className="mb-2 text-sm font-medium transition-colors" style={{ color: theme.text }}>{course.title}</div>
                    <div className="text-xs transition-colors" style={{ color: theme.text2 }}>{course.description || t("admin.courses.noDescription")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка (сайдбар) */}
        <div className="space-y-6">
          {/* Дедлайны */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <h2 className="mb-4 text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.deadlines")}</h2>
            <ul className="space-y-3">
              {mockDeadlines.map((deadline) => (
                <li key={deadline.id} className="border-l-2 pl-3 transition-colors" style={{ borderColor: theme.border }}>
                  <div className="text-xs transition-colors" style={{ color: getUrgencyColor(deadline.urgency, theme) }}>
                    {getUrgencyLabel(deadline.urgency, t)} {deadline.time}
                  </div>
                  <div className="text-sm transition-colors" style={{ color: theme.text2 }}>{deadline.title}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* Рейтинг */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
            <h2 className="mb-4 text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.rating")}</h2>
            <ul className="space-y-2">
              {mockRatings.map((student, index) => (
                <li key={student.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: theme.text2 }}>
                    <span className="mr-2 font-medium" style={{ color: theme.text3 }}>{index + 1}.</span>
                    {student.name}
                  </span>
                  <span className="font-medium" style={{ color: theme.accent }}>{student.points}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Советы */}
          <div className="rounded-xl border p-5 shadow-sm transition-colors" style={{ backgroundColor: theme.bg2, borderColor: theme.border }}>
            <h2 className="mb-3 text-lg font-semibold transition-colors" style={{ color: theme.text }}>{t("admin.home.tips")}</h2>
            <p className="text-sm italic transition-colors" style={{ color: theme.text2 }}>&quot;{t("admin.home.pushReminder")}&quot;</p>
          </div>
        </div>
      </div>
    </div>
  );
}
