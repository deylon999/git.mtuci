import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import { getTeacherGradingQueue, type TeacherGradingQueueItem } from "../api/teacherDashboardApi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface TeacherGradingQueuePageProps {
  isDarkTheme?: boolean;
}

export default function TeacherGradingQueuePage({ isDarkTheme = false }: TeacherGradingQueuePageProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherGradingQueueItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getTeacherGradingQueue(100);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("teacher.errors.queueLoadFailed"));
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
    if (!q) return items;
    return items.filter(
      (item) =>
        item.student_name.toLowerCase().includes(q) ||
        item.assignment_title.toLowerCase().includes(q) ||
        item.course_title.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.warning}22`, color: theme.warning }}
          >
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{t("teacher.gradingQueue.title")}</h1>
            <p className="text-sm" style={{ color: theme.text2 }}>
              {t("teacher.gradingQueue.subtitle")}
            </p>
          </div>
        </div>

        <div
          className="mb-4 rounded-xl border px-4 py-3"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <p className="text-sm">
            {t("teacher.gradingQueue.inQueue")} <span className="font-semibold">{items.length}</span>
          </p>
        </div>

        <div
          className="mb-4 flex h-9 items-center gap-2 rounded-lg border px-3"
          style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
        >
          <Search className="h-4 w-4" style={{ color: theme.text2 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("teacher.gradingQueue.searchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: theme.text }}
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("teacher.gradingQueue.loading")}
          </div>
        ) : error ? (
          <p className="text-sm" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: theme.text2 }}>
            {t("teacher.gradingQueue.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <Link
                key={item.submission_id}
                to={`/courses/${item.course_id}/assignments/${item.assignment_id}`}
                className="block rounded-xl border px-4 py-3 transition-colors hover:opacity-90"
                style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.assignment_title}</p>
                    <p className="text-sm" style={{ color: theme.text2 }}>
                      {item.course_title} · {item.student_name}
                    </p>
                    {item.repo_name ? (
                      <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
                        {tp("teacher.gradingQueue.repository", { name: item.repo_name })}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs" style={{ color: theme.text2 }}>
                    {new Date(item.submitted_at).toLocaleString("ru-RU")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
