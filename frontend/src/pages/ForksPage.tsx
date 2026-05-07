import { Download, Plus, Search, Eye, Pencil, X } from "lucide-react";
import AdminPageHeader from "../components/AdminPageHeader";

interface ForksPageProps {
  isDarkTheme?: boolean;
}

type Row = {
  repo: string;
  repoPath: string;
  initials: string;
  ownerInitials: string;
  ownerName: string;
  ownerRepo: string;
  type: "Форк" | "Клон";
  language: string;
  languageColor: string;
  commits: number;
  additions: number;
  deletions: number;
  status: "Активен" | "Неактивен";
  date: string;
};

const rows: Row[] = [
  {
    repo: "os-course-2026",
    repoPath: "kuz/os-course-2026",
    initials: "КУ",
    ownerInitials: "ПИ",
    ownerName: "Петров И.А.",
    ownerRepo: "petrov/os-course-2026",
    type: "Форк",
    language: "C++",
    languageColor: "#f14e9e",
    commits: 24,
    additions: 142,
    deletions: 38,
    status: "Активен",
    date: "12.04.2026",
  },
  {
    repo: "networks-template",
    repoPath: "kuz/networks-template",
    initials: "СЕ",
    ownerInitials: "ОВ",
    ownerName: "Орлова В.С.",
    ownerRepo: "orlova/networks-template",
    type: "Форк",
    language: "C",
    languageColor: "#8b949e",
    commits: 8,
    additions: 56,
    deletions: 12,
    status: "Активен",
    date: "15.04.2026",
  },
  {
    repo: "algo-practice",
    repoPath: "sid/algo-practice",
    initials: "ИС",
    ownerInitials: "МЕ",
    ownerName: "Мишина Е.Р.",
    ownerRepo: "mishina/algo-practice",
    type: "Клон",
    language: "JS",
    languageColor: "#f4db4f",
    commits: 0,
    additions: 0,
    deletions: 0,
    status: "Неактивен",
    date: "20.04.2026",
  },
  {
    repo: "os-course-2026",
    repoPath: "kuz/os-course-2026",
    initials: "КУ",
    ownerInitials: "СА",
    ownerName: "Сидоров А.Н.",
    ownerRepo: "sidorov/os-course-2026",
    type: "Форк",
    language: "C++",
    languageColor: "#f14e9e",
    commits: 11,
    additions: 89,
    deletions: 5,
    status: "Активен",
    date: "18.04.2026",
  },
  {
    repo: "lab-db-petrov",
    repoPath: "ist21/lab-db-petrov",
    initials: "ИС",
    ownerInitials: "ИК",
    ownerName: "Иванов К.С.",
    ownerRepo: "ivanov/lab-db-petrov",
    type: "Клон",
    language: "Python",
    languageColor: "#3b82f6",
    commits: 3,
    additions: 17,
    deletions: 2,
    status: "Активен",
    date: "22.04.2026",
  },
];

const stats = [
  { title: "Всего форков", value: "128", extra: "↑ +12 за неделю" },
  { title: "Активных форков", value: "94", extra: "Без изменений" },
  { title: "Клонирований сегодня", value: "37", extra: "↑ +8 за день" },
  { title: "Уникальных студентов", value: "61", extra: "↑ +3 за неделю" },
];

const buttonBase = "h-8 rounded-md border border-[#2a3140] bg-[#0b111d] px-3 text-xs text-[#e6edf3]";

