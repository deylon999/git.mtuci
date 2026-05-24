import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, Plus, Users, X } from "lucide-react";
import { getMe } from "../api/authApi";
import { getAdminUsers } from "../api/adminApi";
import { createCourse, deleteCourse, getCourses, getGroups } from "../api/coursesApi";
import type { AdminUserRead } from "../api/types";
import { getTheme } from "../theme";
import type { Course, UserRead } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { usePermissions } from "../hooks/usePermissions";
import { useAuthUser } from "../context/AuthUserContext";
import { pluralWord } from "../i18n/plural";

interface CoursesPageProps {
  isDarkTheme?: boolean;
}

function fieldLabel(theme: ReturnType<typeof getTheme>, text: string) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide" style={{ color: theme.text2 }}>
      {text}
    </label>
  );
}

export default function CoursesPage({ isDarkTheme = true }: CoursesPageProps) {
  const { t, tp, language } = useUserPreferences();
  const { hasPermission } = usePermissions();
  const { user: authUser } = useAuthUser();
  const theme = getTheme(isDarkTheme);
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();
  const openCreate = searchParams.get("create") === "1";

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<UserRead | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(openCreate);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createGradeMax, setCreateGradeMax] = useState(10);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);

  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<AdminUserRead[]>([]);
  const [createTeacherId, setCreateTeacherId] = useState("");

  const inputClass = "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition";
  const inputStyle = {
    backgroundColor: theme.inputBg,
    borderColor: theme.border,
    color: theme.text,
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [meResult, coursesResult, groupsResult] = await Promise.allSettled([
          getMe(),
          getCourses(),
          getGroups(),
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

  const isAdmin = me?.role === "admin" || authUser?.role === "admin";
  const canCreateCourse =
    hasPermission("assignment_create") && (me?.role === "teacher" || isAdmin);

  useEffect(() => {
    if (!isAdmin || !showCreateForm) return;
    let cancelled = false;
    void getAdminUsers()
      .then((users) => {
        if (cancelled) return;
        const teachers = users.filter((u) => u.role === "teacher" && !u.is_blocked);
        setTeacherOptions(teachers);
        setCreateTeacherId((prev) => prev || teachers[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setTeacherOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, showCreateForm]);

  const filteredCourses = useMemo(() => {
    if (!searchQuery) return courses;
    return courses.filter((c) => {
      const title = c.title.toLowerCase();
      const desc = (c.description ?? "").toLowerCase();
      return title.includes(searchQuery) || desc.includes(searchQuery);
    });
  }, [courses, searchQuery]);

  function resetCreateForm() {
    setShowCreateForm(false);
    setCreateTitle("");
    setCreateDescription("");
    setCreateGradeMax(10);
    setSelectedGroups([]);
    setCreateTeacherId("");
    setCreateError(null);
  }

  async function onCreateCourse(e: FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      if (!Number.isInteger(createGradeMax) || createGradeMax < 0 || createGradeMax > 50) {
        setCreateError(t("admin.courses.gradeMaxError"));
        return;
      }
      if (isAdmin && !createTeacherId) {
        setCreateError(t("admin.courses.teacherRequired"));
        return;
      }
      const created = await createCourse({
        title: createTitle.trim(),
        description: createDescription.trim(),
        grade_max: createGradeMax,
        target_groups: selectedGroups.length > 0 ? selectedGroups : undefined,
        ...(isAdmin ? { teacher_id: createTeacherId } : {}),
      });
      setCourses((prev) => [created, ...prev]);
      resetCreateForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeleteCourse(courseId: string) {
    const ok = window.confirm(t("admin.courses.deleteConfirm"));
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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${theme.accent}22`, color: theme.accent }}
          >
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: theme.text }}>
              {t("admin.courses.myCourses")}
            </h1>
            {searchQuery ? (
              <p className="mt-1 text-sm" style={{ color: theme.text2 }}>
                {tp("admin.courses.searchQuery", { q: searchParams.get("q") ?? "" })}
              </p>
            ) : null}
          </div>
        </div>
        {canCreateCourse ? (
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
            style={{ backgroundColor: theme.accent, color: "#fff" }}
          >
            <Plus className="h-4 w-4" />
            {showCreateForm ? t("admin.courses.hideForm") : t("admin.courses.createCourse")}
          </button>
        ) : null}
      </div>

      {showCreateForm && canCreateCourse ? (
        <form
          onSubmit={onCreateCourse}
          className="mb-8 overflow-hidden rounded-2xl border shadow-lg"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
            style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
          >
            <div>
              <h2 className="text-base font-semibold" style={{ color: theme.text }}>
                {t("admin.courses.newCourse")}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: theme.text2 }}>
                {t("admin.courses.newCourseHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={resetCreateForm}
              className="rounded-lg p-1.5 transition hover:opacity-80"
              style={{ color: theme.text2 }}
              aria-label={t("common.cancel")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              {isAdmin ? (
                <>
                  {fieldLabel(theme, t("admin.courses.fieldTeacher"))}
                  <select
                    value={createTeacherId}
                    onChange={(e) => setCreateTeacherId(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                    required
                  >
                    <option value="">{t("admin.courses.selectTeacher")}</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.full_name || teacher.email}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {fieldLabel(theme, t("admin.courses.fieldTitle"))}
              <input
                type="text"
                placeholder={t("admin.courses.fieldTitlePlaceholder")}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className={inputClass}
                style={inputStyle}
                required
              />

              {fieldLabel(theme, t("admin.courses.fieldDescription"))}
              <textarea
                placeholder={t("admin.courses.fieldDescriptionPlaceholder")}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className={`${inputClass} min-h-[120px] resize-y`}
                style={inputStyle}
              />
            </div>

            <div className="flex flex-col gap-5">
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: theme.border, backgroundColor: theme.bg }}
              >
                {fieldLabel(theme, t("admin.courses.fieldGradeMax"))}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-3xl font-semibold tabular-nums" style={{ color: theme.accent }}>
                    {createGradeMax}
                  </span>
                  <span className="text-xs" style={{ color: theme.text3 }}>
                    {tp("admin.courses.gradeMaxLabel", { n: createGradeMax })}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={createGradeMax}
                  onChange={(e) => setCreateGradeMax(Number(e.target.value))}
                  className="mt-3 w-full"
                  style={{ accentColor: theme.accent }}
                  required
                />
                <div className="mt-2 flex justify-between text-[10px] tabular-nums" style={{ color: theme.text3 }}>
                  <span>0</span>
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                  <span>40</span>
                  <span>50</span>
                </div>
              </div>

              {availableGroups.length > 0 ? (
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Users className="h-4 w-4" style={{ color: theme.accent }} />
                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                      {t("admin.courses.availableGroups")}
                    </span>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed" style={{ color: theme.text3 }}>
                    {t("admin.courses.groupsHint")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableGroups.map((group) => {
                      const selected = selectedGroups.includes(group);
                      return (
                        <label
                          key={group}
                          className="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition"
                          style={{
                            borderColor: selected ? theme.accent : theme.border,
                            backgroundColor: selected ? `${theme.accent}18` : theme.bg3,
                            color: selected ? theme.accent : theme.text2,
                          }}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
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
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs" style={{ color: theme.text2 }}>
                    {tp("admin.courses.selectedGroups", {
                      n: selectedGroups.length,
                      word: pluralWord(language, "admin.courses.group", selectedGroups.length),
                    })}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {createError ? (
            <div
              className="mx-6 mb-4 rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: `${theme.danger}60`, backgroundColor: `${theme.danger}15`, color: theme.danger }}
            >
              {createError}
            </div>
          ) : null}

          <div
            className="flex flex-wrap gap-3 border-t px-6 py-4"
            style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
          >
            <button
              type="submit"
              disabled={createLoading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 sm:flex-none sm:min-w-[200px]"
              style={{ backgroundColor: theme.accent, color: "#fff" }}
            >
              <Plus className="h-4 w-4" />
              {createLoading ? t("admin.courses.creating") : t("admin.courses.createCourse")}
            </button>
            <button
              type="button"
              onClick={resetCreateForm}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition"
              style={{ borderColor: theme.border, color: theme.text2 }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <div className="text-sm" style={{ color: theme.text2 }}>{t("common.loading")}</div> : null}
      {error ? (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: `${theme.danger}60`, backgroundColor: `${theme.danger}15`, color: theme.danger }}
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && searchQuery && filteredCourses.length === 0 ? (
        <p className="mb-4 text-sm" style={{ color: theme.text2 }}>
          {tp("admin.courses.nothingFound", { q: searchParams.get("q") ?? "" })}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCourses.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div className="flex items-start justify-between gap-3">
              <Link to={`/courses/${c.id}`} className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-snug" style={{ color: theme.text }}>
                  {c.title}
                </div>
                {c.description ? (
                  <div className="mt-2 line-clamp-3 text-sm leading-relaxed" style={{ color: theme.text2 }}>
                    {c.description}
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div
                    className="rounded-lg px-3 py-2 text-xs font-medium"
                    style={{ backgroundColor: theme.bg4, color: theme.text2 }}
                  >
                    {tp("admin.courses.studentsCount", { n: c.enrolled_count ?? 0 })}
                  </div>
                  <div
                    className="rounded-lg px-3 py-2 text-xs font-medium"
                    style={{ backgroundColor: `${theme.accent}18`, color: theme.accent }}
                  >
                    {tp("admin.courses.maxGrade", { n: c.grade_max })}
                  </div>
                </div>
              </Link>

              {canCreateCourse ? (
                <button
                  type="button"
                  title={t("admin.courses.deleteCourseTitle")}
                  onClick={() => onDeleteCourse(c.id)}
                  disabled={deletingCourseId === c.id}
                  className="rounded-lg border px-2 py-1 text-sm transition disabled:opacity-60"
                  style={{ borderColor: `${theme.danger}50`, color: theme.danger }}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!loading && !error && courses.length === 0 ? (
        <div className="mt-8 text-center text-sm" style={{ color: theme.text2 }}>
          {t("admin.courses.emptyList")}
        </div>
      ) : null}
    </div>
  );
}
