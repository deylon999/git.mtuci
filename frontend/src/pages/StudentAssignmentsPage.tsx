import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Loader2, Search } from "lucide-react";
import { getStudentAssignments, type StudentAssignmentListItem, type StudentAssignmentStatus } from "../api/studentDashboardApi";
import { formatDeadlineLabel } from "../utils/studentDeadlines";
import { getTheme } from "../theme";

type FilterKey = "all" | StudentAssignmentStatus;

interface StudentAssignmentsPageProps {
  isDarkTheme?: boolean;
}

const STATUS_LABEL: Record<StudentAssignmentStatus, string> = {
  pending: "Не сдано",
  submitted: "На проверке",
  graded: "Оценено",
  overdue: "Просрочено",
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StudentAssignmentListItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getStudentAssignments(200);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить задания");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!q) return true;
      return `${item.title} ${item.course_title}`.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const counts = useMemo(() => {
    const c = { all: items.length, pending: 0, submitted: 0, graded: 0, overdue: 0 };
    for (const item of items) c[item.status] += 1;
    return c;
  }, [items]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: `Все (${counts.all})` },
    { key: "pending", label: `Не сдано (${counts.pending})` },
    { key: "submitted", label: `На проверке (${counts.submitted})` },
    { key: "graded", label: `Оценено (${counts.graded})` },
    { key: "overdue", label: `Просрочено (${counts.overdue})` },
  ];

  const now = new Date();

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${theme.accent}20`, color: theme.accent2 }}
        >
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: theme.text }}>
            Задания
          </h1>
          <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
            Все лабораторные и домашние работы по вашим курсам
          </p>
        </div>
      </header>

      <div
        className="flex h-9 items-center gap-2 rounded-lg border px-2.5"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: theme.text3 }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию или курсу…"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: theme.text }}
        />
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
          <div className="flex justify-center gap-2 px-4 py-10 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Загрузка заданий…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-sm text-center" style={{ color: theme.text2 }}>
            {items.length === 0
              ? "Заданий пока нет. Они появятся после зачисления на курс."
              : "Нет заданий по выбранному фильтру"}
          </div>
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
                      {STATUS_LABEL[item.status]}
                      {gradeLabel ? ` · ${gradeLabel}` : ""}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className="text-xs font-medium whitespace-nowrap"
                    style={{ color: urgencyColor(item.urgency, theme) }}
                  >
                    {formatDeadlineLabel(deadline, now)}
                  </p>
                  <p className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: theme.text3 }}>
                    до {deadline.toLocaleDateString("ru-RU")}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
