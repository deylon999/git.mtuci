import { useCallback, useEffect, useState } from "react";
import { Loader2, UserMinus, Users } from "lucide-react";
import {
  enrollGroupToCourse,
  exportCourseGradesCsv,
  getCourseStudents,
  getGroups,
  unenrollStudent,
  type CourseStudent,
} from "../api/coursesApi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface CourseRosterPanelProps {
  courseId: string;
  isDarkTheme?: boolean;
}

export default function CourseRosterPanel({ courseId, isDarkTheme = false }: CourseRosterPanelProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, groupRows] = await Promise.all([getCourseStudents(courseId), getGroups()]);
      setStudents(rows);
      setGroups(groupRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("repo.roster.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onEnrollGroup() {
    const name = groupName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const result = await enrollGroupToCourse(courseId, name);
      setGroupName("");
      await load();
      alert(tp("repo.roster.enrollResult", { enrolled: result.enrolled, skipped: result.skipped }));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("repo.roster.enrollError"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(studentId: string, name: string) {
    if (!confirm(tp("repo.roster.confirmRemove", { name }))) return;
    setBusy(true);
    try {
      await unenrollStudent(courseId, studentId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("repo.roster.removeError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-6 rounded-xl border p-4"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: theme.accent2 }} />
          <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
            {tp("repo.roster.studentsCount", { n: students.length })}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void exportCourseGradesCsv(courseId)}
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: theme.border, color: theme.text }}
        >
          {t("repo.roster.exportCsv")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs" style={{ color: theme.text2 }}>
            {t("repo.roster.enrollGroup")}
          </label>
          <select
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
          >
            <option value="">{t("repo.roster.selectGroup")}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={busy || !groupName}
          onClick={() => void onEnrollGroup()}
          className="rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50"
          style={{ backgroundColor: theme.accent }}
        >
          {t("repo.roster.enrollGroup")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("repo.roster.loading")}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : students.length === 0 ? (
        <p className="text-sm" style={{ color: theme.text2 }}>
          {t("repo.roster.emptyHint")}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: theme.text2 }}>
                <th className="py-2 text-left">{t("repo.roster.colFullName")}</th>
                <th className="py-2 text-left">{t("repo.roster.colGroup")}</th>
                <th className="py-2 text-left">Email</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-t" style={{ borderColor: theme.border }}>
                  <td className="py-2" style={{ color: theme.text }}>
                    {s.full_name}
                  </td>
                  <td className="py-2" style={{ color: theme.text2 }}>
                    {s.group_name || "—"}
                  </td>
                  <td className="py-2" style={{ color: theme.text2 }}>
                    {s.email}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRemove(s.student_id, s.full_name)}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                      style={{ borderColor: theme.border, color: theme.danger }}
                    >
                      <UserMinus className="h-3 w-3" />
                      {t("repo.roster.exclude")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

