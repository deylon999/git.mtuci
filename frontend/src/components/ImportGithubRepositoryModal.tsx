import { useState } from "react";
import { Github, Loader2, Lock, Globe, X } from "lucide-react";
import { importGithubRepository, type RepositoryVisibility } from "../api/repositoriesApi";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface ImportGithubRepositoryModalProps {
  isOpen: boolean;
  isDarkTheme?: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportGithubRepositoryModal({
  isOpen,
  isDarkTheme = false,
  onClose,
  onImported,
}: ImportGithubRepositoryModalProps) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [githubUrl, setGithubUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<RepositoryVisibility>("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setGithubUrl("");
    setName("");
    setDescription("");
    setVisibility("public");
    setError(null);
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) {
      setError(t("student.repos.importDialog.urlRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await importGithubRepository({
        github_url: githubUrl.trim(),
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        visibility,
      });
      resetForm();
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("student.errors.importRepo"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={handleClose}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl border shadow-2xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: theme.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              {t("student.repos.importDialog.title")}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
              {t("student.repos.importDialog.subtitle")}
            </p>
          </div>
          <button type="button" onClick={handleClose} disabled={loading} className="rounded-md p-1" style={{ color: theme.text2 }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: theme.text }}>
              {t("student.repos.importDialog.urlLabel")} <span style={{ color: theme.danger }}>*</span>
            </span>
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ backgroundColor: theme.bg2, borderColor: theme.border }}
            >
              <Github className="h-4 w-4 shrink-0" style={{ color: theme.text2 }} />
              <input
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: theme.text }}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: theme.text }}>
              {t("student.repos.importDialog.nameLabel")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("student.repos.importDialog.namePlaceholder")}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: theme.text }}>
              {t("student.repos.importDialog.descriptionLabel")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }}
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium" style={{ color: theme.text }}>
              {t("student.repos.importDialog.visibilityLabel")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className="rounded-lg border p-3 text-left"
                style={{
                  borderColor: visibility === "public" ? theme.accent : theme.border,
                  backgroundColor: visibility === "public" ? `${theme.accent}14` : theme.bg2,
                }}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text }}>
                  <Globe className="h-4 w-4" />
                  {t("student.repos.importDialog.public")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className="rounded-lg border p-3 text-left"
                style={{
                  borderColor: visibility === "private" ? theme.accent : theme.border,
                  backgroundColor: visibility === "private" ? `${theme.accent}14` : theme.bg2,
                }}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text }}>
                  <Lock className="h-4 w-4" />
                  {t("student.repos.importDialog.private")}
                </span>
              </button>
            </div>
          </fieldset>

          {error ? (
            <p className="text-xs" style={{ color: theme.danger }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t px-5 py-4" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: theme.accent }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? t("student.repos.importDialog.importing") : t("student.repos.importDialog.import")}
          </button>
        </div>
      </form>
    </div>
  );
}

