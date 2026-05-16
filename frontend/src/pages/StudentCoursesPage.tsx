import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Loader2, User } from "lucide-react";
import { getMe } from "../api/authApi";
import { getCourses } from "../api/coursesApi";
import type { Course } from "../api/types";
import { getTheme } from "../theme";

const BANNER_GRADIENTS = [
  "linear-gradient(135deg,#1a237e,#283593)",
  "linear-gradient(135deg,#4a148c,#6a1b9a)",
  "linear-gradient(135deg,#1b5e20,#2e7d32)",
  "linear-gradient(135deg,#b71c1c,#c62828)",
  "linear-gradient(135deg,#0d47a1,#1565c0)",
];

const BANNER_EMOJI = ["🗄️", "🔐", "🌐", "📐", "💻", "🧮"];

type TabKey = "active" | "done" | "all";

interface StudentCoursesPageProps {
  isDarkTheme?: boolean;
}

export default function StudentCoursesPage({ isDarkTheme = false }: StudentCoursesPageProps) {
  const theme = getTheme(isDarkTheme);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("active");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [me, list] = await Promise.all([getMe(), getCourses()]);
        if (cancelled) return;
        setGroupName(me.group_name);
        setCourses(list);
      } catch {
        if (!cancelled) setCourses([]);
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
    if (tab === "all") return courses;
    return courses;
  }, [courses, tab]);

  const tabs: { id: TabKey; label: string }[] = [
    { id: "active", label: `Активные (${courses.length})` },
    { id: "done", label: "Завершённые (0)" },
    { id: "all", label: "Все" },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold" style={{ color: theme.text }}>
          Мои курсы
        </h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
          {groupName ? `${groupName} · ` : ""}
          {courses.length} {courses.length === 1 ? "курс" : "курсов"}
        </p>
      </header>

      <div
        className="inline-flex gap-1 rounded-lg border p-1 w-fit"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: tab === t.id ? theme.bg4 : "transparent",
              color: tab === t.id ? theme.text : theme.text2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          Загрузка курсов…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border py-16 text-center text-sm"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text2 }}
        >
          Курсы не найдены. Обратитесь к преподавателю для зачисления.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((course, i) => (
            <CourseCard key={course.id} course={course} index={i} theme={theme} groupName={groupName} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  index,
  theme,
  groupName,
}: {
  course: Course;
  index: number;
  theme: ReturnType<typeof getTheme>;
  groupName: string | null;
}) {
  const gradient = BANNER_GRADIENTS[index % BANNER_GRADIENTS.length];
  const emoji = BANNER_EMOJI[index % BANNER_EMOJI.length];
  const progress = Math.min(100, 20 + (index % 4) * 20);

  return (
    <article
      className="rounded-xl border overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      <div className="h-20 flex items-center justify-center relative" style={{ background: gradient }}>
        <span className="text-3xl">{emoji}</span>
        {index === 0 ? (
          <span
            className="absolute top-2 right-2 text-[10px] font-medium rounded px-1.5 py-0.5"
            style={{ backgroundColor: `${theme.warning}22`, color: theme.warning }}
          >
            Активный
          </span>
        ) : null}
      </div>
      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
            {course.title}
          </h2>
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: theme.text2 }}>
            <User className="h-3 w-3" />
            Преподаватель · {groupName ?? "группа"}
          </p>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span style={{ color: theme.text2 }}>Прогресс курса</span>
            <span style={{ color: theme.success }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: theme.success }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { val: "—", lbl: "Балл" },
            { val: "0/—", lbl: "Сдано" },
            { val: String(course.enrolled_count ?? 0), lbl: "В группе" },
          ].map((s) => (
            <div key={s.lbl} className="rounded-md py-1.5" style={{ backgroundColor: theme.bg }}>
              <div className="text-sm font-semibold" style={{ color: theme.text }}>
                {s.val}
              </div>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: theme.text3 }}>
                {s.lbl}
              </div>
            </div>
          ))}
        </div>
        <div
          className="flex items-center justify-between pt-2 border-t mt-auto"
          style={{ borderColor: theme.border }}
        >
          <span className="text-[11px] flex items-center gap-1" style={{ color: theme.text2 }}>
            <Clock className="h-3 w-3" />
            Задания в курсе
          </span>
          <Link
            to={`/courses/${course.id}`}
            className="text-[11px] font-medium rounded-md px-2.5 py-1"
            style={{ backgroundColor: theme.accent, color: "#fff" }}
          >
            Открыть
          </Link>
        </div>
      </div>
    </article>
  );
}
