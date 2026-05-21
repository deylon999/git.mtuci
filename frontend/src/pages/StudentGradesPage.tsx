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
import {
  formatGradeTotal,
  gradeColorForPercent,
  gradePercent,
} from "../utils/gradeScoring";

interface StudentGradesPageProps {
  isDarkTheme?: boolean;
}

function itemPoints(item: StudentGradeItem): number | null {
  if (item.final_grade != null) return item.final_grade;
  if (item.grade != null) return item.grade;
  return null;
}

function itemScoreLabel(item: StudentGradeItem): string {
  const pts = itemPoints(item);
  if (pts == null) return "—";
  return String(Math.round(pts));
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

  const semesterPercent = data?.overall_average ?? data?.overall_percent ?? null;
  const progressPct = data?.overall_percent ?? semesterPercent ?? 0;

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
          <div
            className="mb-6 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div className="text-center sm:text-left">
              <p className="text-2xl font-bold" style={{ color: gradeColorForPercent(semesterPercent, theme) }}>
                {semesterPercent != null ? `${semesterPercent}%` : "—"}
              </p>
              <p className="text-xs" style={{ color: theme.text2 }}>
                {t("student.grades.statAverage")}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex justify-between text-xs">
                <span style={{ color: theme.text2 }}>{t("student.grades.semesterProgress")}</span>
                <span style={{ color: theme.accent2, fontWeight: 600 }}>
                  {data.overall_percent != null ? `${data.overall_percent}%` : "—"}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, progressPct)}%`,
                    backgroundColor: gradeColorForPercent(data.overall_percent, theme),
                  }}
                />
              </div>
              <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
                {data.overall_max > 0
                  ? formatGradeTotal(data.overall_earned, data.overall_max, data.overall_percent)
                  : "—"}
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              {[
                [t("student.grades.statGraded"), String(data.graded_count)],
                [t("student.grades.statPendingReview"), String(data.pending_review)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: theme.bg2 }}
                >
                  <p className="text-base font-semibold">{value}</p>
                  <p className="text-[10px]" style={{ color: theme.text2 }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {data.courses.length > 0 ? (
            <div className="mb-6 flex flex-col gap-2">
              <p className="text-xs font-medium" style={{ color: theme.text2 }}>
                {t("student.grades.courseAverages")}
              </p>
              {data.courses.map((course) => {
                const open = expandedCourses.has(course.course_id);
                const courseItems = data.items.filter((i) => i.course_id === course.course_id);
                const pct = course.percent ?? gradePercent(course.earned_points, course.max_points);
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
                      <div className="shrink-0 text-right">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: gradeColorForPercent(pct, theme) }}
                        >
                          {course.max_points > 0
                            ? formatGradeTotal(course.earned_points, course.max_points, pct)
                            : "—"}
                        </p>
                        {pct != null ? (
                          <div
                            className="mt-1 h-1 w-24 rounded-full overflow-hidden ml-auto"
                            style={{ backgroundColor: theme.bg4 }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                backgroundColor: gradeColorForPercent(pct, theme),
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </button>
                    {open ? (
                      <div className="border-t" style={{ borderColor: theme.border }}>
                        {courseItems.map((item) => {
                          const pts = itemPoints(item);
                          const itemPct =
                            item.percent ??
                            (pts != null ? gradePercent(pts, item.grade_max) : null);
                          return (
                            <Link
                              key={item.assignment_id}
                              to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                              className="flex items-center justify-between gap-3 px-4 py-2 text-sm border-b last:border-b-0"
                              style={{ borderColor: theme.border }}
                            >
                              <span>{item.title}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {itemPct != null ? (
                                  <div
                                    className="h-1 w-12 rounded-full overflow-hidden"
                                    style={{ backgroundColor: theme.bg4 }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, itemPct)}%`,
                                        backgroundColor: gradeColorForPercent(itemPct, theme),
                                      }}
                                    />
                                  </div>
                                ) : null}
                                <span style={{ color: gradeColorForPercent(itemPct, theme) }}>
                                  {itemScoreLabel(item)} / {item.grade_max}
                                </span>
                              </div>
                            </Link>
                          );
                        })}
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
              filtered.map((item) => {
                const pts = itemPoints(item);
                const itemPct =
                  item.percent ?? (pts != null ? gradePercent(pts, item.grade_max) : null);
                return (
                  <Link
                    key={item.assignment_id}
                    to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors hover:opacity-90"
                    style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {item.course_title}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-lg font-semibold"
                        style={{ color: gradeColorForPercent(itemPct, theme) }}
                      >
                        {itemScoreLabel(item)}
                        <span className="text-xs font-normal" style={{ color: theme.text2 }}>
                          {" "}
                          / {item.grade_max}
                        </span>
                      </p>
                      {itemPct != null ? (
                        <div
                          className="mt-1 h-1 w-16 rounded-full overflow-hidden ml-auto"
                          style={{ backgroundColor: theme.bg4 }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, itemPct)}%`,
                              backgroundColor: gradeColorForPercent(itemPct, theme),
                            }}
                          />
                        </div>
                      ) : null}
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {t(`status.${item.status}`)}
                      </p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </StudentPageShell>
  );
}
