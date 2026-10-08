import { useEffect, useMemo, useState } from "react";

import { Link, useSearchParams } from "react-router-dom";

import { ClipboardList, Search } from "lucide-react";

import type { StudentAssignmentListItem, StudentAssignmentStatus } from "../api/studentDashboardApi";
import { getStudentAssignmentsDeduped } from "../api/studentRequestDedup";

import {

  StudentEmptyState,

  StudentErrorBanner,

  StudentLoadingRow,

  StudentPageHeader,

  StudentPageShell,

  StudentStatGrid,

  StudentSurface,

  StudentToolbar,

} from "../components/student/studentPageUi";

import { useUserPreferences } from "../context/UserPreferencesContext";

import { formatDeadlineRemaining } from "../utils/studentDeadlineGroups";

import { formatDeadlineLabel } from "../utils/studentDeadlines";

import { getTheme } from "../theme";



type FilterKey = "all" | StudentAssignmentStatus;



interface StudentAssignmentsPageProps {

  isDarkTheme?: boolean;

}



function statusBadgeStyle(status: StudentAssignmentStatus, theme: ReturnType<typeof getTheme>) {

  switch (status) {

    case "graded":

      return { bg: `${theme.success}18`, color: theme.success };

    case "submitted":

      return { bg: `${theme.accent}18`, color: theme.accent2 };

    case "overdue":

      return { bg: `${theme.danger}18`, color: theme.danger };

    default:

      return { bg: theme.bg4, color: theme.text2 };

  }

}



function urgencyColor(urgency: string, theme: ReturnType<typeof getTheme>) {

  switch (urgency) {

    case "danger":

      return theme.danger;

    case "warning":

      return theme.warning;

    case "info":

      return theme.accent2;

    default:

      return theme.text2;

  }

}



