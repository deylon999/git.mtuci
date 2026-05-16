import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, List } from "lucide-react";
import { getStudentDeadlines } from "../api/studentDashboardApi";
import {
  deadlineDatesSet,
  deadlineWeekdayLabels,
  daysInMonth,
  formatDeadlineRemaining,
  groupDeadlinesByPeriod,
} from "../utils/studentDeadlineGroups";
import { formatDeadlineLabel, type StudentDeadlineItem } from "../utils/studentDeadlines";
import { StudentPageShell } from "../components/student/studentPageUi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

type FilterKey = "all" | "week" | "pending" | "submitted";
type ViewMode = "list" | "calendar";

interface StudentDeadlinesPageProps {
  isDarkTheme?: boolean;
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

export default function StudentDeadlinesPage({ isDarkTheme = false }: StudentDeadlinesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, language } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StudentDeadlineItem[]>([]);
  const [submittedMap, setSubmittedMap] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getStudentDeadlines(100);
        if (cancelled) return;
        const now = new Date();
        const mapped: StudentDeadlineItem[] = rows.map((dl) => ({
          id: dl.id,
          assignmentId: dl.assignment_id,
          courseId: dl.course_id,
          name: dl.name,
          course: dl.course,
          deadline: new Date(dl.deadline),
          timeLabel: formatDeadlineLabel(new Date(dl.deadline), now, language),
          urgency: dl.urgency,
        }));
        const submitted: Record<string, boolean> = {};
        rows.forEach((dl) => {
          submitted[dl.id] = dl.submitted;
        });
        setItems(mapped);
        setSubmittedMap(submitted);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("student.errors.loadDeadlines"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [language, t]);

  const courses = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of items) set.set(item.courseId, item.course);
    return Array.from(set.entries()).map(([id, title]) => ({ id, title }));
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return items.filter((item) => {
      if (courseFilter !== "all" && item.courseId !== courseFilter) return false;
      const submitted = submittedMap[item.id] ?? false;
      if (filter === "submitted") return submitted;
      if (filter === "pending") return !submitted;
      if (filter === "week") return item.deadline <= weekEnd;
      return true;
    });
  }, [items, submittedMap, filter, courseFilter]);

  const groups = useMemo(() => groupDeadlinesByPeriod(filtered, new Date(), language), [filtered, language]);
  const deadlineDays = useMemo(() => deadlineDatesSet(filtered), [filtered]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("student.deadlines.filterAll") },
    { key: "week", label: t("student.deadlines.filterWeek") },
    { key: "pending", label: t("student.deadlines.filterPending") },
    { key: "submitted", label: t("student.deadlines.filterSubmitted") },
  ];

  const monthLabel = new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString(
    language === "en" ? "en-US" : "ru-RU",
    {
    month: "long",
    year: "numeric",
  });
  const firstDow = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const totalDays = daysInMonth(calendarMonth.year, calendarMonth.month);
  const today = new Date();

  return (
    <StudentPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
            {t("student.deadlines.title")}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
            {t("student.deadlines.subtitle")}
          </p>
        </div>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="px-2.5 py-1.5"
            style={{
              backgroundColor: viewMode === "list" ? theme.bg4 : theme.bg3,
              color: viewMode === "list" ? theme.text : theme.text2,
            }}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className="px-2.5 py-1.5 border-l"
            style={{ borderColor: theme.border, backgroundColor: viewMode === "calendar" ? theme.bg4 : theme.bg3 }}
          >
            <Calendar className="h-4 w-4" style={{ color: viewMode === "calendar" ? theme.text : theme.text2 }} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: filter === f.key ? `${theme.accent}20` : theme.bg3,
              borderColor: filter === f.key ? `${theme.accent}50` : theme.border,
              color: filter === f.key ? theme.accent2 : theme.text2,
            }}
          >
            {f.label}
          </button>
        ))}
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-xs ml-auto"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
        >
          <option value="all">{t("student.deadlines.allCourses")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ backgroundColor: `${theme.danger}12`, borderColor: `${theme.danger}40`, color: theme.danger }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: theme.text2 }}>
          {t("common.loading")}
        </p>
      ) : viewMode === "calendar" ? (
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth((m) => {
                  const d = new Date(m.year, m.month - 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              className="text-xs px-2"
              style={{ color: theme.text2 }}
            >
              ←
            </button>
            <span className="text-sm font-medium capitalize" style={{ color: theme.text }}>
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() =>
                setCalendarMonth((m) => {
                  const d = new Date(m.year, m.month + 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              className="text-xs px-2"
              style={{ color: theme.text2 }}
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] mb-1" style={{ color: theme.text3 }}>
            {weekdayLabels.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const d = new Date(calendarMonth.year, calendarMonth.month, day);
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const has = deadlineDays.has(key);
              const isToday =
                d.getDate() === today.getDate() &&
                d.getMonth() === today.getMonth() &&
                d.getFullYear() === today.getFullYear();
              return (
                <div
                  key={day}
                  className="aspect-square flex flex-col items-center justify-center rounded-md text-xs"
                  style={{
                    backgroundColor: has ? `${theme.danger}22` : isToday ? theme.bg4 : "transparent",
                    color: has ? theme.danger : theme.text2,
                    border: isToday ? `1px solid ${theme.accent}` : undefined,
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: theme.text2 }}>
          {t("student.deadlines.emptyFilter")}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: theme.text3 }}>
              {group.title}
            </h2>
            <div
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              {group.items.map((dl) => {
                const submitted = submittedMap[dl.id];
                const remaining = formatDeadlineRemaining(dl.deadline, new Date(), language);
                return (
                  <Link
                    key={dl.id}
                    to={`/courses/${dl.courseId}/assignments/${dl.assignmentId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: theme.border }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: urgencyColor(dl.urgency, theme) }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                          {dl.name}
                        </p>
                        <p className="text-xs truncate" style={{ color: theme.text2 }}>
                          {dl.course}
                          {submitted ? t("student.deadline.submittedSuffix") : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium" style={{ color: urgencyColor(dl.urgency, theme) }}>
                        {dl.timeLabel}
                      </p>
                      <p className="text-[10px]" style={{ color: theme.text3 }}>
                        {remaining}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </StudentPageShell>
  );
}
