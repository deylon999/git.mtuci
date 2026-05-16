import { useEffect, useState } from "react";
import { BookOpen, FileCode, Globe, Loader2, Lock, Scale, X } from "lucide-react";
import {
  createRepository,
  getRepositoryCreateTemplates,
  type RepositoryCreateTemplates,
  type RepositoryVisibility,
} from "../api/repositoriesApi";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface CreateRepositoryModalProps {
  isOpen: boolean;
  isDarkTheme?: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRepositoryModal({
  isOpen,
  isDarkTheme = false,
  onClose,
  onCreated,
}: CreateRepositoryModalProps) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<RepositoryVisibility>("public");
  const [addReadme, setAddReadme] = useState(true);
  const [gitignore, setGitignore] = useState("");
  const [license, setLicense] = useState("");
  const [templates, setTemplates] = useState<RepositoryCreateTemplates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getRepositoryCreateTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates({
            gitignores: [{ id: "", label: t("repo.create.noGitignore") }],
            licenses: [{ id: "", label: t("repo.create.noLicense") }],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName("");
    setDescription("");
    setVisibility("public");
    setAddReadme(true);
    setGitignore("");
    setLicense("");
    setError(null);
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

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
      await createRepository({
        name: trimmed,
        description: description.trim() || undefined,
        visibility,
        add_readme: addReadme,
        gitignore_template: gitignore || null,
        license_template: license || null,
      });
      resetForm();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("repo.errors.createFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={handleClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: theme.border }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              {t("repo.create.title")}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: theme.text2 }}>
              {t("repo.create.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="rounded-md p-1"
            style={{ color: theme.text2 }}
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.create.nameLabel")} <span style={{ color: theme.danger }}>*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-lab-work"
              autoFocus
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
              style={{
                backgroundColor: theme.bg2,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.create.description")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("repo.create.descriptionPlaceholder")}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: theme.bg2,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.create.visibilityLegend")} <span style={{ color: theme.danger }}>*</span>
            </legend>
            <p className="mb-3 text-xs" style={{ color: theme.text2 }}>
              {t("repo.create.visibilityHint")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <VisibilityCard
                selected={visibility === "public"}
                onSelect={() => setVisibility("public")}
                icon={<Globe className="h-4 w-4" />}
                title={t("repo.create.publicTitle")}
                hint={t("repo.create.publicHint")}
                theme={theme}
              />
              <VisibilityCard
                selected={visibility === "private"}
                onSelect={() => setVisibility("private")}
                icon={<Lock className="h-4 w-4" />}
                title={t("repo.create.privateTitle")}
                hint={t("repo.create.privateHint")}
                theme={theme}
              />
            </div>
          </fieldset>

          <div
            className="rounded-lg border p-4 space-y-4"
            style={{ borderColor: theme.border, backgroundColor: theme.bg2 }}
          >
            <p className="text-sm font-medium" style={{ color: theme.text }}>
              {t("repo.create.initialConfig")}
            </p>

            <label className="flex cursor-pointer gap-3">
              <input
                type="checkbox"
                checked={addReadme}
                onChange={(e) => setAddReadme(e.target.checked)}
                className="mt-1 h-4 w-4 rounded"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text }}>
                  <BookOpen className="h-4 w-4" style={{ color: theme.text2 }} />
                  {t("repo.create.addReadme")}
                </span>
                <span className="mt-0.5 block text-xs" style={{ color: theme.text2 }}>
                  {t("repo.create.readmeHint")}
                </span>
              </span>
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text }}>
                <FileCode className="h-4 w-4" style={{ color: theme.text2 }} />
                {t("repo.create.addGitignore")}
              </span>
              <span className="mb-2 block text-xs" style={{ color: theme.text2 }}>
                {t("repo.create.gitignoreHint")}
              </span>
              <select
                value={gitignore}
                onChange={(e) => setGitignore(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: theme.bg3,
                  borderColor: theme.border,
                  color: theme.text,
                }}
              >
                {(templates?.gitignores ?? [{ id: "", label: t("repo.create.loadingTemplates") }]).map((opt) => (
                  <option key={opt.id || "none"} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium" style={{ color: theme.text }}>
                <Scale className="h-4 w-4" style={{ color: theme.text2 }} />
                {t("repo.create.addLicense")}
              </span>
              <span className="mb-2 block text-xs" style={{ color: theme.text2 }}>
                {t("repo.create.licenseHint")}
              </span>
              <select
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: theme.bg3,
                  borderColor: theme.border,
                  color: theme.text,
                }}
              >
                {(templates?.licenses ?? [{ id: "", label: t("repo.create.loadingTemplates") }]).map((opt) => (
                  <option key={opt.id || "none"} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="text-xs" style={{ color: theme.danger }}>
              {error}
            </p>
          ) : null}
        </div>

        <div
          className="flex gap-2 border-t px-5 py-4"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
        >
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
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: theme.accent }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? t("repo.create.submitting") : t("repo.create.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function VisibilityCard({
  selected,
  onSelect,
  icon,
  title,
  hint,
  theme,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-lg border p-3 text-left transition-colors"
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? `${theme.accent}14` : theme.bg3,
        boxShadow: selected ? `0 0 0 1px ${theme.accent}` : undefined,
      }}
    >
      <span className="flex items-center gap-2 text-sm font-medium" style={{ color: theme.text }}>
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs" style={{ color: theme.text2 }}>
        {hint}
      </span>
    </button>
  );
}
