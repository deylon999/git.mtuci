import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getStudentDeadlines, type StudentDeadlineDetail } from "../api/studentDashboardApi";
import { formatDeadlineLabel, getDeadlineUrgency, type StudentDeadlineItem } from "../utils/studentDeadlines";
import { getTheme } from "../theme";

type FilterKey = "all" | "week" | "pending" | "submitted";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StudentDeadlineItem[]>([]);
  const [submittedMap, setSubmittedMap] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterKey>("all");

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
          timeLabel: formatDeadlineLabel(new Date(dl.deadline), now),
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
          setError(e instanceof Error ? e.message : "Не удалось загрузить дедлайны");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return items.filter((item) => {
      const submitted = submittedMap[item.id] ?? false;
      if (filter === "submitted") return submitted;
      if (filter === "pending") return !submitted;
      if (filter === "week") return item.deadline <= weekEnd;
      return true;
    });
  }, [items, submittedMap, filter]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "week", label: "На неделе" },
    { key: "pending", label: "Не сдано" },
    { key: "submitted", label: "Сдано" },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
          Дедлайны
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
          Все предстоящие задания по вашим курсам
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: filter === f.key ? `${theme.accent}20` : theme.bg3,
              borderColor: filter === f.key ? `${theme.accent}50` : theme.border,
              color: filter === f.key ? theme.accent2 : theme.text2,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: `${theme.danger}12`,
            borderColor: `${theme.danger}40`,
            color: theme.danger,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        {loading ? (
          <div className="px-4 py-8 text-sm text-center" style={{ color: theme.text2 }}>
            Загрузка…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-center" style={{ color: theme.text2 }}>
            Нет дедлайнов по выбранному фильтру
          </div>
        ) : (
          filtered.map((dl) => {
            const submitted = submittedMap[dl.id];
            return (
              <Link
                key={dl.id}
                to={`/courses/${dl.courseId}/assignments/${dl.assignmentId}`}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:opacity-90"
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
                      {submitted ? " · Сдано" : ""}
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs font-medium whitespace-nowrap shrink-0"
                  style={{ color: urgencyColor(dl.urgency, theme) }}
                >
                  {dl.timeLabel}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