export default function StudentAssignmentsPage({ isDarkTheme = false }: StudentAssignmentsPageProps) {

  const theme = getTheme(isDarkTheme);

  const { t, tp, language } = useUserPreferences();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<StudentAssignmentListItem[]>([]);

  const [filter, setFilter] = useState<FilterKey>("all");

  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  const [courseFilter, setCourseFilter] = useState("all");

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null) setQuery(q);
  }, [searchParams]);

  const statusLabel = (status: StudentAssignmentStatus) => {

    const key = `status.${status}` as const;

    return t(key);

  };



  useEffect(() => {

    let cancelled = false;

    async function load() {

      setLoading(true);

      setError(null);

      try {

        const rows = await getStudentAssignmentsDeduped(200);

        if (!cancelled) setItems(rows);

      } catch (e) {

        if (!cancelled) {

          setError(e instanceof Error ? e.message : t("student.errors.loadAssignments"));

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



  const courses = useMemo(() => {

    const map = new Map<string, string>();

    for (const item of items) map.set(item.course_id, item.course_title);

    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));

  }, [items]);



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase();

    return items.filter((item) => {

      if (courseFilter !== "all" && item.course_id !== courseFilter) return false;

      if (filter !== "all" && item.status !== filter) return false;

      if (!q) return true;

      return `${item.title} ${item.course_title}`.toLowerCase().includes(q);

    });

  }, [items, filter, query, courseFilter]);



  const counts = useMemo(() => {

    const c = { all: items.length, pending: 0, submitted: 0, graded: 0, overdue: 0 };

    for (const item of items) c[item.status] += 1;

    return c;

  }, [items]);



  const filters: { key: FilterKey; label: string }[] = [

    { key: "all", label: tp("student.assignments.filterAll", { n: counts.all }) },

    { key: "pending", label: tp("student.assignments.filterPending", { n: counts.pending }) },

    { key: "submitted", label: tp("student.assignments.filterSubmitted", { n: counts.submitted }) },

    { key: "graded", label: tp("student.assignments.filterGraded", { n: counts.graded }) },

    { key: "overdue", label: tp("student.assignments.filterOverdue", { n: counts.overdue }) },

  ];



  const now = new Date();



  return (

    <StudentPageShell>

      <StudentPageHeader

        theme={theme}

        icon={ClipboardList}

        title={t("student.assignments.title")}

        subtitle={t("student.assignments.subtitle")}

      />



      {!loading && items.length > 0 ? (

        <StudentStatGrid

          theme={theme}

          items={[

            { label: t("student.assignments.statTotal"), value: counts.all },

            { label: t("student.assignments.statPending"), value: counts.pending },

            { label: t("student.assignments.statSubmitted"), value: counts.submitted, color: theme.accent2 },

            { label: t("student.assignments.statGraded"), value: counts.graded, color: theme.success },

          ]}

        />

      ) : null}



      <StudentToolbar theme={theme}>

        <div

          className="flex h-9 flex-1 min-w-[220px] items-center gap-2 rounded-lg border px-2.5"

          style={{ borderColor: theme.border, backgroundColor: theme.bg }}

        >

          <Search className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />

          <input

            type="search"

            value={query}

            onChange={(e) => setQuery(e.target.value)}

            placeholder={t("student.assignments.searchPlaceholder")}

            className="w-full bg-transparent text-sm outline-none"

            style={{ color: theme.text }}

          />

        </div>

        <select

          value={courseFilter}

          onChange={(e) => setCourseFilter(e.target.value)}

          className="h-9 rounded-lg border px-2 text-xs"

          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}

        >

          <option value="all">{t("student.assignments.allCourses")}</option>

          {courses.map((c) => (

            <option key={c.id} value={c.id}>

              {c.title}

            </option>

          ))}

        </select>

        {filters.map((f) => (

          <button

            key={f.key}

            type="button"

            onClick={() => setFilter(f.key)}

            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"

            style={{

              backgroundColor: filter === f.key ? `${theme.accent}20` : theme.bg,

              borderColor: filter === f.key ? `${theme.accent}50` : theme.border,

              color: filter === f.key ? theme.accent2 : theme.text2,

            }}

          >

            {f.label}

          </button>

        ))}

      </StudentToolbar>



      {error ? <StudentErrorBanner message={error} theme={theme} /> : null}



      <StudentSurface theme={theme} padding={false}>

        {loading ? (

          <StudentLoadingRow theme={theme} label={t("student.assignments.loading")} />

        ) : filtered.length === 0 ? (

          <StudentEmptyState

            theme={theme}

            title={items.length === 0 ? t("student.assignments.empty") : t("student.assignments.emptyFilter")}

            hint={

              items.length === 0 ? t("student.assignments.emptyHint") : t("student.assignments.emptyFilterHint")

            }

          />

        ) : (

          filtered.map((item) => {

            const badge = statusBadgeStyle(item.status, theme);

            const deadline = new Date(item.deadline);

            const gradeLabel =

              item.grade !== null

                ? item.final_grade !== null && item.final_grade !== item.grade

                  ? `${item.final_grade.toFixed(1)} / ${item.grade_max}`

                  : `${item.grade} / ${item.grade_max}`

                : null;



            return (

              <Link

                key={item.id}

                to={`/courses/${item.course_id}/assignments/${item.id}`}

                className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:opacity-90"

                style={{ borderColor: theme.border }}

              >

                <div className="flex items-start gap-2.5 min-w-0">

                  <span

                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"

                    style={{ backgroundColor: urgencyColor(item.urgency, theme) }}

                  />

                  <div className="min-w-0">

                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>

                      {item.title}

                    </p>

                    <p className="text-xs truncate mt-0.5" style={{ color: theme.text2 }}>

                      {item.course_title}

                    </p>

                    <span

                      className="inline-flex mt-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium"

                      style={{ backgroundColor: badge.bg, color: badge.color }}

                    >

                      {statusLabel(item.status)}

                      {gradeLabel ? ` · ${gradeLabel}` : ""}

                    </span>

                  </div>

                </div>

                <div className="text-right shrink-0">

                  <p

                    className="text-xs font-medium whitespace-nowrap"

                    style={{ color: urgencyColor(item.urgency, theme) }}

                  >

                    {formatDeadlineLabel(deadline, now, language)}

                  </p>

                  <p className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: theme.text3 }}>

                    {formatDeadlineRemaining(deadline, now, language)}

                  </p>

                </div>

              </Link>

            );

          })

        )}

      </StudentSurface>

    </StudentPageShell>

  );

}