export default function ForksPage({ isDarkTheme = false }: ForksPageProps) {
  if (!isDarkTheme) {
    return <ForksPage isDarkTheme />;
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0d14] text-[#e6edf3]">
      <div className="mx-auto max-w-[2100px] px-6 py-6 pb-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <AdminPageHeader isDarkTheme={isDarkTheme} title="Форки и клоны" subtitle="Все форки репозиториев студентов платформы" />
          <div className="mt-1 flex gap-2">
            <button className={`${buttonBase} flex items-center gap-2`}><Download className="h-3.5 w-3.5" />Экспорт CSV</button>
            <button className="h-8 rounded-md bg-[#2563eb] px-3 text-xs font-medium text-white">+ Создать форк</button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.title} className="rounded-xl border border-[#2a3140] bg-[#111722] p-4">
              <p className="text-xs text-[#8b949e]">{stat.title}</p>
              <p className="mt-1 text-4 font-semibold text-[#e6edf3]">{stat.value}</p>
              <p className="mt-1 text-xs text-[#3fb950]">{stat.extra}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#2a3140] bg-[#111722]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#1f2633] p-3">
            {['Все', 'Форки', 'Клоны', 'Без изменений'].map((filter, idx) => (
              <button key={filter} className={`h-8 rounded-md px-4 text-xs ${idx === 0 ? 'bg-[#1f2633] text-white' : 'text-[#8b949e]'}`}>{filter}</button>
            ))}
            <div className="ml-2 flex h-8 flex-1 items-center gap-2 rounded-md border border-[#2a3140] bg-[#0a0d14] px-2 text-[#8b949e]">
              <Search className="h-3.5 w-3.5" />
              <input className="w-full bg-transparent text-sm outline-none" placeholder="Поиск по репозиторию, студенту..." />
            </div>
            <button className={buttonBase}>Все кафедры</button>
            <button className={buttonBase}>Все языки</button>
            <button className={buttonBase}>Сортировка: дата</button>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-[#1f2633] text-xs uppercase text-[#8b949e]">
              <tr>
                {['Оригинальный репо','Форк / владелец','Тип','Язык','Коммиты','Изменения','Статус','Дата форка','Действия'].map((h) => <th key={h} className="px-3 py-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.repo}${row.ownerName}`} className="border-b border-[#1f2633] last:border-b-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1d4ed8]/30 text-[10px] font-semibold text-[#60a5fa]">{row.initials}</span>
                      <div>
                        <p className="font-medium">{row.repo}</p><p className="text-xs text-[#8b949e]">{row.repoPath}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><p className="font-medium">{row.ownerName}</p><p className="text-xs text-[#8b949e]">{row.ownerRepo}</p></td>
                  <td className="px-3 py-3"><span className="rounded-full bg-[#1f6feb]/20 px-2 py-1 text-xs text-[#58a6ff]">{row.type}</span></td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.languageColor }} />{row.language}</span></td>
                  <td className="px-3 py-3">{row.commits}</td>
                  <td className="px-3 py-3">{row.additions === 0 && row.deletions === 0 ? <span className="text-[#8b949e]">Нет изменений</span> : <span><span className="text-[#3fb950]">+{row.additions}</span> <span className="text-[#f85149]">−{row.deletions}</span></span>}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.status === 'Активен' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#9e6a03]/20 text-[#d29922]'}`}>{row.status}</span></td>
                  <td className="px-3 py-3 text-[#8b949e]">{row.date}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="rounded border border-[#2a3140] p-1 text-[#8b949e]"><Eye className="h-3 w-3" /></button>
                      <button className="rounded border border-[#2a3140] p-1 text-[#8b949e]"><Pencil className="h-3 w-3" /></button>
                      <button className="rounded border border-[#2a3140] p-1 text-[#f85149]"><X className="h-3 w-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-[#1f2633] px-3 py-2 text-xs text-[#8b949e]">
            <span>Показано 5 из 128</span>
            <div className="flex items-center gap-2">
              <button className={buttonBase}>‹</button><button className="h-8 w-8 rounded-md bg-[#2563eb] text-white">1</button><button className={buttonBase}>2</button><button className={buttonBase}>3</button><button className={buttonBase}>…</button><button className={buttonBase}>13</button><button className={buttonBase}>›</button>
            </div>
            <span>По 10 на странице</span>
          </div>
        </div>
      </div>
    </div>
  );
}
