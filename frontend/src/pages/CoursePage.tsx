import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { getMe } from "../api/authApi";
import { createAssignment, getAssignments, getCourses, deleteAssignment } from "../api/coursesApi";
import type { Assignment, UserRead } from "../api/types";

interface CoursePageProps {
  isDarkTheme?: boolean;
}

export default function CoursePage({ isDarkTheme = true }: CoursePageProps) {
  // Theme-based colors
  const pageBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-50";
  const pageText = isDarkTheme ? "text-white" : "text-gray-900";
  const cardBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-100";
  const cardBorder = isDarkTheme ? "border-[#2d2d2d]" : "border-gray-200";
  const textPrimary = isDarkTheme ? "text-[#ccd0d4]" : "text-gray-900";
  const textSecondary = isDarkTheme ? "text-[#8b949e]" : "text-gray-600";
  const textTertiary = isDarkTheme ? "text-[#6e7681]" : "text-gray-500";
  const inputBg = isDarkTheme ? "bg-[#0d1117]" : "bg-gray-100";
  const inputBorder = isDarkTheme ? "border-[#30363d]" : "border-gray-300";
  const breadcrumbText = isDarkTheme ? "text-purple-400" : "text-purple-700";
  const breadcrumbHover = isDarkTheme ? "hover:text-purple-300" : "hover:text-purple-800";
  const buttonPrimary = isDarkTheme ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white";
  const buttonSecondary = isDarkTheme ? "border-[#30363d] text-[#8b949e] hover:bg-[#2d2d2d]" : "border-gray-300 text-gray-700 hover:bg-gray-200";
  const formCard = isDarkTheme ? "bg-[#0f0f10] border-[#2d2d2d]" : "bg-gray-100 border-gray-200";
  const commitCard = isDarkTheme ? "border-[#2d2d2d] bg-[#0f0f10]" : "border-gray-100 bg-gray-50";
  const errorBox = isDarkTheme ? "border-red-800 bg-red-900/20 text-red-300" : "border-red-200 bg-red-50 text-red-800";
  const warningBox = isDarkTheme ? "border-yellow-800 bg-yellow-900/20 text-yellow-300" : "border-yellow-200 bg-yellow-50 text-yellow-800";
  const timelineDot = isDarkTheme ? "bg-purple-500" : "bg-purple-500";
  const timelineLine = isDarkTheme ? "bg-[#2d2d2d]" : "bg-purple-100";
  const codeHeader = isDarkTheme ? "border-[#30363d] bg-[#0f0f10] text-[#ccd0d4]" : "border-gray-200 bg-gray-100 text-gray-800";
  const codeLineNum = isDarkTheme ? "border-[#30363d] text-[#6e7681]" : "border-gray-100 text-gray-500";
  const avatarBg = isDarkTheme ? "bg-purple-900/30 text-purple-300" : "bg-indigo-100 text-indigo-700";
  const gaugeBg = isDarkTheme ? "#2d2d2d" : "#e5e7eb";
  const modalOverlay = isDarkTheme ? "bg-black/60" : "bg-black/40";
  const modalBg = isDarkTheme ? "bg-[#0f0f10]" : "bg-gray-100";
  const linkCard = isDarkTheme ? "bg-[#1f2937] border-[#30363d] hover:border-purple-500/50 hover:bg-[#2d2d2d]" : "bg-gray-50 border-gray-200 hover:border-purple-200 hover:bg-gray-100";
  const badgeActive = isDarkTheme ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700";
  const deleteBtn = isDarkTheme ? "bg-red-900/30 text-red-300 hover:bg-red-900/50" : "bg-red-100 text-red-700 hover:bg-red-200";
  const tabActiveBg = isDarkTheme ? "border-purple-500/30 bg-purple-600/20 text-purple-300" : "border-purple-200 bg-purple-100 text-purple-700";
  const tabInactiveBg = isDarkTheme ? "border-[#30363d] bg-transparent text-[#8b949e] hover:border-purple-500/30 hover:text-purple-300" : "border-gray-200 bg-gray-100 text-gray-700 hover:border-purple-200 hover:text-purple-700";
  const penaltyBox = isDarkTheme ? "border-[#30363d] bg-[#1f2937]" : "border-gray-200 bg-gray-100";
  const commitHash = isDarkTheme ? "text-purple-400" : "text-purple-700";

  // Form accent colors
  const todayBtn = isDarkTheme ? "bg-purple-900/30 text-purple-300 hover:bg-purple-900/50" : "bg-purple-100 text-purple-700 hover:bg-purple-200";
  const fileItem = isDarkTheme ? "bg-[#1f2937] text-[#ccd0d4]" : "bg-gray-100 text-gray-700";
  const penaltyDeleteBtn = isDarkTheme ? "border-red-800 text-red-300 hover:bg-red-900/20" : "border-red-200 text-red-700 hover:bg-red-100";
  const { courseId } = useParams();
  const today = useMemo(() => {
    // Get Moscow date (UTC+3)
    const moscowDate = new Date().toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // Convert from DD.MM.YYYY to YYYY-MM-DD
    const [day, month, year] = moscowDate.split('.');
    return `${year}-${month}-${day}`;
  }, []);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<UserRead | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [latePenaltyPeriods, setLatePenaltyPeriods] = useState<Array<{ weeks: number; max_grade: number }>>([
    { weeks: 1, max_grade: 4 },
  ]);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [penaltyValidationError, setPenaltyValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const courseIdStr = courseId; // capture for TypeScript

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [meResult, as, cs] = await Promise.allSettled([
          getMe(),
          getAssignments(courseIdStr),
          getCourses(),
        ]);

        if (meResult.status === "fulfilled" && !cancelled) {
          setMe(meResult.value);
        }
        if (as.status === "fulfilled" && !cancelled) setAssignments(as.value);
        if (cs.status === "fulfilled" && !cancelled) {
          const found = cs.value.find((c) => c.id === courseIdStr);
          if (found) setCourseTitle(found.title);
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
  }, [courseId]);

  const canCreateAssignment = me?.role === "teacher";
  const sortedLatePenaltyPeriods = useMemo(
    () => [...latePenaltyPeriods].sort((a, b) => a.weeks - b.weeks),
    [latePenaltyPeriods],
  );

  function validatePenaltyPeriods(periods: Array<{ weeks: number; max_grade: number }>): string | null {
    let prevWeeks: number | null = null;
    let prevMaxGrade: number | null = null;
    for (const period of periods) {
      if (!Number.isFinite(period.weeks) || period.weeks <= 0) {
        return "Период должен быть больше 0 недель";
      }
      if (!Number.isFinite(period.max_grade) || period.max_grade < 0) {
        return "Максимальная оценка не может быть отрицательной";
      }
      if (prevWeeks !== null && period.weeks <= prevWeeks) {
        return "Периоды должны быть отсортированы по возрастанию недель";
      }
      if (prevMaxGrade !== null && period.max_grade >= prevMaxGrade) {
        return "Максимальная оценка должна убывать с увеличением срока просрочки";
      }
      prevWeeks = period.weeks;
      prevMaxGrade = period.max_grade;
    }
    return null;
  }

  async function onCreateAssignment(e: FormEvent) {
    e.preventDefault();
    if (!courseId) return;

    setCreateLoading(true);
    setCreateError(null);
    setPenaltyValidationError(null);
    try {
      // Validate deadline is not in the past
      if (createDeadline) {
        const deadlineDate = new Date(createDeadline);
        const now = new Date();
        if (deadlineDate < now) {
          setCreateError("Дедлайн не может быть в прошлом");
          setCreateLoading(false);
          return;
        }
      }
      
      // Validate start date is not after deadline
      if (createStartDate && createDeadline) {
        const start = new Date(createStartDate);
        const deadline = new Date(createDeadline);
        if (start > deadline) {
          setCreateError("Дата начала не может быть позже дедлайна");
          setCreateLoading(false);
          return;
        }
      }

      const validationError = validatePenaltyPeriods(latePenaltyPeriods);
      if (validationError) {
        setPenaltyValidationError(validationError);
        setCreateLoading(false);
        return;
      }
      const deadlineIso = new Date(createDeadline).toISOString();
      const startDateIso = new Date(createStartDate).toISOString();
      const created = await createAssignment(courseId, {
        title: createTitle.trim(),
        description: createDescription.trim(),
        start_date: startDateIso,
        deadline: deadlineIso,
        late_penalty_periods: latePenaltyPeriods,
        files: createFiles,
      });
      setAssignments((prev) => [...prev, created].sort((a, b) => a.deadline.localeCompare(b.deadline)));
      setCreateTitle("");
      setCreateDescription("");
      setCreateStartDate("");
      setCreateDeadline("");
      setLatePenaltyPeriods([{ weeks: 1, max_grade: 4 }]);
      setCreateFiles([]);
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!courseId) return;
    if (!confirm("Удалить это задание? Это действие нельзя отменить.")) return;
    
    try {
      await deleteAssignment(courseId, assignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete assignment");
    }
  }

  if (!courseId) return null;

  return (
    <div className={`mx-auto max-w-7xl px-4 ${pageBg} min-h-screen py-4`}>
      <div className={`mb-3 text-sm ${textSecondary}`}>
        <Link to="/courses" className={`${breadcrumbText} ${breadcrumbHover}`}>
          Курсы
        </Link>
        <span className={`mx-2 ${textTertiary}`}>&gt;</span>
        <span className={`font-medium ${textPrimary}`}>{courseTitle ?? "Курс"}</span>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className={`text-3xl font-semibold ${textPrimary}`}>{courseTitle ?? "Курс"}</h1>
        {canCreateAssignment ? (
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${buttonPrimary}`}
          >
            {showCreateForm ? "Скрыть форму" : "Создать задание"}
          </button>
        ) : null}
      </div>

      {showCreateForm && canCreateAssignment ? (
        <form
          onSubmit={onCreateAssignment}
          className={`mb-6 rounded-xl border ${cardBorder} ${cardBg} p-5 shadow-md`}
        >
          <div className={`mb-3 text-sm font-semibold ${textPrimary}`}>Новое задание</div>
          <div className="grid gap-3">
            <input
              type="text"
              placeholder="title"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className={`w-full rounded-lg border ${inputBorder} px-3 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
              required
            />
            <textarea
              placeholder="description"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              className={`min-h-24 w-full rounded-lg border ${inputBorder} px-3 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
            />
            <div>
              <label className={`mb-1 block text-sm font-medium ${textSecondary}`}>Файлы задания</label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setCreateFiles(files);
                }}
                className={`w-full rounded-lg border ${inputBorder} px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-purple-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-purple-700 hover:file:bg-purple-200 ${inputBg} ${textPrimary}`}
              />
              {createFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {createFiles.map((file, idx) => (
                    <div key={idx} className={`flex items-center justify-between rounded-md px-3 py-1 text-sm ${fileItem}`}>
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setCreateFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className={`ml-2 ${isDarkTheme ? "text-red-400 hover:text-red-300" : "text-red-600 hover:text-red-800"}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={`mb-1 block text-sm font-medium ${textSecondary}`}>Дата начала</label>
              <div className="relative flex items-center">
                <input
                  type="date"
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                  className={`w-full rounded-lg border ${inputBorder} px-3 py-2 pr-24 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setCreateStartDate(today)}
                  className={`absolute right-2 rounded-md px-3 py-1 text-xs font-medium transition ${todayBtn}`}
                >
                  Сегодня
                </button>
              </div>
            </div>
            <div>
              <label className={`mb-1 block text-sm font-medium ${textSecondary}`}>Дедлайн</label>
              <input
                type="datetime-local"
                value={createDeadline}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    const selected = new Date(value);
                    const now = new Date();
                    if (selected < now) {
                      setCreateError("Дедлайн не может быть в прошлом");
                      return;
                    }
                  }
                  setCreateError(null);
                  setCreateDeadline(value);
                }}
                min={`${today}T00:00`}
                className={`w-full rounded-lg border ${inputBorder} px-3 py-2 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
                required
              />
            </div>
            <div className={`rounded-lg border ${cardBorder} p-3`}>
              <div className="mb-2 flex items-center justify-between">
                <label className={`text-sm font-medium ${textSecondary}`}>Штрафы за просрочку</label>
                <button
                  type="button"
                  onClick={() =>
                    setLatePenaltyPeriods((prev) => [
                      ...prev,
                      {
                        weeks: (prev.length > 0 ? prev[prev.length - 1].weeks : 1) + 1,
                        max_grade: prev.length > 0 ? Math.max(0, prev[prev.length - 1].max_grade - 1) : 0,
                      },
                    ])
                  }
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${todayBtn}`}
                >
                  Добавить период штрафа
                </button>
              </div>

              <div className="space-y-2">
                {latePenaltyPeriods.map((period, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={1}
                      value={period.weeks}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^0+(?=[1-9])/, "");
                        const nextWeeks = val === "" ? 0 : parseInt(val, 10);
                        const prevWeeks = idx > 0 ? latePenaltyPeriods[idx - 1].weeks : null;
                        if (prevWeeks !== null && nextWeeks <= prevWeeks && nextWeeks !== 0) {
                          setPenaltyValidationError(
                            "Нельзя добавить период с неделями меньше или равными предыдущему периоду",
                          );
                          return;
                        }
                        setPenaltyValidationError(null);
                        setLatePenaltyPeriods((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, weeks: nextWeeks } : p)),
                        );
                      }}
                      className={`rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
                      placeholder="до X недель"
                      required
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      value={period.max_grade}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^0+(?=[0-9])/, "");
                        const nextMax = val === "" ? 0 : parseInt(val, 10);
                        const prevMax = idx > 0 ? latePenaltyPeriods[idx - 1].max_grade : null;
                        if (prevMax !== null && nextMax > prevMax) {
                          setPenaltyValidationError(
                            "Максимальная оценка должна убывать с увеличением срока просрочки",
                          );
                          return;
                        }
                        setPenaltyValidationError(null);
                        setLatePenaltyPeriods((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, max_grade: nextMax } : p)),
                        );
                      }}
                      className={`rounded-lg border ${inputBorder} px-3 py-2 text-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 ${inputBg} ${textPrimary}`}
                      placeholder="максимальная оценка"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setLatePenaltyPeriods((prev) => prev.filter((_, i) => i !== idx))}
                      className={`rounded-lg border px-3 py-2 text-xs ${penaltyDeleteBtn}`}
                      disabled={latePenaltyPeriods.length === 1}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>

              <div className={`mt-3 rounded-lg p-3 text-sm ${penaltyBox}`}>
                <div className={`mb-1 font-medium ${textSecondary}`}>Периоды:</div>
                {sortedLatePenaltyPeriods.map((p, idx) => (
                    <div key={`${p.weeks}-${idx}`} className={textTertiary}>
                      До {p.weeks} недели → макс. {p.max_grade}
                    </div>
                  ))}
                <div className={`mt-1 ${textPrimary}`}>Позже → макс. 0</div>
              </div>
              {penaltyValidationError ? (
                <div className={`mt-2 rounded-md border p-2 text-xs ${errorBox}`}>
                  {penaltyValidationError}
                </div>
              ) : null}
            </div>
          </div>
          {createError ? (
            <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
              {createError}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${buttonSecondary}`}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={createLoading || !!penaltyValidationError}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${buttonPrimary}`}
            >
              {createLoading ? "Создание..." : "Создать"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <div className={`text-sm ${textSecondary}`}>Loading...</div> : null}
      {error ? (
        <div className={`rounded-md border p-3 text-sm ${errorBox}`}>
          {error}
        </div>
      ) : null}

      <div className={`rounded-xl border ${cardBorder} ${cardBg} p-4 shadow-md`}>
        <div className={`mb-3 text-lg font-semibold ${textPrimary}`}>Задания</div>
        <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="group relative">
            <Link
              to={`/courses/${courseId}/assignments/${a.id}`}
              className={`block rounded-xl border p-4 transition ${linkCard}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`flex items-center gap-2 text-base font-semibold ${textPrimary}`}>
                    <span>📘</span>
                    <span className="truncate">{a.title}</span>
                  </div>
                  {a.description ? (
                    <div className={`mt-1 text-sm line-clamp-3 ${textSecondary}`}>
                      {a.description}
                    </div>
                  ) : null}
                </div>
                <div className={`text-right text-sm ${textSecondary}`}>
                  <div>
                    Дедлайн: <span className="font-medium">{new Date(a.deadline).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeActive}`}>
                      Активно
                    </span>
                  </div>
                </div>
              </div>
            </Link>
            {canCreateAssignment && (
              <button
                onClick={() => handleDeleteAssignment(a.id)}
                className={`absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium opacity-0 transition group-hover:opacity-100 ${deleteBtn}`}
                title="Удалить задание"
              >
                🗑️
              </button>
            )}
          </div>
        ))}
        </div>
      </div>

      {!loading && !error && assignments.length === 0 ? (
        <div className={`mt-6 text-sm ${textSecondary}`}>No assignments found.</div>
      ) : null}
    </div>
  );
}

