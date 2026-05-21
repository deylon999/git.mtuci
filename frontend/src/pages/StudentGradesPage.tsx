import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  type StudentGradeCourse,
  type StudentGradeItem,
  type StudentGradesSummary,
} from "../api/studentDashboardApi";
import { getCachedStudentGroupRanking, getStudentGradesDeduped } from "../api/studentRequestDedup";
import { StudentPageShell } from "../components/student/studentPageUi";
import { useAuthUser } from "../context/AuthUserContext";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";
import { gradeColorForPercent, gradePercent } from "../utils/gradeScoring";

interface StudentGradesPageProps {
  isDarkTheme?: boolean;
}

const COURSE_AVATAR_PALETTE = [
  { bg: "rgba(37,99,235,0.15)", color: "#60a5fa" },
  { bg: "rgba(139,92,246,0.15)", color: "#a78bfa" },
  { bg: "rgba(76,175,80,0.15)", color: "#4caf50" },
  { bg: "rgba(226,75,74,0.12)", color: "#e24b4a" },
  { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
];

function courseInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

function courseAvatar(index: number) {
  return COURSE_AVATAR_PALETTE[index % COURSE_AVATAR_PALETTE.length];
}

function itemPoints(item: StudentGradeItem): number | null {
  if (item.final_grade != null) return item.final_grade;
  if (item.grade != null) return item.grade;
  return null;
}

function inferTypeKey(title: string): "typeLab" | "typeTest" | "typeCourse" | "typeAssignment" {
  const lower = title.toLowerCase();
  if (lower.includes("тест") || lower.includes("test")) return "typeTest";
  if (lower.includes("курс")) return "typeCourse";
  if (lower.includes("лаб") || lower.includes("lab")) return "typeLab";
  return "typeAssignment";
}

function formatSubmittedAt(
  item: StudentGradeItem,
  t: (key: string) => string,
  language: string,
): string {
  if (item.status === "overdue" && !item.submitted_at) {
    return t("student.grades.notSubmitted");
  }
  if (item.status === "submitted") {
    return t("student.grades.onReview");
  }
  if (!item.submitted_at) return "—";
  const d = new Date(item.submitted_at);
  const now = new Date();
  if (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  ) {
    return t("student.grades.submittedToday");
  }
  return d.toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function courseDisplayScore(course: StudentGradeCourse): number | null {
  if (course.percent != null) return Math.round(course.percent);
  if (course.average_score != null) return course.average_score;
  return null;
}

export default function StudentGradesPage({ isDarkTheme = false }: StudentGradesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const { user } = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StudentGradesSummary | null>(null);
  const [groupPlace, setGroupPlace] = useState<number | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const summary = await getStudentGradesDeduped(200);
        if (cancelled) return;
        setData(summary);
        setGroupPlace(getCachedStudentGroupRanking()?.your_place ?? null);
        if (summary.courses.length > 0) {
          setExpandedCourses(new Set([summary.courses[0].course_id]));
        }
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

  const stats = useMemo(() => {
    if (!data) {
      return {
        average: null as number | null,
        progress: 0,
        best: null as number | null,
        submitted: "—",
        groupPlace: null as number | null,
      };
    }
    let submitted = 0;
    let total = 0;
    let best: number | null = null;
    for (const c of data.courses) {
      submitted += c.assignments_submitted;
      total += c.assignments_total;
      const score = courseDisplayScore(c);
      if (score != null && (best == null || score > best)) best = score;
    }
    for (const item of data.items) {
      const pts = itemPoints(item);
      const pct = item.percent ?? (pts != null ? gradePercent(pts, item.grade_max) : null);
      if (pct != null && (best == null || pct > best)) best = Math.round(pct);
    }
    return {
      average: data.overall_average ?? data.overall_percent,
      progress: data.overall_percent ?? 0,
      best,
      submitted: total > 0 ? `${submitted}/${total}` : "0",
      groupPlace,
    };
  }, [data, groupPlace]);

  const groupLabel = user?.group_name ?? t("student.grades.groupFallback");
  const averageLabel =
    stats.average != null ? String(stats.average) : "—";
  const pageSubtitle =
    stats.average != null
      ? tp("student.grades.subtitle", { group: groupLabel, average: averageLabel })
      : tp("student.grades.subtitleNoAverage", { group: groupLabel });

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  return (
    <StudentPageShell className="gap-3.5 min-w-0 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
            {t("student.grades.title")}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>
            {pageSubtitle}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-8" style={{ color: theme.text2 }}>
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
            className="flex items-center gap-3.5 rounded-[10px] border px-4 py-3.5"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div className="text-center shrink-0">
              <p className="text-[36px] font-bold leading-none" style={{ color: theme.text }}>
                {stats.average != null ? stats.average : "—"}
              </p>
              <p className="text-[11px] mt-1" style={{ color: theme.text2 }}>
                {t("student.grades.statAverage")}
              </p>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span style={{ color: theme.text }}>{t("student.grades.semesterProgress")}</span>
                <span className="font-semibold" style={{ color: theme.accent2 }}>
                  {data.overall_percent != null ? `${Math.round(data.overall_percent)}%` : "—"}
                </span>
              </div>
              <div className="h-2 rounded-[3px] overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                <div
                  className="h-full rounded-[3px]"
                  style={{
                    width: `${Math.min(100, stats.progress)}%`,
                    backgroundColor: theme.accent,
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2.5 shrink-0">
              <StatPill
                value={stats.best != null ? String(stats.best) : "—"}
                label={t("student.grades.statBest")}
                valueColor={stats.best != null ? theme.success : theme.text}
                theme={theme}
              />
              <StatPill value={stats.submitted} label={t("student.grades.statSubmitted")} theme={theme} />
              <StatPill
                value={stats.groupPlace != null ? String(stats.groupPlace) : "—"}
                label={t("student.grades.statGroupRank")}
                valueColor={stats.groupPlace != null ? theme.warning : theme.text2}
                theme={theme}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {data.courses.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: theme.text2 }}>
                {t("student.grades.empty")}
              </p>
            ) : (
              data.courses.map((course, index) => {
                const open = expandedCourses.has(course.course_id);
                const courseItems = data.items.filter((i) => i.course_id === course.course_id);
                const pct = course.percent ?? gradePercent(course.earned_points, course.max_points);
                const score = courseDisplayScore(course);
                const av = courseAvatar(index);

                return (
                  <div
                    key={course.course_id}
                    className="rounded-[10px] border overflow-hidden"
                    style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCourse(course.course_id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                      style={{
                        borderBottom: open ? `0.5px solid ${theme.border}` : "0.5px solid transparent",
                        backgroundColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDarkTheme
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-xs font-bold"
                        style={{ backgroundColor: av.bg, color: av.color }}
                      >
                        {courseInitials(course.title)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                          {course.title}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: theme.text2 }}>
                          {course.teacher_name}
                        </p>
                      </div>
                      <div className="ml-auto text-right shrink-0">
                        <p
                          className="text-xl font-semibold leading-tight"
                          style={{ color: gradeColorForPercent(pct, theme) }}
                        >
                          {score != null ? score : "—"}
                        </p>
                        <p className="text-[11px]" style={{ color: theme.text2 }}>
                          {tp("student.grades.scoreOfMax", { max: course.grade_max })}
                        </p>
                      </div>
                      <div className="w-[100px] shrink-0 ml-3">
                        <div className="h-[5px] rounded-[3px] overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                          <div
                            className="h-full rounded-[3px]"
                            style={{
                              width: `${Math.min(100, pct ?? 0)}%`,
                              backgroundColor: gradeColorForPercent(pct, theme),
                            }}
                          />
                        </div>
                      </div>
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 ml-2.5 transition-transform"
                        style={{
                          color: theme.text2,
                          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                        }}
                      />
                    </button>

                    {open ? (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: theme.bg2 }}>
                            {(
                              [
                                "colAssignment",
                                "colType",
                                "colSubmitted",
                                "colScore",
                                "colComment",
                              ] as const
                            ).map((col) => (
                              <th
                                key={col}
                                className="text-left text-[10px] font-semibold uppercase tracking-wide px-3.5 py-2 border-b"
                                style={{
                                  color: theme.text2,
                                  borderColor: theme.border,
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {t(`student.grades.${col}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {courseItems.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="text-center text-sm py-5"
                                style={{ color: theme.text2 }}
                              >
                                {t("student.grades.noAssignmentsInCourse")}
                              </td>
                            </tr>
                          ) : (
                            courseItems.map((item) => {
                              const pts = itemPoints(item);
                              const itemPct =
                                item.percent ?? (pts != null ? gradePercent(pts, item.grade_max) : null);
                              const submittedColor =
                                item.status === "overdue" && !item.submitted_at
                                  ? theme.danger
                                  : item.status === "submitted"
                                    ? theme.accent2
                                    : theme.text2;

                              return (
                                <tr
                                  key={item.assignment_id}
                                  className="group"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = isDarkTheme
                                      ? "rgba(255,255,255,0.02)"
                                      : "rgba(0,0,0,0.02)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  <td
                                    className="text-xs px-3.5 py-2 border-b align-middle"
                                    style={{ borderColor: theme.border, color: theme.text }}
                                  >
                                    <Link
                                      to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                                      className="hover:underline"
                                      style={{ color: theme.text }}
                                    >
                                      {item.title}
                                    </Link>
                                  </td>
                                  <td
                                    className="text-xs px-3.5 py-2 border-b align-middle"
                                    style={{ borderColor: theme.border }}
                                  >
                                    <span
                                      className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        backgroundColor: theme.bg4,
                                        color: theme.text2,
                                        border: `0.5px solid ${theme.border}`,
                                      }}
                                    >
                                      {t(`student.grades.${inferTypeKey(item.title)}`)}
                                    </span>
                                  </td>
                                  <td
                                    className="text-xs px-3.5 py-2 border-b align-middle"
                                    style={{ color: submittedColor, borderColor: theme.border }}
                                  >
                                    {formatSubmittedAt(item, t, language)}
                                  </td>
                                  <td
                                    className="text-xs px-3.5 py-2 border-b align-middle"
                                    style={{ borderColor: theme.border }}
                                  >
                                    {pts != null ? (
                                      <>
                                        <span
                                          className="font-semibold"
                                          style={{ color: gradeColorForPercent(itemPct, theme) }}
                                        >
                                          {Math.round(pts)}
                                        </span>
                                        <span style={{ color: theme.text2 }}> / {item.grade_max}</span>
                                      </>
                                    ) : (
                                      <span style={{ color: theme.text2 }}>— / {item.grade_max}</span>
                                    )}
                                  </td>
                                  <td
                                    className="text-[11px] px-3.5 py-2 border-b align-middle max-w-[280px] truncate"
                                    style={{ color: theme.text2, borderColor: theme.border }}
                                    title={item.comment ?? undefined}
                                  >
                                    {item.comment?.trim() ? item.comment.trim() : t("student.grades.noComment")}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </StudentPageShell>
  );
}

function StatPill({
  value,
  label,
  theme,
  valueColor,
}: {
  value: string;
  label: string;
  theme: ReturnType<typeof getTheme>;
  valueColor?: string;
}) {
  return (
    <div
      className="text-center rounded-lg px-3.5 py-2 min-w-[72px]"
      style={{ backgroundColor: theme.bg2 }}
    >
      <p className="text-base font-semibold leading-tight" style={{ color: valueColor ?? theme.text }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: theme.text2 }}>
        {label}
      </p>
    </div>
  );
}
