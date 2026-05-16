import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, TrendingUp } from "lucide-react";
import {
  getStudentGrades,
  type StudentGradeItem,
  type StudentGradesSummary,
} from "../api/studentDashboardApi";
import { getTheme } from "../theme";

interface StudentGradesPageProps {
  isDarkTheme?: boolean;
}

const STATUS_LABEL: Record<StudentGradeItem["status"], string> = {
  pending: "Не сдано",
  submitted: "На проверке",
  graded: "Оценено",
  overdue: "Просрочено",
};

function displayScore(item: StudentGradeItem): string {
  if (item.final_grade != null) return String(Math.round(item.final_grade));
  if (item.grade != null) return String(item.grade);
  return "—";
}

export default function StudentGradesPage({ isDarkTheme = false }: StudentGradesPageProps) {
  const theme = getTheme(isDarkTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StudentGradesSummary | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const summary = await getStudentGrades(200);
        if (!cancelled) setData(summary);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить оценки");
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
    if (!data) return [];
    if (!q) return data.items;
    return data.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.course_title.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.accent}22`, color: theme.accent2 }}
          >
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Оценки</h1>
            <p className="text-sm" style={{ color: theme.text2 }}>
              Сводка по курсам и заданиям
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка...
          </div>
        ) : error ? (
          <p className="text-sm" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : data ? (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Средний балл", data.overall_average != null ? data.overall_average : "—"],
                ["Оценено работ", String(data.graded_count)],
                ["На проверке", String(data.pending_review)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                >
                  <p className="text-xs" style={{ color: theme.text2 }}>
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            {data.courses.length > 0 ? (
              <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.courses.map((course) => (
                  <div
                    key={course.course_id}
                    className="rounded-xl border p-4"
                    style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  >
                    <p className="font-medium">{course.title}</p>
                    <p className="text-xs" style={{ color: theme.text2 }}>
                      {course.teacher_name}
                    </p>
                    <p className="mt-2 text-sm">
                      Средний:{" "}
                      <span className="font-semibold">
                        {course.average_score != null ? course.average_score : "—"}
                      </span>
                      <span style={{ color: theme.text2 }}> / {course.grade_max}</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
                      Оценено {course.assignments_graded} из {course.assignments_total} · сдано{" "}
                      {course.assignments_submitted}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div
              className="mb-3 flex h-9 items-center gap-2 rounded-lg border px-3"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
            >
              <Search className="h-4 w-4" style={{ color: theme.text2 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по курсу или заданию..."
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: theme.text }}
              />
            </div>

            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm" style={{ color: theme.text2 }}>
                  Нет заданий для отображения
                </p>
              ) : (
                filtered.map((item) => (
                  <Link
                    key={item.assignment_id}
                    to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                    className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:opacity-90"
                    style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {item.course_title}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        {displayScore(item)}
                        <span className="text-xs font-normal" style={{ color: theme.text2 }}>
                          {" "}
                          / {item.grade_max}
                        </span>
                      </p>
                      <p className="text-xs" style={{ color: theme.text2 }}>
                        {STATUS_LABEL[item.status]}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
