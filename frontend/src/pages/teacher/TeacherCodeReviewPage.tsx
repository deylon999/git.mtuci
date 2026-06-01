import { useCallback, useEffect, useState } from "react";
import {
  getTeacherCoursesList,
  getTeacherGradingQueue,
  getTeacherGradingQueueStats,
  type TeacherGradingQueueItem,
  type TeacherGradingQueueStats,
} from "../../api/teacherDashboardApi";
import GradeSubmissionModal, {
  type GradeSubmissionTarget,
} from "../../components/teacher/GradeSubmissionModal";
import {
  TeacherEmptyState,
  TeacherLoadingBlock,
  TeacherPageShell,
  TeacherPageTitle,
  TeacherPendingRow,
  TeacherStatGrid,
  TeacherSurface,
  TeacherTabs,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { waitingBadgeTone } from "../../components/teacher/teacherUiConstants";
import { useUserPreferences } from "../../context/UserPreferencesContext";

interface Props {
  isDarkTheme?: boolean;
}

type ReviewTab = "waiting" | "reviewing" | "done";

export default function TeacherCodeReviewPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherGradingQueueItem[]>([]);
  const [stats, setStats] = useState<TeacherGradingQueueStats | null>(null);
  const [tab, setTab] = useState<ReviewTab>("waiting");
  const [gradeTarget, setGradeTarget] = useState<GradeSubmissionTarget | null>(null);
  const [gradeMaxByCourse, setGradeMaxByCourse] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    return Promise.all([
      getTeacherGradingQueue(200),
      getTeacherGradingQueueStats(),
      getTeacherCoursesList(),
    ])
      .then(([rows, queueStats, courses]) => {
        setItems(rows);
        setStats(queueStats);
        const map: Record<string, number> = {};
        for (const c of courses) map[c.course_id] = c.grade_max;
        setGradeMaxByCourse(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("teacher.errors.loadFailed")));
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const avgWaitLabel =
    stats?.avg_waiting_hours != null
      ? tp("teacher.codeReview.statAvgWaitShort", { hours: Math.round(stats.avg_waiting_hours) })
      : "—";

  const tabs = [
    {
      key: "waiting" as const,
      label: tp("teacher.codeReview.tabWaiting", { count: stats?.pending ?? items.length }),
    },
    { key: "reviewing" as const, label: t("teacher.codeReview.tabReviewing") },
    { key: "done" as const, label: t("teacher.codeReview.tabDone") },
  ];

  function openGrade(item: TeacherGradingQueueItem) {
    setGradeTarget({
      courseId: item.course_id,
      assignmentId: item.assignment_id,
      studentId: item.student_id,
      studentName: item.student_name,
      assignmentTitle: item.assignment_title,
      courseTitle: item.course_title,
      gradeMax: gradeMaxByCourse[item.course_id] ?? 10,
    });
  }

  return (
    <TeacherPageShell className="gap-[14px] min-w-0">
      <TeacherPageTitle
        theme={theme}
        title={t("teacher.codeReview.title")}
        subtitle={t("teacher.codeReview.subtitle")}
      />

      {!loading && stats ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            {
              label: t("teacher.codeReview.statWaiting"),
              value: stats.pending,
              color: theme.danger,
            },
            {
              label: t("teacher.codeReview.statGradedToday"),
              value: stats.graded_today,
              color: theme.success,
            },
            {
              label: t("teacher.codeReview.statOverdue"),
              value: stats.stale,
              color: theme.danger,
            },
            { label: t("teacher.codeReview.statAvgWait"), value: avgWaitLabel },
          ]}
        />
      ) : null}

      {!loading ? (
        <TeacherTabs theme={theme} tabs={tabs} active={tab} onChange={setTab} />
      ) : null}

      {loading ? (
        <TeacherLoadingBlock theme={theme} />
      ) : error ? (
        <p className="text-xs" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : tab !== "waiting" ? (
        <TeacherSurface theme={theme} title={t("teacher.codeReview.queueCardTitle")} noPadding>
          <TeacherEmptyState theme={theme} compact>
            {t("teacher.codeReview.tabEmpty")}
          </TeacherEmptyState>
        </TeacherSurface>
      ) : items.length === 0 ? (
        <TeacherSurface theme={theme} title={t("teacher.codeReview.queueCardTitle")} noPadding>
          <TeacherEmptyState theme={theme} compact>
            {t("teacher.codeReview.noMatches")}
          </TeacherEmptyState>
        </TeacherSurface>
      ) : (
        <TeacherSurface theme={theme} title={t("teacher.codeReview.queueCardTitle")} noPadding>
          {items.map((item) => {
            const hours = Math.round(item.waiting_hours);
            return (
              <TeacherPendingRow
                key={item.submission_id}
                theme={theme}
                studentName={item.student_name}
                titleLine={`${item.student_name} — ${item.assignment_title} — ${item.course_title}`}
                subLine={item.repo_name ?? undefined}
                waitingLabel={tp("teacher.codeReview.waitingHours", { hours })}
                badgeTone={waitingBadgeTone(item.waiting_hours, item.is_stale)}
                urgent={item.is_stale}
                onGrade={() => openGrade(item)}
                gradeLabel={t("teacher.dashboard.review")}
              />
            );
          })}
        </TeacherSurface>
      )}

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
