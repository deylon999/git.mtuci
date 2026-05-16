import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileCode, Globe, Loader2, Lock, Scale } from "lucide-react";
import { getMe } from "../api/authApi";
import {
  createRepository,
  getRepositoryCreateTemplates,
  type RepositoryCreateTemplates,
  type RepositoryVisibility,
} from "../api/repositoriesApi";
import { StudentPageShell } from "../components/student/studentPageUi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface StudentCreateRepoPageProps {
  isDarkTheme?: boolean;
}

export default function StudentCreateRepoPage({ isDarkTheme = false }: StudentCreateRepoPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t } = useUserPreferences();
  const navigate = useNavigate();
  const [giteaUser, setGiteaUser] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<RepositoryVisibility>("public");
  const [addReadme, setAddReadme] = useState(true);
  const [gitignore, setGitignore] = useState("");
  const [license, setLicense] = useState("");
  const [templates, setTemplates] = useState<RepositoryCreateTemplates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdClone, setCreatedClone] = useState<string | null>(null);

  useEffect(() => {
    void getMe().then((u) => {
      const login = (u.email?.split("@")[0] ?? u.full_name ?? "user")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");
      setGiteaUser(login);
    });
    void getRepositoryCreateTemplates()
      .then(setTemplates)
      .catch(() =>
        setTemplates({
          gitignores: [{ id: "", label: t("student.repos.createPage.noGitignore") }],
          licenses: [{ id: "", label: t("student.repos.createPage.noLicense") }],
        }),
      );
  }, []);

  const pathPreview = useMemo(() => {
    const n = name.trim() || "my-repo";
    return giteaUser ? `${giteaUser}/${n}` : n;
  }, [giteaUser, name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("student.errors.nameRequired"));
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      setError(t("student.errors.nameInvalid"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const repo = await createRepository({
        name: trimmed,
        description: description.trim() || undefined,
        visibility,
        add_readme: addReadme,
        gitignore_template: gitignore || null,
        license_template: license || null,
      });
      const clone = repo.clone_url ? `git clone ${repo.clone_url}` : null;
      setCreatedClone(clone);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("student.errors.createRepo"));
    } finally {
      setLoading(false);
    }
  };

  if (createdClone) {
    return (
      <StudentPageShell className="max-w-3xl mx-auto py-4">
        <h1 className="text-lg font-semibold" style={{ color: theme.text }}>
          {t("student.repos.createPage.created")}
        </h1>
        <p className="text-sm" style={{ color: theme.text2 }}>
          {t("student.repos.createPage.cloneHint")}
        </p>
        <code
          className="block rounded-lg border px-3 py-2 text-xs font-mono break-all"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }}
        >
          {createdClone}
        </code>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(createdClone)}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("common.copy")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/repositories")}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {t("student.repos.createPage.backToList")}
          </button>
        </div>
      </StudentPageShell>
    );
  }

  return (
    <StudentPageShell className="max-w-3xl mx-auto">
      <header>
        <h1 className="text-xl font-bold" style={{ color: theme.text }}>
          {t("student.repos.createPage.title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
          {t("student.repos.createPage.giteaPath")}{" "}
          <span className="font-mono" style={{ color: theme.accent2 }}>
            {pathPreview}
          </span>
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border p-5 flex flex-col gap-4"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
          {t("student.repos.createPage.nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="lab-01"
            className="rounded-lg border px-3 py-2 text-sm font-mono"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
          {t("common.description")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-lg border px-3 py-2 text-sm resize-none"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs" style={{ color: theme.text2 }}>
            {t("student.repos.createPage.visibility")}
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "public" as const, label: t("student.repos.visibilityPublic"), icon: Globe },
                { id: "private" as const, label: t("student.repos.visibilityPrivate"), icon: Lock },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVisibility(opt.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: visibility === opt.id ? theme.accent : theme.border,
                  backgroundColor: visibility === opt.id ? `${theme.accent}18` : theme.bg,
                  color: visibility === opt.id ? theme.accent2 : theme.text2,
                }}
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.text2 }}>
          <input type="checkbox" checked={addReadme} onChange={(e) => setAddReadme(e.target.checked)} />
          <BookOpen className="h-3.5 w-3.5" />
          {t("student.repos.createPage.addReadme")}
        </label>

        {templates ? (
          <>
            <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
              <span className="inline-flex items-center gap-1">
                <FileCode className="h-3.5 w-3.5" />
                .gitignore
              </span>
              <select
                value={gitignore}
                onChange={(e) => setGitignore(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              >
                {templates.gitignores.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: theme.text2 }}>
              <span className="inline-flex items-center gap-1">
                <Scale className="h-3.5 w-3.5" />
                {t("student.repos.createPage.license")}
              </span>
              <select
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }}
              >
                {templates.licenses.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {error ? (
          <p className="text-xs" style={{ color: theme.danger }}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate("/repositories")}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: theme.border, color: theme.text2 }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: theme.success }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("student.repos.create")}
          </button>
        </div>
      </form>
    </StudentPageShell>
  );
}
