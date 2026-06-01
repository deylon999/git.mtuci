import { useEffect, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import {
  exportTeacherStudentsCsv,
  getTeacherStudents,
  type TeacherStudentListItem,
} from "../../api/teacherDashboardApi";
import {
  TeacherAvatar,
  TeacherBadge,
  TeacherBtn,
  TeacherDataTable,
  TeacherEmptyState,
  TeacherIconBtn,
  TeacherLoadingBlock,
  TeacherPageShell,
  TeacherPageTitle,
  TeacherSelect,
  TeacherStatGrid,
  TeacherTableBody,
  TeacherTableHead,
  TeacherTd,
  TeacherTh,
  TeacherToolbar,
  TeacherToolbarDivider,
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

const COURSE_BADGE_TONES = ["blue", "purple", "success", "warning"] as const;

function abbreviateCourse(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  }
  return title.slice(0, 2).toUpperCase();
}

function activityTextColor(
  status: TeacherStudentListItem["activity_status"],
  theme: ReturnType<typeof useTeacherTheme>,
): string {
  if (status === "inactive") return theme.danger;
  if (status === "idle") return theme.warning;
  return theme.text2;
}

export default function TeacherStudentsPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getTeacherStudents>> | null>(null);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
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
  }, [t]);

  const courses = useMemo(() => {
    const set = new Set<string>();
    for (const s of summary?.items ?? []) {
      for (const c of s.courses) set.add(c);
    }
    return Array.from(set).sort();
  }, [summary]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const s of summary?.items ?? []) {
      if (s.group_name) set.add(s.group_name);
    }
    return Array.from(set).sort();
  }, [summary]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (summary?.items ?? []).filter((s) => {
      if (courseFilter !== "all" && !s.courses.includes(courseFilter)) return false;
      if (groupFilter !== "all" && s.group_name !== groupFilter) return false;
      if (activityFilter === "active" && s.activity_status !== "active") return false;
      if (activityFilter === "inactive" && s.activity_status === "active") return false;
      if (!q) return true;
      return `${s.full_name} ${s.email} ${s.group_name ?? ""}`.toLowerCase().includes(q);
    });
  }, [summary, query, courseFilter, groupFilter, activityFilter]);

  const averageGradeStat =
    summary?.average_grade != null ? `${Math.round(summary.average_grade)}%` : "—";

  return (
    <TeacherPageShell className="gap-[14px] min-w-0">
      <TeacherPageTitle
        theme={theme}
        title={t("teacher.students.title")}
        subtitle={
          summary
            ? tp("teacher.students.subtitleCount", { n: summary.students_total })
            : t("teacher.students.subtitle")
        }
        actions={
          <TeacherBtn
            theme={theme}
            variant="success"
            onClick={() =>
              void exportTeacherStudentsCsv().catch((e) =>
                alert(e instanceof Error ? e.message : t("teacher.errors.exportFailed")),
              )
            }
          >
            {t("teacher.students.exportCsv")}
          </TeacherBtn>
        }
      />

      {summary && !loading ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.students.statTotal"), value: summary.students_total },
            {
              label: t("teacher.students.statActiveWeek"),
              value: summary.active_this_week,
              color: theme.success,
            },
            {
              label: t("teacher.students.statAverageGrade"),
              value: averageGradeStat,
              color: theme.warning,
            },
            {
              label: t("teacher.students.statPending"),
              value: summary.pending_grading,
              color: summary.pending_grading > 0 ? theme.danger : theme.text,
            },
          ]}
        />
      ) : null}

      <TeacherToolbar theme={theme}>
        <div
          className="flex min-w-[200px] flex-1 items-center gap-1.5 rounded-[7px] border px-2.5 py-[5px]"
          style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: theme.text3 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("teacher.students.searchPlaceholder")}
            className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-[#444]"
            style={{ color: theme.text }}
          />
        </div>
        <TeacherToolbarDivider theme={theme} />
        <TeacherSelect value={courseFilter} onChange={setCourseFilter} theme={theme}>
          <option value="all">{t("teacher.students.filterAllCourses")}</option>
          {courses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </TeacherSelect>
        <TeacherSelect value={groupFilter} onChange={setGroupFilter} theme={theme}>
          <option value="all">{t("teacher.students.filterAllGroups")}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </TeacherSelect>
        <TeacherSelect value={activityFilter} onChange={setActivityFilter} theme={theme}>
          <option value="all">{t("teacher.students.filterAllActivity")}</option>
          <option value="active">{t("teacher.students.filterActive")}</option>
          <option value="inactive">{t("teacher.students.filterInactive")}</option>
        </TeacherSelect>
      </TeacherToolbar>

      {loading ? (
        <TeacherLoadingBlock theme={theme} />
      ) : error ? (
        <p className="text-xs" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : (
        <TeacherDataTable theme={theme} minWidth={920}>
          <TeacherTableHead theme={theme}>
            <TeacherTh>{t("teacher.students.colStudent")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colGroup")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colCourses")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colRepos")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colCommits")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colActivity")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colGrade")}</TeacherTh>
            <TeacherTh>{t("teacher.students.colStatus")}</TeacherTh>
            <TeacherTh className="w-10" />
          </TeacherTableHead>
          <TeacherTableBody theme={theme}>
            {filtered.map((s) => (
              <StudentRow key={s.student_id} student={s} theme={theme} />
            ))}
            {filtered.length === 0 ? (
              <tr className="group">
                <TeacherTd theme={theme} colSpan={9} className="!whitespace-normal !border-b-0">
                  <TeacherEmptyState theme={theme}>{t("teacher.students.notFound")}</TeacherEmptyState>
                </TeacherTd>
              </tr>
            ) : null}
          </TeacherTableBody>
        </TeacherDataTable>
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
  const gradeLabel =
    student.average_grade != null ? `${Math.round(student.average_grade)}%` : "—";
  const gradeColor =
    student.average_grade != null && student.average_grade >= 80
      ? theme.success
      : student.average_grade != null && student.average_grade < 60
        ? theme.danger
        : student.average_grade != null
          ? theme.warning
          : theme.text2;

  const activityColor = activityTextColor(student.activity_status, theme);
  const activityLabel = student.last_activity_at
    ? formatRelativeTime(new Date(student.last_activity_at))
    : "—";

  function onOpenProfile() {
    // UI parity with teacher-app.html mock (profile modal not wired yet)
  }

  return (
    <tr className="group cursor-pointer" onClick={onOpenProfile}>
      <TeacherTd theme={theme}>
        <div className="flex items-center gap-[7px]">
          <TeacherAvatar name={student.full_name} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-medium leading-snug" style={{ color: theme.text }}>
              {student.full_name}
            </p>
            <p className="text-[10px] leading-snug" style={{ color: theme.text2 }}>
              {student.email}
            </p>
          </div>
        </div>
      </TeacherTd>
      <TeacherTd theme={theme} style={{ color: theme.text2 }}>
        {student.group_name ?? "—"}
      </TeacherTd>
      <TeacherTd theme={theme}>
        <div className="flex max-w-[180px] flex-wrap gap-1">
          {student.courses.map((c, i) => (
            <TeacherBadge key={c} tone={COURSE_BADGE_TONES[i % COURSE_BADGE_TONES.length]} size="xs">
              {abbreviateCourse(c)}
            </TeacherBadge>
          ))}
        </div>
      </TeacherTd>
      <TeacherTd theme={theme}>{student.repositories_count}</TeacherTd>
      <TeacherTd theme={theme}>{student.commits_total}</TeacherTd>
      <TeacherTd theme={theme} style={{ color: activityColor }}>
        {activityLabel}
      </TeacherTd>
      <TeacherTd theme={theme} style={{ color: gradeColor, fontWeight: 600 }}>
        {gradeLabel}
      </TeacherTd>
      <TeacherTd theme={theme}>
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: STATUS_DOT[student.activity_status] ?? STATUS_DOT.inactive }}
          title={student.activity_status}
        />
      </TeacherTd>
      <TeacherTd theme={theme}>
        <TeacherIconBtn
          theme={theme}
          aria-label={student.full_name}
          onClick={(e) => {
            e.stopPropagation();
            onOpenProfile();
          }}
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={1.2} />
        </TeacherIconBtn>
      </TeacherTd>
    </tr>
  );
}
