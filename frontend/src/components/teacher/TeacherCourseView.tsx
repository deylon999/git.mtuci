import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
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
import { TeacherPageShell, TeacherStatGrid, TeacherSurface, useTeacherTheme } from "./teacherPageUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import type { Assignment, Course } from "../../api/types";

type TabKey = "overview" | "assignments" | "students" | "review";

interface Props {
  courseId: string;
  course: Course | null;
  isDarkTheme?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  active: "#4caf50",
  idle: "#f59e0b",
  inactive: "#6b7280",
};

export default function TeacherCourseView({ courseId, course, isDarkTheme = false }: Props) {
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
  const [createLoading, setCreateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, asn, queue] = await Promise.all([
        getTeacherCourseDetail(courseId),
        getAssignments(courseId),
        getTeacherGradingQueue(200),
      ]);
      setDetail(d);
      setAssignments(asn);
      setReviewItems(queue.filter((q) => q.course_id === courseId));
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

  async function onCreateAssignment(e: FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const created = await createAssignment(courseId, {
        title: createTitle.trim(),
        description: createDescription.trim(),
        start_date: new Date(createStartDate).toISOString(),
        deadline: new Date(createDeadline).toISOString(),
        late_penalty_periods: [{ weeks: 1, max_grade: 4 }],
      });
      setAssignments((prev) => [...prev, created].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setShowCreateForm(false);
      setCreateTitle("");
      setCreateDescription("");
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
      gradeMax: detail?.grade_max ?? course?.grade_max ?? 100,
    });
  }

  if (loading && !detail) {
    return (
      <div className="flex justify-center py-16 gap-2 text-sm" style={{ color: theme.text2 }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("teacher.courseView.loading")}
      </div>
    );
  }

  return (
    <TeacherPageShell>
      <div className="flex flex-wrap gap-2 border-b pb-1" style={{ borderColor: theme.border }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="rounded-t-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === t.key ? theme.accent2 : theme.text2,
              borderBottom: tab === t.key ? `2px solid ${theme.accent}` : "2px solid transparent",
            }}
          >
            {t.label}
            {t.badge != null && t.badge > 0 ? (
              <span className="ml-1.5 text-[10px] opacity-80">({t.badge})</span>
            ) : null}
          </button>
        ))}
      </div>

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
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: theme.success }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("teacher.courseView.addAssignment")}
            </button>
          </div>
          {showCreateForm ? (
            <form
              onSubmit={onCreateAssignment}
              className="rounded-xl border p-4 flex flex-col gap-3"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <input
                required
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={t("teacher.courseView.titlePlaceholder")}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t("teacher.courseView.descriptionPlaceholder")}
                className="rounded-lg border px-3 py-2 text-sm min-h-20"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="datetime-local"
                  required
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <input
                  type="datetime-local"
                  required
                  value={createDeadline}
                  onChange={(e) => setCreateDeadline(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
              </div>
              <button
                type="submit"
                disabled={createLoading}
                className="self-end rounded-lg px-4 py-1.5 text-xs text-white disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {createLoading ? t("teacher.courseView.creating") : t("common.create")}
              </button>
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
        reviewItems.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: theme.text2 }}>
            {t("teacher.courseView.noReviewForCourse")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {reviewItems.map((item) => (
              <article
                key={item.submission_id}
                className="rounded-xl border px-4 py-3 flex flex-wrap justify-between gap-3"
                style={{
                  backgroundColor: theme.bg3,
                  borderColor: item.is_stale ? `${theme.danger}60` : theme.border,
                }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {item.student_name} · {item.assignment_title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: item.is_stale ? theme.danger : theme.text3 }}>
                    {formatRelativeTime(new Date(item.submitted_at))}
                    {item.is_stale
                      ? tp("teacher.courseView.waitingHours", { hours: Math.round(item.waiting_hours) })
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/courses/${courseId}/assignments/${item.assignment_id}`}
                    className="text-xs px-2.5 py-1 rounded-lg border"
                    style={{ borderColor: theme.border, color: theme.accent2 }}
                  >
                    {t("teacher.codeReview.openInGitea")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => openGradeModal(item)}
                    className="text-xs px-2.5 py-1 rounded-lg text-white"
                    style={{ backgroundColor: theme.accent }}
                  >
                    {t("teacher.codeReview.grade")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
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
