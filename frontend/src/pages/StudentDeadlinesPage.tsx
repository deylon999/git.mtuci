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
import type { DeadlineGroupKey } from "../utils/studentDeadlineGroups";
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

function groupTitleColor(key: DeadlineGroupKey, theme: ReturnType<typeof getTheme>) {
  switch (key) {
    case "today":
      return theme.danger;
    case "tomorrow":
      return theme.warning;
    case "week":
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

  const deadlineStats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(todayStart);
    monthEnd.setDate(monthEnd.getDate() + 31);

    let today = 0;
    let week = 0;
    let month = 0;
    let overdue = 0;
    for (const item of items) {
      const submitted = submittedMap[item.id] ?? false;
      const d = item.deadline;
      if (!submitted && d < now) {
        overdue += 1;
        continue;
      }
      if (d >= todayStart && d < tomorrowStart) today += 1;
      if (d >= todayStart && d <= weekEnd) week += 1;
      if (d >= todayStart && d <= monthEnd) month += 1;
    }
    return { today, week, month, overdue };
  }, [items, submittedMap]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("student.deadlines.filterAll") },
    { key: "week", label: t("student.deadlines.filterWeek") },
    { key: "pending", label: t("student.deadlines.filterPending") },
    { key: "submitted", label: t("student.deadlines.filterSubmitted") },
  ];

  const weekdayLabels = useMemo(() => deadlineWeekdayLabels(language), [language]);

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

      {!loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { label: t("student.deadlines.statToday"), value: deadlineStats.today, color: theme.danger },
            { label: t("student.deadlines.statWeek"), value: deadlineStats.week, color: theme.warning },
            { label: t("student.deadlines.statMonth"), value: deadlineStats.month, color: theme.text },
            { label: t("student.deadlines.statOverdue"), value: deadlineStats.overdue, color: theme.text2 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border px-4 py-3"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <p className="text-xs" style={{ color: theme.text2 }}>
                {stat.label}
              </p>
              <p className="text-2xl font-semibold mt-0.5" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

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
        <div className="flex flex-col gap-3">
        <div
          className="rounded-xl border p-2.5 max-w-[280px]"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setCalendarMonth((m) => {
                  const d = new Date(m.year, m.month - 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })
              }
              className="text-[11px] px-1.5 py-0.5 rounded hover:opacity-80"
              style={{ color: theme.text2 }}
            >
              ←
            </button>
            <span className="text-xs font-medium capitalize truncate" style={{ color: theme.text }}>
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
              className="text-[11px] px-1.5 py-0.5 rounded hover:opacity-80"
              style={{ color: theme.text2 }}
            >
              →
            </button>
          </div>
          <div
            className="grid grid-cols-7 gap-0.5 text-center text-[9px] mb-1 font-medium"
            style={{ color: theme.text3 }}
          >
            {weekdayLabels.map((d) => (
              <span key={d} className="leading-none">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`e-${i}`} className="h-7" />
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
                  className="h-7 w-full flex items-center justify-center rounded text-[11px] leading-none"
                  style={{
                    backgroundColor: has ? `${theme.danger}22` : isToday ? theme.bg4 : "transparent",
                    color: has ? theme.danger : theme.text2,
                    border: isToday ? `1px solid ${theme.accent}` : undefined,
                  }}
                  title={has ? t("student.deadlines.statToday") : undefined}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: theme.text2 }}>
            {t("student.deadlines.emptyAll")}
          </p>
        ) : null}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: theme.text2 }}>
          {t("student.deadlines.emptyAll")}
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: theme.text2 }}>
          {t("student.deadlines.emptyFilter")}
        </p>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          {groups.map((group) => (
            <div key={group.key}>
              <h2
                className="px-4 py-2 text-xs font-semibold border-b"
                style={{
                  color: groupTitleColor(group.key, theme),
                  borderColor: theme.border,
                  backgroundColor: theme.bg2,
                }}
              >
                {group.title}
              </h2>
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
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-medium" style={{ color: urgencyColor(dl.urgency, theme) }}>
                          {dl.timeLabel}
                        </p>
                        <p className="text-[10px]" style={{ color: theme.text3 }}>
                          {remaining}
                        </p>
                      </div>
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: submitted ? `${theme.success}20` : `${theme.warning}20`,
                          color: submitted ? theme.success : theme.warning,
                        }}
                      >
                        {submitted ? t("student.deadlines.filterSubmitted") : t("student.deadlines.filterPending")}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </StudentPageShell>
  );
}
