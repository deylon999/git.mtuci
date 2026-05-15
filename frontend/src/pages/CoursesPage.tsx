import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMe } from "../api/authApi";
import { createCourse, deleteCourse, getCourses, getGroups } from "../api/coursesApi";
import { getTheme } from "../theme";
import type { Course, UserRead } from "../api/types";

interface CoursesPageProps {
  isDarkTheme?: boolean;
}

export default function CoursesPage({ isDarkTheme = true }: CoursesPageProps) {
  const theme = getTheme(isDarkTheme);
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<UserRead | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createGradeMax, setCreateGradeMax] = useState(10);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  
  // Groups selection
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [meResult, coursesResult, groupsResult] = await Promise.allSettled([
          getMe(), 
          getCourses(),
          getGroups()
        ]);
        if (cancelled) return;

        if (meResult.status === "fulfilled") {
          setMe(meResult.value);
        } else {
          setError(meResult.reason instanceof Error ? meResult.reason.message : "Failed");
          setCourses([]);
          return;
        }

        if (coursesResult.status === "fulfilled") {
          setCourses(coursesResult.value);
        } else {
          setError(
            coursesResult.reason instanceof Error ? coursesResult.reason.message : "Failed",
          );
        }
        
        if (groupsResult.status === "fulfilled") {
          setAvailableGroups(groupsResult.value);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canCreateCourse = me?.role === "teacher";

  const filteredCourses = useMemo(() => {
    if (!searchQuery) return courses;
    return courses.filter((c) => {
      const title = c.title.toLowerCase();
      const desc = (c.description ?? "").toLowerCase();
      return title.includes(searchQuery) || desc.includes(searchQuery);
    });
  }, [courses, searchQuery]);

  async function onCreateCourse(e: FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      if (!Number.isInteger(createGradeMax) || createGradeMax < 0 || createGradeMax > 50) {
        setCreateError("Максимальная оценка должна быть целым числом от 0 до 50.");
        return;
      }
      const created = await createCourse({
        title: createTitle.trim(),
        description: createDescription.trim(),
        grade_max: createGradeMax,
        target_groups: selectedGroups.length > 0 ? selectedGroups : undefined,
      });
      setCourses((prev) => [created, ...prev]);
      setCreateTitle("");
      setCreateDescription("");
      setCreateGradeMax(10);
      setSelectedGroups([]);
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeleteCourse(courseId: string) {
    const ok = window.confirm("Удалить курс? Будут удалены все задания и зачисления.");
    if (!ok) return;

    setDeletingCourseId(courseId);
    setError(null);
    try {
      await deleteCourse(courseId);
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setDeletingCourseId(null);
    }
  }

  return (
    <div className="w-full min-h-screen py-4" style={{ backgroundColor: theme.bg }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: theme.text }}>Мои курсы</h1>
          {searchQuery ? (
            <p className="mt-1 text-sm" style={{ color: theme.text2 }}>
              Поиск: «{searchParams.get("q")}»
            </p>
          ) : null}
        </div>
        {canCreateCourse ? (
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{ backgroundColor: theme.accent, color: '#fff' }}
          >
            {showCreateForm ? "Скрыть форму" : "Создать курс"}
          </button>
        ) : null}
      </div>

      {showCreateForm && canCreateCourse ? (
        <form
          onSubmit={onCreateCourse}
          className="mb-6 rounded-xl border p-5 shadow-md"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <div className="mb-3 text-sm font-semibold" style={{ color: theme.text }}>Новый курс</div>
          <div className="grid gap-3">
            <input
              type="text"
              placeholder="title"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              required
            />
            <textarea
              placeholder="description"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              className="min-h-24 w-full rounded-lg border px-3 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
            />
            <div className="rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: theme.accent + '80', backgroundColor: theme.accent + '20', color: theme.accent }}>
              Максимальная оценка: {createGradeMax}
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              list="grade-marks"
              value={createGradeMax}
              onChange={(e) => setCreateGradeMax(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: theme.accent }}
              required
            />
            <datalist id="grade-marks">
              <option value="0">0</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="30">30</option>
              <option value="35">35</option>
              <option value="40">40</option>
              <option value="45">45</option>
              <option value="50">50</option>
            </datalist>
            <div className="mt-1 flex justify-between text-xs"
            style={{ color: theme.text3 }}>
              <span>0</span>
              <span>5</span>
              <span>10</span>
              <span>15</span>
              <span>20</span>
              <span>25</span>
              <span>30</span>
              <span>35</span>
              <span>40</span>
              <span>45</span>
              <span>50</span>
            </div>

            {/* Groups selection */}
            {availableGroups.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium" style={{ color: theme.text2 }}>Доступные группы:</div>
                <div className="flex flex-wrap gap-2">
                  {availableGroups.map((group) => (
                    <label
                      key={group}
                      className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition"
                      style={{
                        borderColor: selectedGroups.includes(group) ? theme.accent : theme.border,
                        backgroundColor: selectedGroups.includes(group) ? theme.accent + '20' : theme.bg2,
                        color: selectedGroups.includes(group) ? theme.accent : theme.text2
                      }}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selectedGroups.includes(group)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGroups((prev) => [...prev, group]);
                          } else {
                            setSelectedGroups((prev) => prev.filter((g) => g !== group));
                          }
                        }}
                      />
                      {group}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 text-xs" style={{ color: theme.text3 }}>
              Выбрано: {selectedGroups.length} {selectedGroups.length === 1 ? 'группа' : selectedGroups.length > 1 && selectedGroups.length < 5 ? 'группы' : 'групп'}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={createLoading}
                className="w-full rounded-lg px-4 py-2 text-sm font-medium transition"
                style={{ backgroundColor: theme.accent, color: '#fff' }}
              >
                {createLoading ? "Создание..." : "Создать курс"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateTitle("");
                  setCreateDescription("");
                  setCreateGradeMax(10);
                  setSelectedGroups([]);
                  setCreateError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium transition"
                style={{ border: `1px solid ${theme.border}`, color: theme.text2 }}
              >
                Отмена
              </button>
            </div>

            {createError && <div className="mb-4 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: theme.danger + '80', backgroundColor: theme.danger + '20', color: theme.danger }}>{createError}</div>}
          </div>
        </form>
      ) : null}

      {loading ? <div className="text-sm" style={{ color: theme.text2 }}>Loading...</div> : null}
      {error ? (
        <div className="rounded-md border p-3 text-sm"
        style={{ borderColor: theme.danger + '80', backgroundColor: theme.danger + '20', color: theme.danger }}>
          {error}
        </div>
      ) : null}

      {!loading && !error && searchQuery && filteredCourses.length === 0 ? (
        <p className="text-sm mb-4" style={{ color: theme.text2 }}>
          Ничего не найдено по запросу «{searchParams.get("q")}»
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCourses.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border p-5 shadow-md transition duration-200"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div className="flex items-start justify-between gap-3">
              <Link to={`/courses/${c.id}`} className="min-w-0 flex-1">
                <div className="text-base font-semibold" style={{ color: theme.text }}>{c.title}</div>
                {c.description ? (
                  <div className="mt-1 text-sm line-clamp-3" style={{ color: theme.text2 }}>
                    {c.description}
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs" style={{ color: theme.text2 }}>
                  <div className="rounded-md px-2 py-1" style={{ backgroundColor: theme.bg4 }}>Студентов: {c.enrolled_count ?? 0}</div>
                  <div className="rounded-md px-2 py-1" style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                    Макс. оценка: {c.grade_max}
                  </div>
                </div>
              </Link>

              {canCreateCourse ? (
                <button
                  type="button"
                  title="Удалить курс"
                  onClick={() => onDeleteCourse(c.id)}
                  disabled={deletingCourseId === c.id}
                  className="rounded-lg border px-2 py-1 transition disabled:opacity-60"
                  style={{ borderColor: theme.danger + '80', color: theme.danger }}
                >
                  🗑️
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!loading && !error && courses.length === 0 ? (
        <div className="mt-6 text-sm" style={{ color: theme.text2 }}>No courses found.</div>
      ) : null}
    </div>
  );
}

