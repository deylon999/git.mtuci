import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2, Search, TrendingUp } from "lucide-react";
import {
  getStudentGrades,
  type StudentGradeItem,
  type StudentGradesSummary,
} from "../api/studentDashboardApi";
import { StudentPageShell } from "../components/student/studentPageUi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface StudentGradesPageProps {
  isDarkTheme?: boolean;
}

function displayScore(item: StudentGradeItem): string {
  if (item.final_grade != null) return String(Math.round(item.final_grade));
  if (item.grade != null) return String(item.grade);
  return "—";
}

export default function StudentGradesPage({ isDarkTheme = false }: StudentGradesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StudentGradesSummary | null>(null);
  const [query, setQuery] = useState("");
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const summary = await getStudentGrades(200);
        if (!cancelled) setData(summary);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("student.errors.loadGrades"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.items;
    return data.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.course_title.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <StudentPageShell>
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.accent}22`, color: theme.accent2 }}
          >
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{t("student.grades.title")}</h1>
            <p className="text-sm" style={{ color: theme.text2 }}>
              {t("student.grades.subtitle")}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <p className="text-sm" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : data ? (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                [t("student.grades.statAverage"), data.overall_average != null ? data.overall_average : "—"],
                [t("student.grades.statGraded"), String(data.graded_count)],
                [t("student.grades.statPendingReview"), String(data.pending_review)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                >
                  <p className="text-xs" style={{ color: theme.text2 }}>
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            {data.courses.length > 0 ? (
              <div className="mb-6 flex flex-col gap-2">
                <p className="text-xs font-medium" style={{ color: theme.text2 }}>
                  {t("student.grades.courseAverages")}
                </p>
                <div className="flex items-end gap-2 h-28 px-1">
                  {data.courses.map((course) => {
                    const pct =
                      course.average_score != null && course.grade_max > 0
                        ? Math.min(100, (course.average_score / course.grade_max) * 100)
                        : 8;
                    return (
                      <div key={course.course_id} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <div
                          className="w-full rounded-t-md"
                          style={{ height: `${pct}%`, minHeight: 4, backgroundColor: theme.accent }}
                        />
                        <span className="text-[9px] truncate w-full text-center" style={{ color: theme.text3 }}>
                          {course.title.slice(0, 8)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {data.courses.map((course) => {
                  const open = expandedCourses.has(course.course_id);
                  const courseItems = data.items.filter((i) => i.course_id === course.course_id);
                  return (
                    <div
                      key={course.course_id}
                      className="rounded-xl border overflow-hidden"
                      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCourses((prev) => {
                            const next = new Set(prev);
                            if (next.has(course.course_id)) next.delete(course.course_id);
                            else next.add(course.course_id);
                            return next;
                          })
                        }
                        className="w-full flex items-center gap-2 px-4 py-3 text-left"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: theme.text2 }} />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: theme.text2 }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{course.title}</p>
                          <p className="text-xs" style={{ color: theme.text2 }}>
                            {course.teacher_name}
                          </p>
                        </div>
                        <span className="text-sm font-semibold shrink-0">
                          {course.average_score != null ? course.average_score : "—"}/{course.grade_max}
                        </span>
                      </button>
                      {open ? (
                        <div className="border-t" style={{ borderColor: theme.border }}>
                          {courseItems.map((item) => (
                            <Link
                              key={item.assignment_id}
                              to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                              className="flex items-center justify-between px-4 py-2 text-sm border-b last:border-b-0"
                              style={{ borderColor: theme.border }}
                            >
                              <span>{item.title}</span>
                              <span>
                                {displayScore(item)} / {item.grade_max}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div
              className="mb-3 flex h-9 items-center gap-2 rounded-lg border px-3"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
            >
              <Search className="h-4 w-4" style={{ color: theme.text2 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("student.grades.searchPlaceholder")}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: theme.text }}
              />
            </div>

            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm" style={{ color: theme.text2 }}>
                  {t("student.grades.empty")}
                </p>
              ) : (
                filtered.map((item) => (
                  <Link
                    key={item.assignment_id}
                    to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                    className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:opacity-90"
                    style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {item.course_title}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        {displayScore(item)}
                        <span className="text-xs font-normal" style={{ color: theme.text2 }}>
                          {" "}
                          / {item.grade_max}
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {t(`status.${item.status}`)}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </>
        ) : null}
    </StudentPageShell>
  );
}
