import { useEffect, useMemo, useState } from "react";
import { GitFork, Loader2, Search } from "lucide-react";
import { getStudentForks, type StudentForkItem } from "../api/studentDashboardApi";
import { getTheme } from "../theme";

interface StudentForksPageProps {
  isDarkTheme?: boolean;
}

const EVENT_LABEL: Record<StudentForkItem["event_type"], string> = {
  fork: "Форк",
  repo_created: "Создание репо",
};

export default function StudentForksPage({ isDarkTheme = false }: StudentForksPageProps) {
  const theme = getTheme(isDarkTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StudentForkItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getStudentForks(100);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить форки");
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
        item.source_repo.toLowerCase().includes(q) ||
        (item.target_repo ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.accent}22`, color: theme.accent2 }}
          >
            <GitFork className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Форки</h1>
            <p className="text-sm" style={{ color: theme.text2 }}>
              История форков и создания репозиториев
            </p>
          </div>
        </div>

        <div
          className="mb-4 flex h-9 items-center gap-2 rounded-lg border px-3"
          style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}
        >
          <Search className="h-4 w-4" style={{ color: theme.text2 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени репозитория..."
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: theme.text }}
          />
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
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: theme.text2 }}>
            Пока нет событий форков или создания репозиториев
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border px-4 py-3"
                style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {item.event_type === "fork" ? (
                        <>
                          {item.source_repo}
                          <span style={{ color: theme.text2 }}> → </span>
                          {item.target_repo ?? "—"}
                        </>
                      ) : (
                        item.source_repo
                      )}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: theme.text2 }}>
                      {new Date(item.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${theme.accent}18`,
                      color: theme.accent2,
                    }}
                  >
                    {EVENT_LABEL[item.event_type]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
