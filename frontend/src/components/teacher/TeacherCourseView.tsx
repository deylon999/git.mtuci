import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { buildDefaultPenaltyPeriods, type PenaltyPeriod } from "../../utils/penaltyDefaults";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  createAssignment,
  deleteAssignment,
  exportCourseGradesCsv,
  getAssignmentStats,
  getAssignments,
  type AssignmentStats,
} from "../../api/coursesApi";
import {
  getTeacherCourseDetail,
  getTeacherGradingQueue,
  type TeacherCourseDetail,
  type TeacherGradingQueueItem,
} from "../../api/teacherDashboardApi";
import CourseRosterPanel from "../CourseRosterPanel";
import GradeSubmissionModal, { type GradeSubmissionTarget } from "./GradeSubmissionModal";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import {
  TeacherBtn,
  TeacherEmptyState,
  TeacherLoadingBlock,
  TeacherPageShell,
  TeacherPendingRow,
  TeacherStatGrid,
  TeacherSurface,
  TeacherTabs,
  useTeacherTheme,
} from "./teacherPageUi";
import { waitingBadgeTone } from "./teacherUiConstants";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import type { Assignment } from "../../api/types";

type TabKey = "overview" | "assignments" | "students" | "review";

interface Props {
  courseId: string;
  isDarkTheme?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#4caf50",
  idle: "#f59e0b",
  inactive: "#6b7280",
};

