import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Copy,
  GitBranch,
  Globe,
  Key,
  Lock,
  Settings,
  Shield,
  Users,
  Webhook,
} from "lucide-react";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import { deleteRepository, updateRepository } from "../../api/repositoriesApi";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { pluralWord } from "../../i18n/plural";
import type { StudentRepoMeta } from "../../hooks/useStudentRepoWorkspace";
import type { ThemeColors } from "../../theme";
import { useRepoApi } from "../../context/RepoApiContext";
import { useStudentRepoWorkspaceContext } from "../../context/StudentRepoWorkspaceContext";
import { setCachedRepoWorkspace } from "../../utils/repoWorkspaceCache";
import { getStudentRepositories } from "../../api/studentDashboardApi";

const SETTINGS_SECTIONS = [
  { id: "general", labelKey: "repo.settings.sectionGeneral", icon: Settings },
  { id: "access", labelKey: "repo.settings.sectionAccess", icon: Users },
  { id: "branches", labelKey: "repo.settings.sectionBranches", icon: GitBranch },
  { id: "webhooks", labelKey: "repo.settings.sectionWebhooks", icon: Webhook },
  { id: "keys", labelKey: "repo.settings.sectionDeployKeys", icon: Key },
  { id: "security", labelKey: "repo.settings.sectionSecurity", icon: Shield },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

interface RepoSettingsPanelProps {
  theme: ThemeColors;
  meta: StudentRepoMeta | null;
  summary: StudentRepoSummary | null;
}

function PlaceholderBlock({
  theme,
  title,
  children,
}: {
  theme: ThemeColors;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: theme.border, backgroundColor: theme.bg }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: theme.text3 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export default function RepoSettingsPanel({ theme, meta, summary }: RepoSettingsPanelProps) {
  const { t, tp } = useUserPreferences();
  const api = useRepoApi();
  const navigate = useNavigate();
  const workspace = useStudentRepoWorkspaceContext();
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [copied, setCopied] = useState(false);
  const cloneUrl = meta?.cloneUrl ?? "";
  const isBlocked = !!summary?.is_blocked;
  const readOnly = api.mode === "teacher" || isBlocked;

  const repoId = workspace.repoId;

  const [name, setName] = useState(meta?.name ?? "");
  const [description, setDescription] = useState(summary?.description ?? meta?.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    meta?.visibility === "private" ? "private" : "public",
  );
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dangerText, setDangerText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(
    () => ({
      name: meta?.name ?? "",
      description: summary?.description ?? meta?.description ?? "",
      visibility: meta?.visibility === "private" ? ("private" as const) : ("public" as const),
    }),
    [meta?.name, meta?.description, meta?.visibility, summary?.description],
  );

  const dirtyGeneral =
    name.trim() !== initial.name.trim() || (description ?? "") !== (initial.description ?? "");
  const dirtyVisibility = visibility !== initial.visibility;

  useEffect(() => {
    // Keep form in sync if workspace meta/summary refreshes.
    setName(initial.name);
    setDescription(initial.description);
    setVisibility(initial.visibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.name, initial.description, initial.visibility]);

  const syncMetaFromList = async () => {
    if (api.mode !== "student") return;
    try {
      const list = await getStudentRepositories("lite");
      const repo = list.repositories.find((r) => r.id === repoId);
      if (!repo || !workspace.meta) return;
      const nextMeta: StudentRepoMeta = {
        ...workspace.meta,
        name: repo.name,
        giteaPath: repo.gitea_path,
        giteaWebUrl: repo.gitea_web_url,
        cloneUrl: repo.clone_url,
        description: repo.description,
        language: repo.language,
        visibility: repo.visibility,
        source: repo.source,
        courseId: repo.course_id ?? null,
        assignmentId: repo.assignment_id ?? null,
        assignmentLabel: repo.assignment_label ?? null,
      };
      workspace.setMeta(nextMeta);
      setCachedRepoWorkspace(repoId, { meta: nextMeta, summary: workspace.summary });
    } catch {
      // ignore
    }
  };

  const refreshSummary = async () => {
    try {
      const next = await api.getSummary(repoId);
      workspace.setSummary(next);
      if (workspace.meta) {
        setCachedRepoWorkspace(repoId, { meta: workspace.meta, summary: next });
      }
    } catch {
      // ignore
    }
  };

  const copyClone = async () => {
    if (!cloneUrl) return;
    try {
      await navigator.clipboard.writeText(cloneUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const branchCount = summary?.branches_count ?? 1;
  const branchWord = pluralWord(branchCount, {
    one: t("repo.sidebar.branchOne"),
    few: t("repo.sidebar.branchMany"),
    many: t("repo.sidebar.branchMany"),
  });
  const defaultBranch = summary?.default_branch ?? "main";
  const ownerName = meta?.giteaPath?.split("/")[0] ?? "—";
  const visibilityValue =
    meta?.visibility === "public" ? t("repo.settings.yes") : t("repo.settings.no");

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col md:flex-row min-h-[420px]"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      <nav
        className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r p-2"
        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
      >
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.text3 }}>
          {t("repo.settings.panelTitle")}
        </p>
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors"
              style={{
                backgroundColor: active ? `${theme.accent}18` : "transparent",
                color: active ? theme.accent2 : theme.text2,
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(s.labelKey)}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 p-4 md:p-5 space-y-4">
        {error ? (
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: theme.danger, backgroundColor: `${theme.danger}14`, color: theme.text }}
          >
            {error}
          </div>
        ) : null}
        {section === "general" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              {t("repo.settings.generalTitle")}
            </h2>
            <PlaceholderBlock theme={theme} title={t("repo.settings.labelRepoName")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly || savingGeneral || savingVisibility || deleting}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
              <p className="text-[11px] mt-1" style={{ color: theme.text3 }}>
                {readOnly ? "Read-only" : "Renames repository (also in Gitea when available)."}
              </p>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title={t("repo.settings.labelDescription")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly || savingGeneral || savingVisibility || deleting}
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
            </PlaceholderBlock>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={readOnly || savingGeneral || savingVisibility || deleting || !repoId || !dirtyGeneral}
                onClick={() => {
                  void (async () => {
                    if (!repoId) return;
                    setSavingGeneral(true);
                    setError(null);
                    try {
                      await updateRepository(repoId, { name: name.trim(), description });
                      toast.success("Saved");
                      // First update local meta quickly for UI responsiveness.
                      if (workspace.meta) {
                        const nextMeta: StudentRepoMeta = {
                          ...workspace.meta,
                          name: name.trim(),
                          description,
                        };
                        workspace.setMeta(nextMeta);
                        setCachedRepoWorkspace(repoId, { meta: nextMeta, summary: workspace.summary });
                      }
                      // Then refresh summary and pull the authoritative meta (clone url/path) from list.
                      await refreshSummary();
                      await syncMetaFromList();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to save settings");
                      toast.error("Save failed");
                    } finally {
                      setSavingGeneral(false);
                    }
                  })();
                }}
                className="rounded-lg border px-3 py-2 text-xs font-medium"
                style={{
                  borderColor: `${theme.success}55`,
                  backgroundColor: `${theme.success}14`,
                  color: theme.success,
                  opacity: readOnly || savingGeneral || savingVisibility || deleting || !dirtyGeneral ? 0.55 : 1,
                }}
                title={!dirtyGeneral ? "No changes" : undefined}
              >
                {savingGeneral ? "Saving…" : "Save changes"}
              </button>
            </div>

            {cloneUrl ? (
              <PlaceholderBlock theme={theme} title={t("repo.settings.labelClone")}>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 text-xs font-mono truncate" style={{ color: theme.accent2 }}>
                    {cloneUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyClone()}
                    className="shrink-0 rounded-lg border p-2"
                    style={{ borderColor: theme.border, color: theme.text2 }}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {copied ? (
                  <p className="text-[11px] mt-1" style={{ color: theme.success }}>
                    {t("repo.settings.copied")}
                  </p>
                ) : null}
              </PlaceholderBlock>
            ) : null}
          </>
        )}

        {section === "access" && (
          <>
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Users className="h-4 w-4" />
              Access
            </h2>

            <PlaceholderBlock theme={theme} title="Visibility">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={readOnly || savingGeneral || savingVisibility || deleting}
                  onClick={() => setVisibility("public")}
                  className="rounded-lg border px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: visibility === "public" ? `${theme.accent}18` : theme.bg,
                    color: visibility === "public" ? theme.accent2 : theme.text2,
                    opacity: readOnly ? 0.55 : 1,
                  }}
                >
                  <Globe className="h-3.5 w-3.5" />
                  {t("student.repos.visibilityPublic")}
                </button>
                <button
                  type="button"
                  disabled={readOnly || savingGeneral || savingVisibility || deleting}
                  onClick={() => setVisibility("private")}
                  className="rounded-lg border px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: visibility === "private" ? `${theme.accent}18` : theme.bg,
                    color: visibility === "private" ? theme.accent2 : theme.text2,
                    opacity: readOnly ? 0.55 : 1,
                  }}
                >
                  <Lock className="h-3.5 w-3.5" />
                  {t("student.repos.visibilityPrivate")}
                </button>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  disabled={readOnly || savingGeneral || savingVisibility || deleting || !repoId || !dirtyVisibility}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      setSavingVisibility(true);
                      setError(null);
                      try {
                        await updateRepository(repoId, { repo_type: visibility });
                        toast.success("Visibility updated");
                        if (workspace.meta) {
                          const nextMeta: StudentRepoMeta = {
                            ...workspace.meta,
                            visibility,
                          };
                          workspace.setMeta(nextMeta);
                          setCachedRepoWorkspace(repoId, { meta: nextMeta, summary: workspace.summary });
                        }
                        await refreshSummary();
                        await syncMetaFromList();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to update visibility");
                        toast.error("Update failed");
                      } finally {
                        setSavingVisibility(false);
                      }
                    })();
                  }}
                  className="rounded-lg border px-3 py-2 text-xs font-medium"
                  style={{
                    borderColor: `${theme.success}55`,
                    backgroundColor: `${theme.success}14`,
                    color: theme.success,
                    opacity: readOnly || savingGeneral || savingVisibility || deleting || !dirtyVisibility ? 0.55 : 1,
                  }}
                  title={!dirtyVisibility ? "No changes" : undefined}
                >
                  {savingVisibility ? "Updating…" : "Update visibility"}
                </button>
              </div>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title="Owner">
              <p className="text-xs flex items-center gap-1.5" style={{ color: theme.text3 }}>
                <Lock className="h-3.5 w-3.5" />
                {tp("repo.settings.ownerLabel", { name: ownerName })}
              </p>
            </PlaceholderBlock>
          </>
        )}

        {section === "branches" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Branches
            </h2>
            <PlaceholderBlock theme={theme} title="Default branch">
              <p className="text-sm font-mono" style={{ color: theme.accent2 }}>
                {defaultBranch}
              </p>
            </PlaceholderBlock>
            <PlaceholderBlock theme={theme} title="Branch rules">
              <p className="text-sm" style={{ color: theme.text2 }}>
                {tp("repo.settings.branchProtection", { count: branchCount, word: branchWord })}
              </p>
            </PlaceholderBlock>
          </>
        )}

        {section === "webhooks" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Webhooks
            </h2>
            <PlaceholderBlock theme={theme} title="Active hooks">
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("repo.settings.webhookNote")}
              </p>
              <p className="text-xs mt-2 font-mono" style={{ color: theme.text3 }}>
                POST → /webhooks/gitea
              </p>
            </PlaceholderBlock>
          </>
        )}

        {section === "keys" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Deploy keys
            </h2>
            <PlaceholderBlock theme={theme} title="SSH keys">
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("repo.settings.deployKeysNote")}
              </p>
            </PlaceholderBlock>
          </>
        )}

        {section === "security" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Security
            </h2>
            <PlaceholderBlock theme={theme} title="Policies">
              <ul className="text-sm space-y-2" style={{ color: theme.text2 }}>
                <li className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  {tp("repo.settings.publicAccess", { value: visibilityValue })}
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  {t("repo.settings.vulnScanSoon")}
                </li>
              </ul>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title="Danger zone">
              <p className="text-sm" style={{ color: theme.text2 }}>
                Delete repository permanently. Type <span className="font-mono">{meta?.name ?? "repo"}</span> to confirm.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <input
                  value={dangerText}
                  onChange={(e) => setDangerText(e.target.value)}
                  disabled={readOnly || savingGeneral || savingVisibility || deleting}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                  placeholder="Type repo name…"
                />
                <button
                  type="button"
                  disabled={
                    readOnly ||
                    savingGeneral ||
                    savingVisibility ||
                    deleting ||
                    !repoId ||
                    dangerText.trim() !== (meta?.name ?? "")
                  }
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      setDeleting(true);
                      setError(null);
                      try {
                        await deleteRepository(repoId);
                        toast.success("Repository deleted");
                        navigate("/repositories", { replace: true });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to delete repository");
                        toast.error("Delete failed");
                      } finally {
                        setDeleting(false);
                      }
                    })();
                  }}
                  className="rounded-lg border px-3 py-2 text-xs font-medium"
                  style={{
                    borderColor: `${theme.danger}55`,
                    backgroundColor: `${theme.danger}14`,
                    color: theme.danger,
                    opacity:
                      readOnly ||
                      savingGeneral ||
                      savingVisibility ||
                      deleting ||
                      dangerText.trim() !== (meta?.name ?? "")
                        ? 0.55
                        : 1,
                  }}
                >
                  {deleting ? "Deleting…" : "Delete repository"}
                </button>
              </div>
            </PlaceholderBlock>
          </>
        )}
      </div>
    </div>
  );
}
