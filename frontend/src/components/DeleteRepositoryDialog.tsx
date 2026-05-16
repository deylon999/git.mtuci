import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface DeleteRepositoryDialogProps {
  isOpen: boolean;
  isDarkTheme?: boolean;
  repoName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteRepositoryDialog({
  isOpen,
  isDarkTheme = false,
  repoName,
  loading = false,
  onClose,
  onConfirm,
}: DeleteRepositoryDialogProps) {
  const { t, tp } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (isOpen) setConfirmName("");
  }, [isOpen]);

  if (!isOpen) return null;

  const canDelete = confirmName === repoName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: theme.border }}
        >
          <h2 className="text-sm font-semibold" style={{ color: theme.danger }}>
            {t("repo.delete.title")}
          </h2>
          <button type="button" onClick={onClose} disabled={loading} style={{ color: theme.text2 }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm" style={{ color: theme.text2 }}>
            {tp("repo.delete.message", { name: repoName })}
          </p>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={repoName}
            className="rounded-lg border px-3 py-2 text-sm font-mono"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
          />
        </div>
        <div
          className="flex justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: theme.border }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("repo.delete.cancel")}
          </button>
          <button
            type="button"
            disabled={!canDelete || loading}
            onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: theme.danger }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("repo.delete.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