function localDatetimeMin(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function TeacherCourseView({ courseId, isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [tab, setTab] = useState<TabKey>("overview");
  const [detail, setDetail] = useState<TeacherCourseDetail | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<Record<string, AssignmentStats>>({});
  const [reviewItems, setReviewItems] = useState<TeacherGradingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradeTarget, setGradeTarget] = useState<GradeSubmissionTarget | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [penaltyPeriods, setPenaltyPeriods] = useState<PenaltyPeriod[]>(() =>
    buildDefaultPenaltyPeriods(10),
  );
  const [createDateError, setCreateDateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const dateMin = useMemo(() => localDatetimeMin(), [showCreateForm]);
  const gradeCap = detail?.grade_max ?? 10;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, asn, queue] = await Promise.all([
        getTeacherCourseDetail(courseId),
        getAssignments(courseId),
        getTeacherGradingQueue(200, courseId),
      ]);
      setDetail(d);
      setAssignments(asn);
      setReviewItems(queue);
      const statsEntries = await Promise.allSettled(
        asn.map(async (a) => [a.id, await getAssignmentStats(courseId, a.id)] as const),
      );
      const map: Record<string, AssignmentStats> = {};
      for (const e of statsEntries) {
        if (e.status === "fulfilled") map[e.value[0]] = e.value[1];
      }
      setAssignmentStats(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("teacher.errors.courseLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxWeekCommits = Math.max(1, ...(detail?.activity_by_week.map((w) => w.commits) ?? [1]));

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: t("teacher.courseView.tabOverview") },
    { key: "assignments", label: t("teacher.courseView.tabAssignments"), badge: assignments.length },
    { key: "students", label: t("teacher.courseView.tabStudents"), badge: detail?.students_count },
    { key: "review", label: t("teacher.courseView.tabReview"), badge: reviewItems.length },
  ];

  function validateAssignmentDates(): boolean {
    const today = startOfLocalDay(new Date());
    const start = new Date(createStartDate);
    const end = new Date(createDeadline);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setCreateDateError(t("teacher.errors.createFailed"));
      return false;
    }
    if (startOfLocalDay(start) < today || startOfLocalDay(end) < today) {
      setCreateDateError(t("teacher.courseView.dateMinHint"));
      return false;
    }
    if (start > end) {
      setCreateDateError(t("teacher.courseView.dateOrderError"));
      return false;
    }
    setCreateDateError(null);
    return true;
  }

  async function onCreateAssignment(e: FormEvent) {
    e.preventDefault();
    if (!validateAssignmentDates()) return;
    const periods = penaltyPeriods
      .filter((p) => p.weeks > 0)
      .sort((a, b) => a.weeks - b.weeks)
      .map((p) => ({
        weeks: p.weeks,
        max_grade: Math.min(gradeCap, Math.max(0, p.max_grade)),
      }));
    if (periods.length === 0) {
      periods.push({ weeks: 1, max_grade: Math.min(4, gradeCap) });
    }

    setCreateLoading(true);
    try {
      const created = await createAssignment(courseId, {
        title: createTitle.trim(),
        description: createDescription.trim(),
        start_date: new Date(createStartDate).toISOString(),
        deadline: new Date(createDeadline).toISOString(),
        late_penalty_periods: periods,
      });
      setAssignments((prev) => [...prev, created].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setShowCreateForm(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateStartDate("");
      setCreateDeadline("");
      setPenaltyPeriods(buildDefaultPenaltyPeriods(gradeCap));
      setCreateDateError(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("teacher.errors.createFailed"));
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeleteAssignment(assignmentId: string) {
    if (!confirm(t("teacher.courseView.confirmDeleteAssignment"))) return;
    await deleteAssignment(courseId, assignmentId);
    await load();
  }

  function openGradeModal(item: TeacherGradingQueueItem) {
    setGradeTarget({
      courseId,
      assignmentId: item.assignment_id,
      studentId: item.student_id,
      studentName: item.student_name,
      assignmentTitle: item.assignment_title,
      courseTitle: item.course_title,
      gradeMax: gradeCap,
    });
  }

  if (loading && !detail) {
    return <TeacherLoadingBlock theme={theme} label={t("teacher.courseView.loading")} />;
  }

  return (
    <TeacherPageShell>
      <div className="mb-1 text-sm" style={{ color: theme.text2 }}>
        <Link to="/teacher/courses" className="hover:underline" style={{ color: theme.accent }}>
          {t("teacher.coursePage.breadcrumbCourses")}
        </Link>
        <span className="mx-2 opacity-50">&gt;</span>
        <span style={{ color: theme.text }}>{detail?.title ?? t("teacher.coursePage.courseFallback")}</span>
      </div>
      <h1 className="text-2xl font-semibold mb-4" style={{ color: theme.text }}>
        {detail?.title ?? t("teacher.coursePage.courseFallback")}
      </h1>
      <TeacherTabs
        theme={theme}
        tabs={tabs.map((tabItem) => ({
          key: tabItem.key,
          label: tabItem.label,
          badge: tabItem.badge,
        }))}
        active={tab}
        onChange={setTab}
      />

      {error ? (
        <p className="text-sm rounded-xl border px-4 py-3" style={{ color: theme.danger, borderColor: theme.border }}>
          {error}
        </p>
      ) : null}

      {tab === "overview" && detail ? (
        <>
          <TeacherStatGrid
            theme={theme}
            items={[
              { label: t("teacher.courseView.statStudents"), value: detail.students_count },
              { label: t("teacher.courseView.statAssignments"), value: detail.assignments_count },
              { label: t("teacher.courseView.statAverageGrade"), value: detail.average_grade ?? "—" },
              {
                label: t("teacher.courseView.statCompletion"),
                value: detail.completion_percent != null ? `${detail.completion_percent}%` : "—",
              },
            ]}
          />
          {detail.description ? (
            <TeacherSurface theme={theme} title={t("teacher.courseView.descriptionTitle")}>
              <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: theme.text2 }}>
                {detail.description}
              </p>
            </TeacherSurface>
          ) : null}
          {detail.target_groups.length > 0 ? (
            <TeacherSurface theme={theme} title={t("teacher.courseView.groupsTitle")}>
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {detail.target_groups.map((g) => (
                  <span
                    key={g}
                    className="rounded-md px-2 py-0.5 text-xs"
                    style={{ backgroundColor: theme.bg4, color: theme.text2 }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            </TeacherSurface>
          ) : null}
          <TeacherSurface theme={theme} title={t("teacher.courseView.weeklyActivityTitle")}>
            <div className="px-4 py-4 flex items-end gap-2 h-28">
              {detail.activity_by_week.map((w) => (
                <div key={w.week_label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md min-h-[6px]"
                    style={{
                      height: `${Math.max(10, (w.commits / maxWeekCommits) * 100)}%`,
                      backgroundColor: theme.accent,
                    }}
                  />
                  <span className="text-[9px]" style={{ color: theme.text3 }}>
                    {w.week_label}
                  </span>
                </div>
              ))}
            </div>
          </TeacherSurface>
        </>
      ) : null}

      {tab === "assignments" ? (
        <>
          <div className="flex justify-end">
            <TeacherBtn
              type="button"
              theme={theme}
              variant="success"
              onClick={() => {
                setPenaltyPeriods(buildDefaultPenaltyPeriods(gradeCap));
                setShowCreateForm((v) => !v);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("teacher.courseView.addAssignment")}
            </TeacherBtn>
          </div>
          {showCreateForm ? (
            <form
              onSubmit={onCreateAssignment}
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <div
                className="border-b px-5 py-3.5"
                style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
              >
                <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
                  {t("teacher.courseView.newAssignmentTitle")}
                </h3>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <input
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder={t("teacher.courseView.titlePlaceholder")}
                  className="rounded-xl border px-3.5 py-2.5 text-sm"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder={t("teacher.courseView.descriptionPlaceholder")}
                  className="min-h-[88px] rounded-xl border px-3.5 py-2.5 text-sm resize-y"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium" style={{ color: theme.text2 }}>
                      {t("teacher.courseView.fieldStartDate")}
                    </label>
                    <input
                      type="datetime-local"
                      required
                      min={dateMin}
                      value={createStartDate}
                      onChange={(e) => {
                        setCreateStartDate(e.target.value);
                        setCreateDateError(null);
                      }}
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm"
                      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium" style={{ color: theme.text2 }}>
                      {t("teacher.courseView.fieldDeadline")}
                    </label>
                    <input
                      type="datetime-local"
                      required
                      min={createStartDate || dateMin}
                      value={createDeadline}
                      onChange={(e) => {
                        setCreateDeadline(e.target.value);
                        setCreateDateError(null);
                      }}
                      className="w-full rounded-xl border px-3.5 py-2.5 text-sm"
                      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                    />
                  </div>
                </div>
                <p className="text-[11px] -mt-2" style={{ color: theme.text3 }}>
                  {t("teacher.courseView.dateMinHint")}
                </p>

                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                >
                  <p className="text-sm font-semibold" style={{ color: theme.text }}>
                    {t("teacher.courseView.penaltyTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: theme.text3 }}>
                    {t("teacher.courseView.penaltyHint")}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {penaltyPeriods.map((p, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs w-28 shrink-0" style={{ color: theme.text2 }}>
                          {t("teacher.courseView.penaltyWeeks")}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={p.weeks}
                          onChange={(e) => {
                            const weeks = Number(e.target.value);
                            setPenaltyPeriods((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, weeks } : row)),
                            );
                          }}
                          className="w-20 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
                          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
                        />
                        <span className="text-xs shrink-0" style={{ color: theme.text2 }}>
                          {t("teacher.courseView.penaltyMaxGrade")}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={gradeCap}
                          value={p.max_grade}
                          onChange={(e) => {
                            const max_grade = Number(e.target.value);
                            setPenaltyPeriods((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, max_grade } : row)),
                            );
                          }}
                          className="w-20 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
                          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
                        />
                        <span className="text-[10px] flex-1 min-w-[120px]" style={{ color: theme.text3 }}>
                          {tp("teacher.courseView.penaltyPreview", { weeks: p.weeks, grade: p.max_grade })}
                        </span>
                        {penaltyPeriods.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setPenaltyPeriods((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded-lg p-1.5"
                            style={{ color: theme.danger }}
                            title={t("teacher.courseView.penaltyRemovePeriod")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPenaltyPeriods((prev) => [
                        ...prev,
                        { weeks: (prev[prev.length - 1]?.weeks ?? 0) + 1, max_grade: 0 },
                      ])
                    }
                    className="mt-3 text-xs font-medium"
                    style={{ color: theme.accent2 }}
                  >
                    + {t("teacher.courseView.penaltyAddPeriod")}
                  </button>
                </div>

                {createDateError ? (
                  <div
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: `${theme.danger}50`, color: theme.danger }}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {createDateError}
                  </div>
                ) : null}
              </div>
              <div
                className="flex justify-end gap-2 border-t px-5 py-3"
                style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateDateError(null);
                  }}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.accent }}
                >
                  {createLoading ? t("teacher.courseView.creating") : t("common.create")}
                </button>
              </div>
            </form>
          ) : null}
          <div className="flex flex-col gap-3">
            {assignments.map((a) => {
              const st = assignmentStats[a.id];
              const total = st?.students_total ?? detail?.students_count ?? 1;
              const submitted = st?.submitted_count ?? 0;
              const pending = st?.pending_grade_count ?? 0;
              const notStarted = Math.max(0, total - submitted);
              const overdue = st?.overdue_count ?? 0;
              const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
              return (
                <article
                  key={a.id}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/courses/${courseId}/assignments/${a.id}`}
                        className="text-sm font-semibold hover:underline"
                        style={{ color: theme.text }}
                      >
                        {a.title}
                      </Link>
                      <p className="text-xs mt-0.5" style={{ color: theme.text3 }}>
                        {tp("teacher.courseView.deadlineLine", {
                          date: new Date(a.deadline).toLocaleString("ru-RU"),
                        })}
                      </p>
                      {a.late_penalty_periods.length > 0 ? (
                        <p className="text-[10px] mt-1" style={{ color: theme.text3 }}>
                          {t("teacher.courseView.penaltyTitle")}:{" "}
                          {[...a.late_penalty_periods]
                            .sort((x, y) => x.weeks - y.weeks)
                            .map((p) =>
                              tp("teacher.courseView.penaltyPreview", {
                                weeks: p.weeks,
                                grade: p.max_grade,
                              }),
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/courses/${courseId}/assignments/${a.id}`}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: theme.border, color: theme.accent2 }}
                      >
                        {t("common.open")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void onDeleteAssignment(a.id)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: theme.border, color: theme.danger }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                  {st ? (
                    <div className="mt-3 space-y-1">
                      <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
                        <div style={{ width: pct(submitted - pending), backgroundColor: theme.success }} />
                        <div style={{ width: pct(pending), backgroundColor: theme.warning }} />
                        <div style={{ width: pct(overdue), backgroundColor: theme.danger }} />
                        <div style={{ width: pct(notStarted), backgroundColor: theme.bg4 }} />
                      </div>
                      <p className="text-[10px] flex flex-wrap gap-2" style={{ color: theme.text3 }}>
                        <span>{tp("teacher.courseView.submitted", { submitted, total })}</span>
                        <span>{tp("teacher.courseView.onReview", { count: pending })}</span>
                        <span>{tp("teacher.courseView.overdue", { count: overdue })}</span>
                        <span>
                          {tp("teacher.courseView.averageShort", {
                            grade: st.average_final_grade ?? st.average_grade ?? "—",
                          })}
                        </span>
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {tab === "students" && detail ? (
        <>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => void exportCourseGradesCsv(courseId)}
              className="rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: theme.border, color: theme.text2 }}
            >
              {t("teacher.courseView.exportGradesCsv")}
            </button>
          </div>
          <CourseRosterPanel courseId={courseId} isDarkTheme={isDarkTheme} />
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-xs" style={{ borderColor: theme.border, color: theme.text2 }}>
                  <th className="px-4 py-2">{t("teacher.students.colStudent")}</th>
                  <th className="px-4 py-2">{t("teacher.courseView.colProgress")}</th>
                  <th className="px-4 py-2">{t("teacher.students.colGrade")}</th>
                  <th className="px-4 py-2">{t("teacher.students.colActivity")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.students.map((s) => (
                  <tr key={s.student_id} className="border-b" style={{ borderColor: theme.border }}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLOR[s.activity_status] ?? STATUS_COLOR.inactive }}
                        />
                        <span style={{ color: theme.text }}>{s.full_name}</span>
                      </div>
                      <p className="text-xs" style={{ color: theme.text3 }}>
                        {s.group_name ?? s.email}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-xs" style={{ color: theme.text2 }}>
                      {tp("teacher.courseView.assignmentsProgress", {
                        completed: s.completed_assignments,
                        total: s.total_assignments,
                      })}
                    </td>
                    <td className="px-4 py-2 font-medium" style={{ color: theme.text }}>
                      {s.average_grade ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs" style={{ color: theme.text3 }}>
                      {s.last_activity_at ? formatRelativeTime(new Date(s.last_activity_at)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "review" ? (
        <TeacherSurface theme={theme} title={t("teacher.courseView.tabReview")} noPadding>
          {reviewItems.length === 0 ? (
            <TeacherEmptyState theme={theme} compact>
              {t("teacher.courseView.noReviewForCourse")}
            </TeacherEmptyState>
          ) : (
            reviewItems.map((item) => (
              <TeacherPendingRow
                key={item.submission_id}
                theme={theme}
                studentName={item.student_name}
                titleLine={`${item.student_name} · ${item.assignment_title}`}
                subLine={formatRelativeTime(new Date(item.submitted_at))}
                waitingLabel={
                  item.is_stale
                    ? tp("teacher.courseView.waitingHours", { hours: Math.round(item.waiting_hours) })
                    : undefined
                }
                badgeTone={waitingBadgeTone(item.waiting_hours, item.is_stale)}
                urgent={item.is_stale}
                onGrade={() => openGradeModal(item)}
                gradeLabel={t("teacher.codeReview.grade")}
              />
            ))
          )}
        </TeacherSurface>
      ) : null}

      <GradeSubmissionModal
        open={gradeTarget != null}
        target={gradeTarget}
        isDarkTheme={isDarkTheme}
        onClose={() => setGradeTarget(null)}
        onGraded={() => void load()}
      />
    </TeacherPageShell>
  );
}
