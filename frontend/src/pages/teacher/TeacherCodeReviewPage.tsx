import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import {
  getTeacherCoursesList,
  getTeacherGradingQueue,
  type TeacherGradingQueueItem,
} from "../../api/teacherDashboardApi";
import GradeSubmissionModal, {
  type GradeSubmissionTarget,
} from "../../components/teacher/GradeSubmissionModal";
import {
  TeacherPageHeader,
  TeacherPageShell,
  TeacherStatGrid,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface Props {
  isDarkTheme?: boolean;
}

export default function TeacherCodeReviewPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherGradingQueueItem[]>([]);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [gradeTarget, setGradeTarget] = useState<GradeSubmissionTarget | null>(null);
  const [gradeMaxByCourse, setGradeMaxByCourse] = useState<Record<string, number>>({});

  const load = () => {
    void getTeacherGradingQueue(200)
      .then((rows) => setItems(rows))
      .catch((e) => setError(e instanceof Error ? e.message : t("teacher.errors.loadFailed")));
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getTeacherGradingQueue(200), getTeacherCoursesList()])
      .then(([rows, courses]) => {
        if (cancelled) return;
        setItems(rows);
        const map: Record<string, number> = {};
        for (const c of courses) map[c.course_id] = c.grade_max;
        setGradeMaxByCourse(map);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("teacher.errors.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) m.set(i.course_id, i.course_title);
    return Array.from(m.entries()).map(([id, title]) => ({ id, title }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (courseFilter !== "all" && item.course_id !== courseFilter) return false;
      if (showStaleOnly && !item.is_stale) return false;
      if (!q) return true;
      return (
        item.student_name.toLowerCase().includes(q) ||
        item.assignment_title.toLowerCase().includes(q) ||
        item.course_title.toLowerCase().includes(q)
      );
    });
  }, [items, query, courseFilter, showStaleOnly]);

  const staleCount = items.filter((i) => i.is_stale).length;

  return (
    <TeacherPageShell>
      <TeacherPageHeader
        theme={theme}
        icon={ClipboardCheck}
        title={t("teacher.codeReview.title")}
        subtitle={t("teacher.codeReview.subtitle")}
      />

      {!loading ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.codeReview.statWaiting"), value: items.length, color: theme.warning },
            {
              label: t("teacher.codeReview.statStale"),
              value: staleCount,
              color: staleCount ? theme.danger : theme.text,
            },
            { label: t("teacher.codeReview.statCourses"), value: courses.length },
            { label: t("teacher.codeReview.statShown"), value: filtered.length },
          ]}
        />
      ) : null}

      <div
        className="flex flex-wrap gap-2 rounded-xl border px-3 py-2.5"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        <Search className="h-4 w-4 shrink-0 mt-2" style={{ color: theme.text3 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("teacher.codeReview.searchPlaceholder")}
          className="flex-1 min-w-[140px] bg-transparent text-sm outline-none h-9"
          style={{ color: theme.text }}
        />
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-9 rounded-lg border px-2 text-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
        >
          <option value="all">{t("teacher.codeReview.filterAllCourses")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs h-9 px-2" style={{ color: theme.text2 }}>
          <input
            type="checkbox"
            checked={showStaleOnly}
            onChange={(e) => setShowStaleOnly(e.target.checked)}
          />
          {t("teacher.codeReview.staleOnly")}
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm py-12 text-center rounded-xl border" style={{ color: theme.text2, borderColor: theme.border }}>
          {t("teacher.codeReview.noMatches")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <article
              key={item.submission_id}
              className="rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              style={{
                backgroundColor: theme.bg3,
                borderColor: item.is_stale ? `${theme.danger}60` : theme.border,
                boxShadow: item.is_stale ? `inset 0 0 0 1px ${theme.danger}30` : undefined,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {item.student_name}
                  <span className="font-normal" style={{ color: theme.text2 }}>
                    {" "}
                    · {item.course_title}
                  </span>
                </p>
                <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>
                  {item.assignment_title}
                  {item.repo_name ? ` · ${item.repo_name}` : ""}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{ color: item.is_stale ? theme.danger : theme.text3 }}
                >
                  {tp("teacher.codeReview.submitted", {
                    time: formatRelativeTime(new Date(item.submitted_at)),
                  })}
                  {item.is_stale
                    ? tp("teacher.codeReview.waitingHours", { hours: Math.round(item.waiting_hours) })
                    : ""}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: theme.border, color: theme.accent2 }}
                >
                  {t("teacher.codeReview.openInGitea")}
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setGradeTarget({
                      courseId: item.course_id,
                      assignmentId: item.assignment_id,
                      studentId: item.student_id,
                      studentName: item.student_name,
                      assignmentTitle: item.assignment_title,
                      courseTitle: item.course_title,
                      gradeMax: gradeMaxByCourse[item.course_id] ?? 100,
                    })
                  }
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: theme.accent, color: "#fff" }}
                >
                  {t("teacher.codeReview.grade")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <GradeSubmissionModal
        open={gradeTarget != null}
        target={gradeTarget}
        isDarkTheme={isDarkTheme}
        onClose={() => setGradeTarget(null)}
        onGraded={load}
      />
    </TeacherPageShell>
  );
}
