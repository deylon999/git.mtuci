import { useEffect, useMemo, useState } from "react";
import { Download, Search, Eye, Pencil, X } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";

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

  const c = isDarkTheme
    ? {
        page: "bg-[#0a0d14] text-[#e6edf3]",
        panel: "bg-[#111722] border-[#2a3140]",
        muted: "text-[#8b949e]",
        input: "bg-[#0a0d14] border-[#2a3140]",
      }
    : {
        page: "bg-[#f8fafc] text-slate-900",
        panel: "bg-white border-slate-200",
        muted: "text-slate-500",
        input: "bg-white border-slate-200",
      };

  return (
    <div className={`h-full overflow-y-auto ${c.page}`}>
      <div className="mx-auto max-w-[2100px] px-6 py-6 pb-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <AdminPageHeader isDarkTheme={isDarkTheme} title="Форки и клоны" />
          <div className="mt-1 flex gap-2">
            <button className={`h-8 rounded-md border px-3 text-xs ${c.panel}`}><Download className="mr-1 inline h-3.5 w-3.5" />Экспорт CSV</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Всего репозиториев", filtered.length],
            ["Активных", active],
            ["Создано сегодня", clonesToday],
            ["Уникальных студентов", users],
          ].map(([title, value]) => (
            <div key={String(title)} className={`rounded-xl border p-4 ${c.panel}`}>
              <p className={`text-xs ${c.muted}`}>{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-xl border ${c.panel}`}>
          <div className="flex items-center gap-2 border-b border-inherit p-3">
            <div className={`flex h-8 flex-1 items-center gap-2 rounded-md border px-2 ${c.input}`}>
              <Search className={`h-3.5 w-3.5 ${c.muted}`} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Поиск по репозиторию, студенту..." />
            </div>
          </div>

          {loading ? <p className="p-4 text-sm">Загрузка...</p> : error ? <p className="p-4 text-sm text-red-500">{error}</p> : (
            <table className="w-full text-sm">
              <thead className={`text-xs uppercase ${c.muted}`}><tr>{["Оригинальный репо","Владелец","Тип","Язык","Коммиты","Дата","Действия"].map((h) => <th key={h} className="px-3 py-3 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {filtered.slice(0, 20).map((row) => (
                  <tr key={row.id} className="border-t border-inherit">
                    <td className="px-3 py-3"><p className="font-medium">{row.name}</p><p className={`text-xs ${c.muted}`}>{row.clone_url || "—"}</p></td>
                    <td className="px-3 py-3">{row.owner_full_name || "Неизвестно"}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-[#1f6feb]/20 px-2 py-1 text-xs text-[#58a6ff]">{row.repo_type === "course" ? "Форк" : "Клон"}</span></td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageColors[row.language || ""] || "#8b949e" }} />{row.language || "—"}</span></td>
                    <td className="px-3 py-3">{row.commits_count}</td>
                    <td className={`px-3 py-3 ${c.muted}`}>{new Date(row.created_at).toLocaleDateString("ru-RU")}</td>
                    <td className="px-3 py-3"><div className="flex gap-1"><button className="rounded border border-inherit p-1"><Eye className="h-3 w-3" /></button><button className="rounded border border-inherit p-1"><Pencil className="h-3 w-3" /></button><button className="rounded border border-inherit p-1 text-[#f85149]"><X className="h-3 w-3" /></button></div></td>
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
