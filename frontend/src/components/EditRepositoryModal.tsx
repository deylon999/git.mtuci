import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { updateRepository } from "../api/repositoriesApi";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface EditRepositoryModalProps {
  isOpen: boolean;
  isDarkTheme?: boolean;
  repositoryId: string;
  initialName: string;
  initialDescription: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditRepositoryModal({
  isOpen,
  isDarkTheme = false,
  repositoryId,
  initialName,
  initialDescription,
  onClose,
  onSaved,
}: EditRepositoryModalProps) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setDescription(initialDescription ?? "");
    setError(null);
  }, [isOpen, initialName, initialDescription]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("repo.errors.nameRequired"));
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      setError(t("repo.errors.nameInvalid"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updateRepository(repositoryId, {
        name: trimmed,
        description: description.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("repo.errors.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={() => !loading && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: theme.border }}
        >
          <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
            {t("repo.edit.title")}
          </h2>
          <button type="button" onClick={onClose} disabled={loading} style={{ color: theme.text2 }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
            {t("repo.edit.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
            {t("repo.create.description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
            />
          </label>
          {error ? (
            <p className="text-xs" style={{ color: theme.danger }}>
              {error}
            </p>
          ) : null}
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
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: theme.accent }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {loading ? t("repo.edit.submitting") : t("repo.edit.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
