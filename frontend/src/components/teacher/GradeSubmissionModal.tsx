import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { gradeSubmission } from "../../api/coursesApi";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { getTheme } from "../../theme";

export interface GradeSubmissionTarget {
  courseId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  assignmentTitle: string;
  courseTitle?: string;
  gradeMax: number;
  initialGrade?: number | null;
  initialComment?: string | null;
}

interface Props {
  open: boolean;
  target: GradeSubmissionTarget | null;
  isDarkTheme?: boolean;
  onClose: () => void;
  onGraded?: () => void;
}

export default function GradeSubmissionModal({
  open,
  target,
  isDarkTheme = false,
  onClose,
  onGraded,
}: Props) {
  const theme = getTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [grade, setGrade] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setGrade(target.initialGrade != null ? String(target.initialGrade) : "");
    setComment(target.initialComment ?? "");
    setError(null);
  }, [open, target]);

  if (!open || !target) return null;

  async function handleAccept() {
    const parsed = Number(grade.trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > target!.gradeMax) {
      setError(tp("teacher.gradeModal.gradeRangeError", { max: target!.gradeMax }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await gradeSubmission(target!.courseId, target!.assignmentId, target!.studentId, {
        grade: parsed,
        comment: comment.trim() || null,
      });
      onGraded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("teacher.errors.gradeSaveFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-2xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              {t("teacher.gradeModal.title")}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
              {target.studentName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: theme.text3 }}>
              {target.courseTitle ? `${target.courseTitle} · ` : ""}
              {target.assignmentTitle}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ color: theme.text2 }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-xs mb-1" style={{ color: theme.text2 }}>
          {tp("teacher.gradeModal.scoreLabel", { max: target.gradeMax })}
        </label>
        <input
          type="number"
          min={0}
          max={target.gradeMax}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
        />

        <label className="block text-xs mb-1" style={{ color: theme.text2 }}>
          {t("teacher.gradeModal.commentLabel")}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none resize-y"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
          placeholder={t("teacher.gradeModal.commentPlaceholder")}
        />

        {error ? (
          <p className="text-xs mb-3" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleAccept()}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: theme.success }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("teacher.gradeModal.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
