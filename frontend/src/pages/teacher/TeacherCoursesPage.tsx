import { useEffect, useMemo, useState } from "react";
import { deleteCourse } from "../../api/coursesApi";
import { getTeacherCoursesList, type TeacherCourseListItem } from "../../api/teacherDashboardApi";
import {
  TeacherCourseCard,
  TeacherEmptyState,
  TeacherLinkBtn,
  TeacherLoadingBlock,
  TeacherPageShell,
  TeacherPageTitle,
  TeacherStatGrid,
  TeacherSurface,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { useUserPreferences } from "../../context/UserPreferencesContext";

interface Props {
  isDarkTheme?: boolean;
}

export default function TeacherCoursesPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherCourseListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTeacherCoursesList()
      .then((rows) => {
        if (!cancelled) setItems(rows);
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
  }, [t]);

  const stats = useMemo(() => {
    const pending = items.reduce((s, c) => s + c.pending_count, 0);
    const students = items.reduce((s, c) => s + c.students_count, 0);
    const assignments = items.reduce((s, c) => s + c.assignments_count, 0);
    return { total: items.length, students, pending, assignments };
  }, [items]);

  const subtitle =
    items.length > 0
      ? tp("teacher.courses.subtitleStats", {
          courses: stats.total,
          students: stats.students,
        })
      : t("teacher.courses.subtitle");

  async function onDeleteCourse(courseId: string) {
    if (!window.confirm(t("admin.courses.deleteConfirm"))) return;
    setDeletingId(courseId);
    setError(null);
    try {
      await deleteCourse(courseId);
      setItems((prev) => prev.filter((c) => c.course_id !== courseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("teacher.errors.loadFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <TeacherPageShell className="gap-[14px] min-w-0">
      <TeacherPageTitle
        theme={theme}
        title={t("teacher.courses.title")}
        subtitle={subtitle}
        actions={
          <TeacherLinkBtn to="/courses?create=1" theme={theme} variant="purple">
            + {t("teacher.courses.createCourse")}
          </TeacherLinkBtn>
        }
      />

      {!loading && items.length > 0 ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.courses.statActive"), value: stats.total },
            { label: t("teacher.courses.statStudents"), value: stats.students },
            { label: t("teacher.courses.statAssignments"), value: stats.assignments },
            {
              label: t("teacher.courses.statPending"),
              value: stats.pending,
              color: stats.pending > 0 ? theme.danger : theme.text,
            },
          ]}
        />
      ) : null}

      {error ? (
        <p className="text-xs" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <TeacherLoadingBlock theme={theme} />
      ) : items.length === 0 ? (
        <TeacherSurface theme={theme}>
          <TeacherEmptyState theme={theme}>{t("teacher.dashboard.noCourses")}</TeacherEmptyState>
        </TeacherSurface>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4">
          {items.map((c) => {
            const groupsLabel = tp("teacher.courses.cardMeta", {
              students: c.students_count,
              groups:
                c.target_groups.length > 0
                  ? c.target_groups.join(", ")
                  : t("teacher.courses.allGroups"),
            });
            let footerHint: string | undefined;
            let footerHintColor: string | undefined;
            if (c.nearest_deadline) {
              footerHint = tp("teacher.courses.deadlineLine", {
                title: c.nearest_deadline_title ?? "",
                date: new Date(c.nearest_deadline).toLocaleDateString(
                  language === "en" ? "en-US" : "ru-RU",
                  { day: "numeric", month: "short" },
                ),
              });
              const urgent = new Date(c.nearest_deadline).getTime() - Date.now() < 86400000;
              footerHintColor = urgent ? theme.danger : theme.text3;
            }
            return (
              <div key={c.course_id} className="min-w-0">
                <TeacherCourseCard
                  theme={theme}
                  courseId={c.course_id}
                  title={c.title}
                  studentsCount={c.students_count}
                  assignmentsCount={c.assignments_count}
                  pendingCount={c.pending_count}
                  submittedPercent={c.submitted_percent}
                  groupsLabel={groupsLabel}
                  footerHint={footerHint}
                  footerHintColor={footerHintColor}
                  to={`/courses/${c.course_id}`}
                  onDelete={
                    deletingId === c.course_id
                      ? undefined
                      : () => void onDeleteCourse(c.course_id)
                  }
                  t={t}
                  tp={tp}
                />
              </div>
            );
          })}
        </div>
      )}
    </TeacherPageShell>
  );
}
