import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Calendar, CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { Assignment, Course } from "../api/types";
import type { StudentAssignmentListItem } from "../api/studentDashboardApi";
import { getStudentAssignmentsDeduped } from "../api/studentRequestDedup";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { formatDeadlineRemaining } from "../utils/studentDeadlineGroups";
import { formatDeadlineLabel } from "../utils/studentDeadlines";
import { getTheme } from "../theme";

interface StudentCourseViewProps {
  courseId: string;
  course: Course | null;
  assignments: Assignment[];
  loading: boolean;
  isDarkTheme?: boolean;
}

export default function StudentCourseView({
  courseId,
  course,
  assignments,
  loading,
  isDarkTheme = false,
}: StudentCourseViewProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const [studentItems, setStudentItems] = useState<StudentAssignmentListItem[]>([]);
  const [courseGrade, setCourseGrade] = useState<{
    average: number | null;
    gradeMax: number;
  } | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);
  const [extraError, setExtraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setExtraLoading(true);
      setExtraError(null);
      try {
        const asn = await getStudentAssignmentsDeduped(200);
        if (cancelled) return;
        const courseItems = asn.filter((a) => a.course_id === courseId);
        setStudentItems(courseItems);
        let earned = 0;
        let max = 0;
        for (const a of courseItems) {
          if (a.status !== "graded") continue;
          const pts = a.final_grade ?? a.grade;
          if (pts == null) continue;
          earned += Number(pts);
          max += a.grade_max;
        }
        const average = max > 0 ? Math.round((earned / max) * (course?.grade_max ?? 100)) : null;
        setCourseGrade({
          average,
          gradeMax: course?.grade_max ?? 100,
        });
      } catch (e) {
        if (!cancelled) {
          setStudentItems([]);
          setCourseGrade(null);
          setExtraError(e instanceof Error ? e.message : t("student.errors.loadAssignments"));
        }
      } finally {
        if (!cancelled) setExtraLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [courseId, course?.grade_max, t]);

  const stats = useMemo(() => {
    const total = studentItems.length || assignments.length;
    const submitted = studentItems.filter((a) => a.submitted).length;
    const graded = studentItems.filter((a) => a.status === "graded").length;
    const overdue = studentItems.filter((a) => a.status === "overdue").length;
    return { total, submitted, graded, overdue };
  }, [studentItems, assignments.length]);

  const mergedAssignments = useMemo(() => {
    const statusById = new Map(studentItems.map((s) => [s.id, s]));
    return [...assignments].sort((a, b) => a.deadline.localeCompare(b.deadline)).map((a) => ({
      assignment: a,
      student: statusById.get(a.id),
    }));
  }, [assignments, studentItems]);

  const now = new Date();
  const busy = loading || extraLoading;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-5">
      <aside className="flex flex-col gap-4">
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
        >
          <div
            className="h-24 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#1a237e,#283593)" }}
          >
            <BookOpen className="h-10 w-10 text-white/90" />
          </div>
          <div className="p-4">
            <h1 className="text-lg font-bold" style={{ color: theme.text }}>
              {course?.title ?? t("student.courses.defaultTitle")}
            </h1>
            {course?.description ? (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: theme.text2 }}>
                {course.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs" style={{ color: theme.text3 }}>
              {tp("student.courses.maxScore", { max: course?.grade_max ?? 100 })}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: theme.text3 }}>
            {t("student.courses.progress")}
          </h2>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.text2 }} />
          ) : (
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                { label: t("student.courses.assignments"), value: stats.total },
                { label: t("student.courses.submitted"), value: stats.submitted },
                { label: t("status.graded"), value: stats.graded },
                { label: t("student.courses.overdue"), value: stats.overdue },
              ].map((s) => (
                <div key={s.label} className="rounded-lg py-2" style={{ backgroundColor: theme.bg4 }}>
                  <div className="text-lg font-semibold" style={{ color: theme.text }}>
                    {s.value}
                  </div>
                  <div className="text-[10px]" style={{ color: theme.text2 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
          {courseGrade?.average != null ? (
            <p className="mt-3 text-sm text-center" style={{ color: theme.text2 }}>
              {t("student.courses.averageScore")}{" "}
              <span className="font-semibold" style={{ color: theme.success }}>
                {courseGrade.average}
              </span>
              <span> / {courseGrade.gradeMax}</span>
            </p>
          ) : null}
        </div>

        <Link
          to="/courses"
          className="text-xs text-center rounded-lg border py-2"
          style={{ borderColor: theme.border, color: theme.accent2 }}
        >
          {t("student.courses.allCourses")}
        </Link>
      </aside>

      <section
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: theme.border }}
        >
          <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
            {t("student.courses.courseAssignments")}
          </h2>
          <span className="text-xs" style={{ color: theme.text2 }}>
            {tp("student.courses.countShort", { n: assignments.length })}
          </span>
        </div>

        {extraError ? (
          <p className="px-4 py-6 text-sm text-center" style={{ color: theme.danger }}>
            {extraError}
          </p>
        ) : null}
        {busy ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : mergedAssignments.length === 0 ? (
          <p className="px-4 py-10 text-sm text-center" style={{ color: theme.text2 }}>
            {t("student.courses.noAssignments")}
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: theme.border }}>
            {mergedAssignments.map(({ assignment: a, student: st }) => {
              const deadline = new Date(a.deadline);
              const status = st?.status ?? "pending";
              return (
                <Link
                  key={a.id}
                  to={`/courses/${courseId}/assignments/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:opacity-90 transition-opacity"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                      {a.title}
                    </p>
                    {a.description ? (
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.text2 }}>
                        {a.description}
                      </p>
                    ) : null}
                    <span
                      className="inline-flex mt-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor:
                          status === "graded"
                            ? `${theme.success}18`
                            : status === "overdue"
                              ? `${theme.danger}18`
                              : theme.bg4,
                        color:
                          status === "graded"
                            ? theme.success
                            : status === "overdue"
                              ? theme.danger
                              : theme.text2,
                      }}
                    >
                      {t(`status.${status}`)}
                      {st?.grade != null ? ` · ${st.grade}/${st.grade_max}` : ""}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="text-xs font-medium flex items-center justify-end gap-1"
                      style={{ color: theme.text2 }}
                    >
                      <Calendar className="h-3 w-3" />
                      {formatDeadlineLabel(deadline, now, language)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: theme.text3 }}>
                      {formatDeadlineRemaining(deadline, now, language)}
                    </p>
                    {st?.submitted ? (
                      <p
                        className="text-[10px] mt-0.5 flex items-center justify-end gap-0.5"
                        style={{ color: theme.success }}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {t("student.courses.submittedBadge")}
                      </p>
                    ) : status === "overdue" ? (
                      <p
                        className="text-[10px] mt-0.5 flex items-center justify-end gap-0.5"
                        style={{ color: theme.danger }}
                      >
                        <Clock className="h-3 w-3" />
                        {t("student.courses.overdueBadge")}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
