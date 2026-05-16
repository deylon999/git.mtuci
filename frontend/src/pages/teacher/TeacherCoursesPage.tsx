import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Loader2, Plus, Search } from "lucide-react";
import { getTeacherCoursesList, type TeacherCourseListItem } from "../../api/teacherDashboardApi";
import {
  TeacherPageHeader,
  TeacherPageShell,
  TeacherStatGrid,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { useUserPreferences } from "../../context/UserPreferencesContext";

const BANNER_GRADIENTS = [
  "linear-gradient(135deg,#1a237e,#283593)",
  "linear-gradient(135deg,#4a148c,#6a1b9a)",
  "linear-gradient(135deg,#1b5e20,#2e7d32)",
  "linear-gradient(135deg,#0d47a1,#1565c0)",
];

interface Props {
  isDarkTheme?: boolean;
}

export default function TeacherCoursesPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherCourseListItem[]>([]);
  const [query, setQuery] = useState("");

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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.title.toLowerCase().includes(q));
  }, [items, query]);

  const stats = useMemo(() => {
    const pending = items.reduce((s, c) => s + c.pending_count, 0);
    const students = items.reduce((s, c) => s + c.students_count, 0);
    return {
      total: items.length,
      active: items.length,
      students,
      pending,
    };
  }, [items]);

  return (
    <TeacherPageShell>
      <TeacherPageHeader
        theme={theme}
        icon={BookOpen}
        title={t("teacher.courses.title")}
        subtitle={t("teacher.courses.subtitle")}
        actions={
          <Link
            to="/courses?create=1"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: theme.success }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("teacher.courses.createCourse")}
          </Link>
        }
      />

      {!loading && items.length > 0 ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.courses.statTotal"), value: stats.total },
            { label: t("teacher.courses.statActive"), value: stats.active },
            { label: t("teacher.courses.statStudents"), value: stats.students },
            {
              label: t("teacher.courses.statPending"),
              value: stats.pending,
              color: stats.pending > 0 ? theme.danger : theme.text,
            },
          ]}
        />
      ) : null}

      <div
        className="flex h-9 items-center gap-2 rounded-xl border px-3"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        <Search className="h-4 w-4" style={{ color: theme.text3 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("teacher.courses.searchPlaceholder")}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: theme.text }}
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c, idx) => (
            <article
              key={c.course_id}
              className="rounded-xl border overflow-hidden flex flex-col"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <div
                className="px-4 py-5 text-white"
                style={{ background: BANNER_GRADIENTS[idx % BANNER_GRADIENTS.length] }}
              >
                <p className="text-lg font-semibold leading-snug">{c.title}</p>
                {c.target_groups.length > 0 ? (
                  <p className="text-xs mt-1 opacity-90">{c.target_groups.join(", ")}</p>
                ) : null}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: theme.text2 }}>
                  <span>{tp("teacher.courses.studentsCount", { count: c.students_count })}</span>
                  <span>{tp("teacher.courses.assignmentsCount", { count: c.assignments_count })}</span>
                </div>
                {c.nearest_deadline ? (
                  <p className="text-xs" style={{ color: theme.text3 }}>
                    {tp("teacher.courses.deadlineLine", {
                      title: c.nearest_deadline_title ?? "",
                      date: new Date(c.nearest_deadline).toLocaleDateString("ru-RU"),
                    })}
                  </p>
                ) : null}
                {c.pending_count > 0 ? (
                  <span
                    className="self-start rounded-md px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: `${theme.danger}22`, color: theme.danger }}
                  >
                    {tp("teacher.courses.pendingBadge", { count: c.pending_count })}
                  </span>
                ) : null}
                <div className="mt-auto flex gap-2 pt-1">
                  <Link
                    to={`/courses/${c.course_id}`}
                    className="flex-1 text-center rounded-lg py-1.5 text-xs font-medium"
                    style={{ backgroundColor: theme.accent, color: "#fff" }}
                  >
                    {t("common.open")}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </TeacherPageShell>
  );
}
