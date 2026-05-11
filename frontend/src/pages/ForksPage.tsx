
import { useEffect, useMemo, useState } from "react";
import { Download, Search, Eye, Pencil, X } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getTheme } from "../theme";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ForksPageProps { isDarkTheme?: boolean; }

interface Repository {
  id: string;
  name: string;
  owner_full_name: string | null;
  clone_url: string | null;
  commits_count: number;
  language: string | null;
  repo_type: "public" | "private" | "course";
  created_at: string;
  updated_at: string;
}

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const languageColors: Record<string, string> = { Python: "#3b82f6", JavaScript: "#f4db4f", TypeScript: "#3178c6", "C++": "#f14e9e", C: "#8b949e" };

export default function ForksPage({ isDarkTheme = false }: ForksPageProps) {
  const [rows, setRows] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/repositories?skip=0&limit=200`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: Repository[] = await response.json();
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => `${r.name} ${r.owner_full_name ?? ""}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const active = filtered.filter((r) => r.commits_count > 0).length;
  const clonesToday = filtered.filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString()).length;
  const users = new Set(filtered.map((r) => r.owner_full_name || r.id)).size;

  const theme = getTheme(isDarkTheme);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <div className="mx-auto max-w-[2100px] px-6 py-6 pb-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <AdminPageHeader isDarkTheme={isDarkTheme} title="Форки и клоны" />
          <div className="mt-1 flex gap-2">
            <button className="h-8 rounded-md border px-3 text-xs" style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}><Download className="mr-1 inline h-3.5 w-3.5" />Экспорт CSV</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Всего репозиториев", filtered.length],
            ["Активных", active],
            ["Создано сегодня", clonesToday],
            ["Уникальных студентов", users],
          ].map(([title, value]) => (
            <div key={String(title)} className="rounded-xl border p-4" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
              <p className="text-xs" style={{ color: theme.text2 }}>{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border" style={{ backgroundColor: theme.bg3, borderColor: theme.border }}>
          <div className="flex items-center gap-2 border-b border-inherit p-3" style={{ borderColor: theme.border }}>
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md border px-2" style={{ backgroundColor: theme.inputBg, borderColor: theme.border }}>
              <Search className="h-3.5 w-3.5" style={{ color: theme.text2 }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none" style={{ color: theme.text }} placeholder="Поиск по репозиторию, студенту..." />
            </div>
            <span style={{ color: theme.text2 }}>По 10 на странице</span>
          </div>

          {loading ? <p className="p-4 text-sm">Загрузка...</p> : error ? <p className="p-4 text-sm text-red-500">{error}</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase" style={{ color: theme.text2 }}><tr>{["Оригинальный репо","Владелец","Тип","Язык","Коммиты","Дата","Действия"].map((h) => <th key={h} className="px-3 py-3 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {filtered.slice(0, 20).map((row) => (
                  <tr key={row.id} className="border-t border-inherit" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-3"><p className="font-medium">{row.name}</p><p className="text-xs" style={{ color: theme.text2 }}>{row.clone_url || "—"}</p></td>
                    <td className="px-3 py-3">{row.owner_full_name || "Неизвестно"}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-[#1f6feb]/20 px-2 py-1 text-xs text-[#58a6ff]">{row.repo_type === "course" ? "Форк" : "Клон"}</span></td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageColors[row.language || ""] || "#8b949e" }} />{row.language || "—"}</span></td>
                    <td className="px-3 py-3">{row.commits_count}</td>
                    <td className="px-3 py-3" style={{ color: theme.text2 }}>{new Date(row.created_at).toLocaleDateString("ru-RU")}</td>
                    <td className="px-3 py-3"><div className="flex gap-1"><button className="rounded border border-inherit p-1" style={{ borderColor: theme.border }}><Eye className="h-3 w-3" /></button><button className="rounded border border-inherit p-1" style={{ borderColor: theme.border }}><Pencil className="h-3 w-3" /></button><button className="rounded border border-inherit p-1 text-[#f85149]" style={{ borderColor: theme.border }}><X className="h-3 w-3" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
