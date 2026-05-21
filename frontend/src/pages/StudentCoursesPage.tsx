import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, Loader2, User, AlertCircle, RefreshCw } from "lucide-react";
import { useAuthUser } from "../context/AuthUserContext";
import type { StudentMergedCourse } from "../api/studentDashboardApi";
import {
  getStudentAssignmentsDeduped,
  getStudentMergedCoursesDeduped,
  invalidateStudentMergedCoursesMemCache,
} from "../api/studentRequestDedup";
import { StudentPageShell } from "../components/student/studentPageUi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { pluralWord } from "../i18n/plural";
import { getTheme } from "../theme";
import { gradeColorForPercent } from "../utils/gradeScoring";
import { clearLkCoursesCache, readLkCoursesCache, writeLkCoursesCache } from "../utils/lkCoursesCache";

const BANNER_GRADIENTS = [
  "linear-gradient(135deg,#1a237e,#283593)",
  "linear-gradient(135deg,#4a148c,#6a1b9a)",
  "linear-gradient(135deg,#1b5e20,#2e7d32)",
  "linear-gradient(135deg,#b71c1c,#c62828)",
  "linear-gradient(135deg,#0d47a1,#1565c0)",
];

const BANNER_EMOJI = ["🗄️", "🔐", "🌐", "📐", "💻", "🧮"];

type TabKey = "active" | "done" | "all";

interface StudentCoursesPageProps {
  isDarkTheme?: boolean;
}

