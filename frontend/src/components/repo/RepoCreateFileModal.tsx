import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";

interface RepoCreateFileModalProps {
  theme: ThemeColors;
  open: boolean;
  defaultPath: string;
  branch: string;
  onClose: () => void;
  onSubmit: (payload: { path: string; content: string; message: string }) => Promise<void>;
}

export default function RepoCreateFileModal({
  theme,
  open,
  defaultPath,
  branch,
  onClose,
  onSubmit,
}: RepoCreateFileModalProps) {
  const { t, tp } = useUserPreferences();
  const [path, setPath] = useState(defaultPath);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState(t("repo.createFile.defaultMessage"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPath(defaultPath);
      setContent("");
      setMessage(t("repo.createFile.defaultMessage"));
      setError(null);
    }
  }, [open, defaultPath]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = path.trim().replace(/^\/+/, "");
    if (!cleaned) {
      setError(t("repo.errors.filePathRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ path: cleaned, content, message: message.trim() || tp("repo.createFile.fallbackMessage", { path: cleaned }) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("repo.errors.createFileFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <form
        className="w-full max-w-lg rounded-xl border shadow-xl flex flex-col max-h-[90vh]"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
            {t("repo.createFile.title")}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:opacity-80" aria-label={t("common.close")}>
            <X className="h-4 w-4" style={{ color: theme.text2 }} />
          </button>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
            {t("repo.createFile.branch")}
            <span className="font-mono text-sm px-2 py-1.5 rounded border" style={{ borderColor: theme.border, color: theme.text }}>
              {branch}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
            {t("repo.createFile.pathLabel")}
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t("repo.createFile.pathPlaceholder")}
              className="rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-1"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.inputBg,
                color: theme.text,
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
            {t("repo.createFile.commitMessage")}
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs flex-1 min-h-[120px]" style={{ color: theme.text2 }}>
            {t("repo.createFile.content")}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="rounded-lg border px-3 py-2 text-sm font-mono resize-y min-h-[140px] outline-none flex-1"
              style={{ borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }}
            />
          </label>
          {error ? (
            <p className="text-xs" style={{ color: theme.danger }}>
              {error}
            </p>
          ) : null}
        </div>
        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: theme.border }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            style={{ backgroundColor: theme.accent, color: "#fff" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("repo.createFile.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
