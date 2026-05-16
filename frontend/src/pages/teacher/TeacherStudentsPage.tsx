import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import {
  exportTeacherStudentsCsv,
  getTeacherStudents,
  type TeacherStudentListItem,
} from "../../api/teacherDashboardApi";
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

const STATUS_DOT: Record<string, string> = {
  active: "#4caf50",
  idle: "#f59e0b",
  inactive: "#6b7280",
};

export default function TeacherStudentsPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getTeacherStudents>> | null>(null);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void getTeacherStudents()
      .then((data) => {
        if (!cancelled) setSummary(data);
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
    const set = new Set<string>();
    for (const s of summary?.items ?? []) {
      for (const c of s.courses) set.add(c);
    }
    return Array.from(set).sort();
  }, [summary]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (summary?.items ?? []).filter((s) => {
      if (courseFilter !== "all" && !s.courses.includes(courseFilter)) return false;
      if (activityFilter !== "all" && s.activity_status !== activityFilter) return false;
      if (!q) return true;
      return `${s.full_name} ${s.email} ${s.group_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [summary, query, courseFilter, activityFilter]);

  return (
    <TeacherPageShell>
      <TeacherPageHeader
        theme={theme}
        icon={Users}
        title={t("teacher.students.title")}
        subtitle={t("teacher.students.subtitle")}
        actions={
          <button
            type="button"
            onClick={() =>
              void exportTeacherStudentsCsv().catch((e) =>
                alert(e instanceof Error ? e.message : t("teacher.errors.exportFailed")),
              )
            }
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
          >
            {t("teacher.students.exportCsv")}
          </button>
        }
      />

      {summary && !loading ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.students.statTotal"), value: summary.students_total },
            { label: t("teacher.students.statActiveWeek"), value: summary.active_this_week, color: theme.success },
            {
              label: t("teacher.students.statAverageGrade"),
              value: summary.average_grade ?? "—",
            },
            {
              label: t("teacher.students.statPending"),
              value: summary.pending_grading,
              color: summary.pending_grading > 0 ? theme.danger : theme.text,
            },
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
          placeholder={t("teacher.students.searchPlaceholder")}
          className="flex-1 min-w-[160px] bg-transparent text-sm outline-none h-9"
          style={{ color: theme.text }}
        />
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-9 rounded-lg border px-2 text-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
        >
          <option value="all">{t("teacher.students.filterAllCourses")}</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
          className="h-9 rounded-lg border px-2 text-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
        >
          <option value="all">{t("teacher.students.filterAnyActivity")}</option>
          <option value="active">{t("teacher.students.filterActive")}</option>
          <option value="idle">{t("teacher.students.filterIdle")}</option>
          <option value="inactive">{t("teacher.students.filterInactive")}</option>
        </select>
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
      ) : (
        <div
          className="rounded-xl border overflow-x-auto"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b text-left text-xs" style={{ borderColor: theme.border, color: theme.text2 }}>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colStudent")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colGroup")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colCourses")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colRepos")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colCommits")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colActivity")}</th>
                <th className="px-4 py-3 font-medium">{t("teacher.students.colGrade")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <StudentRow key={s.student_id} student={s} theme={theme} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm" style={{ color: theme.text2 }}>
              {t("teacher.students.notFound")}
            </p>
          ) : null}
        </div>
      )}
    </TeacherPageShell>
  );
}

function StudentRow({
  student,
  theme,
}: {
  student: TeacherStudentListItem;
  theme: ReturnType<typeof useTeacherTheme>;
}) {
  return (
    <tr className="border-b last:border-b-0" style={{ borderColor: theme.border }}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: STATUS_DOT[student.activity_status] ?? STATUS_DOT.inactive }}
          />
          <div>
            <p className="font-medium" style={{ color: theme.text }}>
              {student.full_name}
            </p>
            <p className="text-xs" style={{ color: theme.text3 }}>
              {student.email}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: theme.text2 }}>
        {student.group_name ?? "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {student.courses.slice(0, 2).map((c) => (
            <span
              key={c}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ backgroundColor: theme.bg4, color: theme.text2 }}
            >
              {c.length > 18 ? `${c.slice(0, 16)}…` : c}
            </span>
          ))}
          {student.courses.length > 2 ? (
            <span className="text-[10px]" style={{ color: theme.text3 }}>
              +{student.courses.length - 2}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums" style={{ color: theme.text2 }}>
        {student.repositories_count}
      </td>
      <td className="px-4 py-3 tabular-nums" style={{ color: theme.text2 }}>
        {student.commits_total}
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: theme.text3 }}>
        {student.last_activity_at
          ? formatRelativeTime(new Date(student.last_activity_at))
          : "—"}
      </td>
      <td className="px-4 py-3 tabular-nums font-medium" style={{ color: theme.text }}>
        {student.average_grade ?? "—"}
      </td>
    </tr>
  );
}