export default function StudentCoursesPage({ isDarkTheme = false }: StudentCoursesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<StudentMergedCourse[]>([]);
  const [lkWarning, setLkWarning] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("active");
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof getStudentAssignmentsDeduped>>>([]);
  const [lkRefreshing, setLkRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();
  const { user } = useAuthUser();

  const loadCourses = async (refreshLk: boolean) => {
    if (refreshLk) {
      clearLkCoursesCache();
      invalidateStudentMergedCoursesMemCache();
      setLkRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [merged, asn] = await Promise.all([
        getStudentMergedCoursesDeduped(refreshLk),
        getStudentAssignmentsDeduped(200),
      ]);
      if (user?.group_name) setGroupName(user.group_name);
      setCourses(merged.courses);
      setLkWarning(merged.lk_warning);
      setAssignments(asn);
      writeLkCoursesCache(merged);
    } catch (err) {
      const cached = readLkCoursesCache();
      if (cached) {
        setCourses(cached.courses);
        setLkWarning(cached.lk_warning);
        setError(
          err instanceof Error
            ? `${t("student.errors.loadCourses")}: ${err.message}`
            : t("student.errors.loadCourses"),
        );
      } else {
        setCourses([]);
        setLkWarning(null);
        setError(err instanceof Error ? err.message : t("student.errors.loadCourses"));
      }
    } finally {
      setLoading(false);
      setLkRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.group_name) setGroupName(user.group_name);
  }, [user?.group_name]);

  useEffect(() => {
    const cached = readLkCoursesCache();
    if (cached) {
      setCourses(cached.courses);
      setLkWarning(cached.lk_warning);
      setLoading(false);
    }
    void loadCourses(false);
  }, [user?.id]);

  const courseStats = useMemo(() => {
    const map = new Map<string, { total: number; graded: number; overdue: number }>();
    for (const a of assignments) {
      const key = a.course_id;
      const cur = map.get(key) ?? { total: 0, graded: 0, overdue: 0 };
      cur.total += 1;
      if (a.status === "graded") cur.graded += 1;
      if (a.status === "overdue") cur.overdue += 1;
      map.set(key, cur);
    }
    return map;
  }, [assignments]);

  const isDone = (course: StudentMergedCourse) => {
    if (course.assignments_total > 0) {
      return course.assignments_graded >= course.assignments_total;
    }
    return false;
  };

  const isActive = (course: StudentMergedCourse) => !isDone(course);

  const filtered = useMemo(() => {
    let list = courses;
    if (tab === "done") list = list.filter(isDone);
    else if (tab === "active") list = list.filter(isActive);
    if (searchQuery) {
      list = list.filter((c) => {
        const hay = `${c.title} ${c.teacher_name ?? ""}`.toLowerCase();
        return hay.includes(searchQuery);
      });
    }
    return list;
  }, [courses, tab, searchQuery]);

  const doneCount = useMemo(() => courses.filter(isDone).length, [courses]);

  const tabs: { id: TabKey; label: string }[] = [
    { id: "active", label: tp("student.courses.tabActive", { n: Math.max(0, courses.length - doneCount) }) },
    { id: "done", label: tp("student.courses.tabDone", { n: doneCount }) },
    { id: "all", label: tp("student.courses.tabAll", { n: courses.length }) },
  ];

  const warningText =
    lkWarning === "lk_credentials_missing"
      ? t("student.courses.lkCredentialsMissing")
      : lkWarning === "lk_auth_failed"
        ? t("student.courses.lkAuthFailed")
        : lkWarning === "lk_unavailable"
          ? t("student.courses.lkUnavailable")
          : null;

  return (
    <StudentPageShell>
      {error ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: `${theme.danger}12`,
            borderColor: `${theme.danger}40`,
            color: theme.danger,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadCourses(false)}
            className="rounded-lg border px-3 py-1 text-xs font-medium"
            style={{ borderColor: `${theme.danger}55`, color: theme.danger }}
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}
      {searchQuery ? (
        <p className="text-xs" style={{ color: theme.text2 }}>
          {tp("admin.courses.searchQuery", { q: searchParams.get("q") ?? "" })}
        </p>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: theme.text }}>
            {t("student.courses.title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
            {groupName ? `${groupName} · ` : ""}
            {courses.length} {pluralWord(language, "student.plural.courses", courses.length)}
          </p>
        </div>
        <button
          type="button"
          disabled={lkRefreshing}
          onClick={() => void loadCourses(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ borderColor: theme.border, color: theme.text2 }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${lkRefreshing ? "animate-spin" : ""}`} />
          {t("student.courses.refreshLk")}
        </button>
      </header>

      <p className="text-xs" style={{ color: theme.text3 }}>
        {t("student.courses.lkCacheHint")}
      </p>

      {warningText ? (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: theme.warning,
            backgroundColor: `${theme.warning}14`,
            color: theme.text2,
          }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" style={{ color: theme.warning }} />
          <span>{warningText}</span>
        </div>
      ) : null}

      <div
        className="inline-flex gap-1 rounded-lg border p-1 w-fit"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: tab === tabItem.id ? theme.bg4 : "transparent",
              color: tab === tabItem.id ? theme.text : theme.text2,
            }}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("student.courses.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border py-16 text-center text-sm"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text2 }}
        >
          {t("student.courses.empty")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((course, i) => (
              <CourseCard
                key={course.id}
                course={course}
                index={i}
                theme={theme}
                groupName={groupName}
                platformStats={
                  course.platform_course_id
                    ? courseStats.get(course.platform_course_id)
                    : undefined
                }
                t={t}
                tp={tp}
              />
            ))}
          </div>
          {assignments.length > 0 ? (
            <div
              className="rounded-xl border overflow-hidden mt-2"
              style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
            >
              <div
                className="px-4 py-2 border-b text-sm font-medium"
                style={{ borderColor: theme.border, color: theme.text }}
              >
                {t("student.courses.upcomingAssignments")}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ color: theme.text3 }}>
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">{t("student.courses.colAssignment")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("student.courses.colCourse")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("student.courses.colDeadline")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("student.courses.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...assignments]
                      .filter((a) => {
                        const dl = new Date(a.deadline).getTime();
                        return dl >= Date.now() && a.status !== "graded";
                      })
                      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                      .slice(0, 8)
                      .map((a) => (
                        <tr key={a.id} className="border-t" style={{ borderColor: theme.border, color: theme.text2 }}>
                          <td className="px-4 py-2">
                            <Link to={`/courses/${a.course_id}/assignments/${a.id}`} style={{ color: theme.text }}>
                              {a.title}
                            </Link>
                          </td>
                          <td className="px-4 py-2">{a.course_title}</td>
                          <td className="px-4 py-2">
                            {new Date(a.deadline).toLocaleDateString(language === "en" ? "en-US" : "ru-RU")}
                          </td>
                          <td className="px-4 py-2">{t(`status.${a.status}`)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </StudentPageShell>
  );
}

function CourseCard({
  course,
  index,
  theme,
  groupName,
  platformStats,
  t,
  tp,
}: {
  course: StudentMergedCourse;
  index: number;
  theme: ReturnType<typeof getTheme>;
  groupName: string | null;
  platformStats?: { total: number; graded: number; overdue: number };
  t: (key: string) => string;
  tp: (key: string, params?: Record<string, string | number | null | undefined>) => string;
}) {
  const gradient = BANNER_GRADIENTS[index % BANNER_GRADIENTS.length];
  const emoji = BANNER_EMOJI[index % BANNER_EMOJI.length];
  const pct = course.percent;
  const progress =
    pct != null
      ? Math.min(100, Math.round(pct))
      : platformStats && platformStats.total > 0
        ? Math.round((platformStats.graded / platformStats.total) * 100)
        : course.attendance_percent != null
          ? Math.round(course.attendance_percent)
          : 0;

  const scoreText =
    course.score_label ??
    (course.score != null
      ? course.source === "lk"
        ? `${course.score}%`
        : String(course.score)
      : "—");

  const openHref = course.has_platform && course.platform_course_id
    ? `/courses/${course.platform_course_id}`
    : null;

  const teacherLine =
    course.teacher_name ??
    (course.source === "lk" ? t("student.courses.lkOnly") : t("student.courses.groupFallback"));

  return (
    <article
      className="rounded-xl border overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      <div className="h-20 flex items-center justify-center relative" style={{ background: gradient }}>
        <span className="text-3xl">{emoji}</span>
      </div>
      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
            {course.title}
          </h2>
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: theme.text2 }}>
            <User className="h-3 w-3" />
            {course.teacher_name
              ? course.teacher_name
              : tp("student.courses.teacherGroup", { group: groupName ?? t("student.courses.groupFallback") })}
          </p>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span style={{ color: theme.text2 }}>
              {course.source === "lk" ? t("student.courses.attendance") : t("student.courses.courseProgress")}
            </span>
            <span style={{ color: gradeColorForPercent(pct, theme) }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: gradeColorForPercent(pct, theme) }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { val: scoreText, lbl: course.source === "lk" ? t("student.courses.attendance") : t("student.courses.score") },
            {
              val:
                course.assignments_total > 0
                  ? `${course.assignments_graded}/${course.assignments_total}`
                  : platformStats
                    ? `${platformStats.graded}/${platformStats.total}`
                    : "—",
              lbl: t("student.courses.submitted"),
            },
            {
              val: course.attendance_skips != null ? String(course.attendance_skips) : String(course.enrolled_count ?? 0),
              lbl: course.attendance_skips != null ? t("student.courses.skips") : t("student.courses.inGroup"),
            },
          ].map((s) => (
            <div key={s.lbl} className="rounded-md py-1.5" style={{ backgroundColor: theme.bg }}>
              <div className="text-sm font-semibold truncate px-0.5" style={{ color: theme.text }}>
                {s.val}
              </div>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: theme.text3 }}>
                {s.lbl}
              </div>
            </div>
          ))}
        </div>
        <div
          className="flex items-center justify-between pt-2 border-t mt-auto"
          style={{ borderColor: theme.border }}
        >
          <span className="text-[11px] flex items-center gap-1" style={{ color: theme.text2 }}>
            <Clock className="h-3 w-3" />
            {course.assignments_total > 0
              ? tp("student.courses.assignmentsCount", { n: course.assignments_total })
              : t("student.courses.assignmentsInCourse")}
          </span>
          {openHref ? (
            <Link
              to={openHref}
              className="text-[11px] font-medium rounded-md px-2.5 py-1"
              style={{ backgroundColor: theme.accent, color: "#fff" }}
            >
              {t("student.courses.open")}
            </Link>
          ) : (
            <span className="text-[10px]" style={{ color: theme.text3 }}>
              {teacherLine}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
