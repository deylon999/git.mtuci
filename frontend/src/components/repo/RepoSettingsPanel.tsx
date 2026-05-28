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
  Package,
  Upload,
  Sparkles,
} from "lucide-react";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import { deleteRepository, updateRepository } from "../../api/repositoriesApi";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { getPluralForm } from "../../i18n/plural";
import type { StudentRepoMeta } from "../../hooks/useStudentRepoWorkspace";
import type { ThemeColors } from "../../theme";
import { useRepoApi } from "../../context/RepoApiContext";
import { useStudentRepoWorkspaceContext } from "../../context/StudentRepoWorkspaceContext";
import { setCachedRepoWorkspace } from "../../utils/repoWorkspaceCache";
import { getStudentRepositories } from "../../api/studentDashboardApi";
import { RepoAccessPanel } from "./RepoAccessPanel";
import {
  createDeployKey,
  createWebhook,
  deleteDeployKey,
  deleteRepoSecret,
  deleteWebhook,
  listBranchProtection,
  listDeployKeys,
  listRepoSecrets,
  listWebhooks,
  redeliverWebhook,
  testWebhook,
  upsertBranchProtection,
  upsertRepoSecret,
  type BranchProtectionRule,
  type RepoDeployKey,
  type RepoSecret,
  type RepoWebhook,
} from "../../api/repoSettingsApi";
import {
  createRepositoryRegistry,
  createRepositoryRelease,
  listReleasePublishJobs,
  listRepositoryRegistries,
  listRepositoryReleases,
  publishRepositoryRelease,
  retryReleasePublishJob,
  uploadReleaseAsset,
  type ReleasePublishJob,
  type PublishReleaseResult,
  type RegistryIntegration,
  type RepositoryRelease,
} from "../../api/releasesApi";

const SETTINGS_SECTIONS = [
  { id: "general", labelKey: "repo.settings.sectionGeneral", icon: Settings },
  { id: "access", labelKey: "repo.settings.sectionAccess", icon: Users },
  { id: "branches", labelKey: "repo.settings.sectionBranches", icon: GitBranch },
  { id: "webhooks", labelKey: "repo.settings.sectionWebhooks", icon: Webhook },
  { id: "keys", labelKey: "repo.settings.sectionDeployKeys", icon: Key },
  { id: "security", labelKey: "repo.settings.sectionSecurity", icon: Shield },
  { id: "releases", labelKey: "repo.settings.sectionReleases", icon: Package },
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
  const { t, tp, language } = useUserPreferences();
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
  const [branchRule, setBranchRule] = useState<BranchProtectionRule | null>(null);
  const [statusContexts, setStatusContexts] = useState("");
  const [requiredReviewers, setRequiredReviewers] = useState("");
  const [webhooks, setWebhooks] = useState<RepoWebhook[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [deployKeys, setDeployKeys] = useState<RepoDeployKey[]>([]);
  const [deployTitle, setDeployTitle] = useState("");
  const [deployKey, setDeployKey] = useState("");
  const [secrets, setSecrets] = useState<RepoSecret[]>([]);
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [releases, setReleases] = useState<RepositoryRelease[]>([]);
  const [registries, setRegistries] = useState<RegistryIntegration[]>([]);
  const [releaseTag, setReleaseTag] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [releaseBody, setReleaseBody] = useState("");
  const [releaseBranch, setReleaseBranch] = useState("main");
  const [autoChangelog, setAutoChangelog] = useState(true);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [assetBusyId, setAssetBusyId] = useState<string | null>(null);
  const [assetFileByRelease, setAssetFileByRelease] = useState<Record<string, File | null>>({});
  const [assetProgressByRelease, setAssetProgressByRelease] = useState<Record<string, number>>({});
  const [assetFailedByRelease, setAssetFailedByRelease] = useState<Record<string, File | null>>({});
  const [registryType, setRegistryType] = useState<"npm" | "pypi" | "docker">("npm");
  const [registryEndpoint, setRegistryEndpoint] = useState("");
  const [registryNamespace, setRegistryNamespace] = useState("");
  const [registryToken, setRegistryToken] = useState("");
  const [registryBusy, setRegistryBusy] = useState(false);
  const [publishBusyByRelease, setPublishBusyByRelease] = useState<Record<string, boolean>>({});
  const [publishRegistryByRelease, setPublishRegistryByRelease] = useState<Record<string, string>>({});
  const [publishPkgByRelease, setPublishPkgByRelease] = useState<Record<string, string>>({});
  const [publishVersionByRelease, setPublishVersionByRelease] = useState<Record<string, string>>({});
  const [publishDryRunByRelease, setPublishDryRunByRelease] = useState<Record<string, boolean>>({});
  const [publishResultByRelease, setPublishResultByRelease] = useState<Record<string, PublishReleaseResult | null>>({});
  const [publishJobsByRelease, setPublishJobsByRelease] = useState<Record<string, ReleasePublishJob[]>>({});
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

  useEffect(() => {
    if (!repoId || readOnly) return;
    void (async () => {
      try {
        const [bp, wh, dk, sec] = await Promise.all([
          listBranchProtection(repoId),
          listWebhooks(repoId),
          listDeployKeys(repoId),
          listRepoSecrets(repoId),
        ]);
        setBranchRule(bp[0] ?? null);
        setStatusContexts((bp[0]?.status_check_contexts ?? []).join(","));
        setRequiredReviewers((bp[0]?.required_reviewer_logins ?? []).join(","));
        setWebhooks(wh);
        setDeployKeys(dk);
        setSecrets(sec);
      } catch {
        // ignore
      }
    })();
  }, [repoId, readOnly]);

  useEffect(() => {
    if (!repoId) return;
    void (async () => {
      try {
        const [rels, regs] = await Promise.all([
          listRepositoryReleases(repoId),
          listRepositoryRegistries(repoId),
        ]);
        setReleases(rels);
        setRegistries(regs);
      } catch {
        // ignore
      }
    })();
  }, [repoId]);

  useEffect(() => {
    if (!repoId || section !== "releases" || releases.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const pairs = await Promise.all(
          releases.map(async (r) => [r.id, await listReleasePublishJobs(repoId, r.id)] as const),
        );
        if (cancelled) return;
        const next: Record<string, ReleasePublishJob[]> = {};
        for (const [rid, jobs] of pairs) next[rid] = jobs;
        setPublishJobsByRelease(next);
      } catch {
        // ignore
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [repoId, section, releases]);

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
  const branchWord = getPluralForm(language, branchCount) === "one" ? t("repo.sidebar.branchOne") : t("repo.sidebar.branchMany");
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
                {readOnly ? t("repo.settings.readOnly") : t("repo.settings.renameHint")}
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
                      toast.success(t("repo.settings.saved"));
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
                      setError(e instanceof Error ? e.message : t("repo.settings.saveFailed"));
                      toast.error(t("repo.settings.saveFailedToast"));
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
                title={!dirtyGeneral ? t("repo.settings.noChanges") : undefined}
              >
                {savingGeneral ? t("repo.settings.saving") : t("repo.settings.saveChanges")}
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
              {t("repo.settings.sectionAccess")}
            </h2>

            <PlaceholderBlock theme={theme} title={t("repo.settings.labelVisibility")}>
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
                        toast.success(t("repo.settings.visibilityUpdated"));
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
                        setError(e instanceof Error ? e.message : t("repo.settings.visibilityUpdateFailed"));
                        toast.error(t("repo.settings.updateFailed"));
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
                  title={!dirtyVisibility ? t("repo.settings.noChanges") : undefined}
                >
                  {savingVisibility ? t("repo.settings.updating") : t("repo.settings.updateVisibility")}
                </button>
              </div>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title={t("repo.settings.owner")}>
              <p className="text-xs flex items-center gap-1.5" style={{ color: theme.text3 }}>
                <Lock className="h-3.5 w-3.5" />
                {tp("repo.settings.ownerLabel", { name: ownerName })}
              </p>
            </PlaceholderBlock>

            {repoId && meta?.source !== "assignment" ? (
              <RepoAccessPanel theme={theme} repoId={repoId} readOnly={readOnly} />
            ) : (
              <PlaceholderBlock theme={theme} title={t("repo.access.collaboratorsTitle")}>
                <p className="text-sm" style={{ color: theme.text2 }}>
                  {t("repo.settings.collaboratorsHint")}
                </p>
              </PlaceholderBlock>
            )}
          </>
        )}

        {section === "branches" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Branches
            </h2>
            <PlaceholderBlock theme={theme} title={t("repo.settings.labelDefaultBranch")}>
              <p className="text-sm font-mono" style={{ color: theme.accent2 }}>
                {defaultBranch}
              </p>
            </PlaceholderBlock>
            <PlaceholderBlock theme={theme} title={t("repo.settings.branchRules")}>
              <div className="space-y-2">
                <input
                  value={branchRule?.branch_pattern ?? "main"}
                  onChange={(e) => setBranchRule((p) => ({ ...(p ?? { id: "", created_at: "", updated_at: "", branch_pattern: "main", required_approvals: 1, require_status_checks: false, status_check_contexts: [], required_reviewer_logins: [], dismiss_stale_approvals: true, block_on_rejected_reviews: true }), branch_pattern: e.target.value }))}
                  className="w-full rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={branchRule?.required_approvals ?? 1}
                  onChange={(e) => setBranchRule((p) => ({ ...(p ?? { id: "", created_at: "", updated_at: "", branch_pattern: "main", required_approvals: 1, require_status_checks: false, status_check_contexts: [], required_reviewer_logins: [], dismiss_stale_approvals: true, block_on_rejected_reviews: true }), required_approvals: Number(e.target.value || 0) }))}
                  className="w-full rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <label className="text-xs" style={{ color: theme.text2 }}>
                  <input
                    type="checkbox"
                    checked={!!branchRule?.require_status_checks}
                    onChange={(e) => setBranchRule((p) => ({ ...(p ?? { id: "", created_at: "", updated_at: "", branch_pattern: "main", required_approvals: 1, require_status_checks: false, status_check_contexts: [], required_reviewer_logins: [], dismiss_stale_approvals: true, block_on_rejected_reviews: true }), require_status_checks: e.target.checked }))}
                  />{" "}
                  Required checks
                </label>
                <input
                  value={statusContexts}
                  onChange={(e) => setStatusContexts(e.target.value)}
                  placeholder={t("repo.settings.statusChecksPlaceholder")}
                  className="w-full rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <input
                  value={requiredReviewers}
                  onChange={(e) => setRequiredReviewers(e.target.value)}
                  placeholder={t("repo.settings.requiredReviewersPlaceholder")}
                  className="w-full rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <button
                  type="button"
                  disabled={readOnly || !repoId || !branchRule}
                  onClick={() => {
                    void (async () => {
                      if (!repoId || !branchRule) return;
                      try {
                        const next = await upsertBranchProtection(repoId, {
                          branch_pattern: branchRule.branch_pattern,
                          required_approvals: branchRule.required_approvals,
                          require_status_checks: branchRule.require_status_checks,
                          status_check_contexts: statusContexts.split(",").map((s) => s.trim()).filter(Boolean),
                          required_reviewer_logins: requiredReviewers.split(",").map((s) => s.trim()).filter(Boolean),
                          dismiss_stale_approvals: branchRule.dismiss_stale_approvals,
                          block_on_rejected_reviews: branchRule.block_on_rejected_reviews,
                        });
                        setBranchRule(next);
                        setRequiredReviewers((next.required_reviewer_logins ?? []).join(","));
                        toast.success(t("repo.settings.branchProtectionSaved"));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("repo.settings.actionFailed"));
                      }
                    })();
                  }}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                >
                  Save rule
                </button>
              </div>
            </PlaceholderBlock>
          </>
        )}

        {section === "webhooks" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Webhooks
            </h2>
            <PlaceholderBlock theme={theme} title={t("repo.settings.activeHooks")}>
              <div className="space-y-2">
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder={t("repo.settings.webhookUrlPlaceholder")}
                  className="w-full rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                />
                <button
                  type="button"
                  disabled={readOnly || !repoId || !webhookUrl.trim()}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      try {
                        const created = await createWebhook(repoId, { url: webhookUrl.trim(), events: ["push", "pull_request"] });
                        setWebhooks((p) => [created, ...p]);
                        setWebhookUrl("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("repo.settings.actionFailed"));
                      }
                    })();
                  }}
                >
                  Add webhook
                </button>
                {webhooks.map((w) => (
                  <div key={w.id} className="text-xs flex items-center justify-between" style={{ color: theme.text2 }}>
                    <span>{w.url}</span>
                    <span className="space-x-2">
                      <button type="button" onClick={() => void testWebhook(repoId!, w.id).then((x) => setWebhooks((arr) => arr.map((i) => (i.id === x.id ? x : i))))}>{t("repo.settings.test")}</button>
                      <button type="button" onClick={() => void redeliverWebhook(repoId!, w.id).then((x) => setWebhooks((arr) => arr.map((i) => (i.id === x.id ? x : i))))}>{t("repo.settings.redeliver")}</button>
                      <button type="button" onClick={() => void deleteWebhook(repoId!, w.id).then(() => setWebhooks((arr) => arr.filter((i) => i.id !== w.id)))}>{t("repo.settings.delete")}</button>
                    </span>
                  </div>
                ))}
              </div>
            </PlaceholderBlock>
          </>
        )}

        {section === "keys" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Deploy keys
            </h2>
            <PlaceholderBlock theme={theme} title={t("repo.settings.sshKeys")}>
              <div className="space-y-2">
                <input value={deployTitle} onChange={(e) => setDeployTitle(e.target.value)} placeholder={t("repo.settings.deployKeyTitlePlaceholder")} className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <textarea value={deployKey} onChange={(e) => setDeployKey(e.target.value)} placeholder={t("repo.settings.deployKeyValuePlaceholder")} rows={3} className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <button
                  type="button"
                  disabled={readOnly || !repoId || !deployTitle.trim() || !deployKey.trim()}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      try {
                        const created = await createDeployKey(repoId, { title: deployTitle.trim(), public_key: deployKey.trim(), read_only: true });
                        setDeployKeys((p) => [created, ...p]);
                        setDeployTitle("");
                        setDeployKey("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("repo.settings.actionFailed"));
                      }
                    })();
                  }}
                >
                  Add deploy key
                </button>
                {deployKeys.map((k) => (
                  <div key={k.id} className="text-xs flex items-center justify-between" style={{ color: theme.text2 }}>
                    <span>{k.title}</span>
                    <button type="button" onClick={() => void deleteDeployKey(repoId!, k.id).then(() => setDeployKeys((arr) => arr.filter((i) => i.id !== k.id)))}>{t("repo.settings.delete")}</button>
                  </div>
                ))}
              </div>
            </PlaceholderBlock>
          </>
        )}

        {section === "security" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              Security
            </h2>
            <PlaceholderBlock theme={theme} title={t("repo.settings.policies")}>
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
            <PlaceholderBlock theme={theme} title={t("repo.settings.repoSecrets")}>
              <div className="space-y-2">
                <input value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder={t("repo.settings.secretNamePlaceholder")} className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <input value={secretValue} onChange={(e) => setSecretValue(e.target.value)} placeholder={t("repo.settings.secretValuePlaceholder")} className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <button
                  type="button"
                  disabled={readOnly || !repoId || !secretName.trim() || !secretValue.trim()}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      try {
                        const up = await upsertRepoSecret(repoId, { name: secretName.trim(), value: secretValue });
                        setSecrets((arr) => [up, ...arr.filter((x) => x.id !== up.id)]);
                        setSecretValue("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("repo.settings.actionFailed"));
                      }
                    })();
                  }}
                >
                  Save secret
                </button>
                {secrets.map((s) => (
                  <div key={s.id} className="text-xs flex items-center justify-between" style={{ color: theme.text2 }}>
                    <span>{s.name}</span>
                    <button type="button" onClick={() => void deleteRepoSecret(repoId!, s.id).then(() => setSecrets((arr) => arr.filter((i) => i.id !== s.id)))}>{t("repo.settings.delete")}</button>
                  </div>
                ))}
              </div>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title={t("repo.settings.dangerZone")}>
              <p className="text-sm" style={{ color: theme.text2 }}>
                {tp("repo.settings.deleteRepoHint", { name: meta?.name ?? "repo" })}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <input
                  value={dangerText}
                  onChange={(e) => setDangerText(e.target.value)}
                  disabled={readOnly || savingGeneral || savingVisibility || deleting}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                  placeholder={t("repo.settings.typeRepoName")}
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
                        toast.success(t("repo.settings.repoDeleted"));
                        navigate("/repositories", { replace: true });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("repo.settings.deleteRepoFailed"));
                        toast.error(t("repo.settings.deleteFailed"));
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
                  {deleting ? t("repo.settings.deleting") : t("repo.settings.deleteRepository")}
                </button>
              </div>
            </PlaceholderBlock>
          </>
        )}

        {section === "releases" && (
          <>
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Package className="h-4 w-4" />
              Releases / Tags / Packages
            </h2>

            <PlaceholderBlock theme={theme} title={t("repo.settings.createRelease")}>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={releaseTag} onChange={(e) => setReleaseTag(e.target.value)} placeholder={t("repo.settings.releaseTagPlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <input value={releaseName} onChange={(e) => setReleaseName(e.target.value)} placeholder={t("repo.settings.releaseNamePlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <input value={releaseBranch} onChange={(e) => setReleaseBranch(e.target.value)} placeholder={t("repo.settings.defaultBranchPlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <label className="inline-flex items-center gap-2 text-xs" style={{ color: theme.text2 }}>
                  <input type="checkbox" checked={autoChangelog} onChange={(e) => setAutoChangelog(e.target.checked)} />
                  <Sparkles className="h-3 w-3" /> {t("repo.settings.autoChangelog")}
                </label>
              </div>
              <textarea value={releaseBody} onChange={(e) => setReleaseBody(e.target.value)} rows={4} placeholder={t("repo.settings.releaseNotesPlaceholder")} className="mt-2 w-full rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={readOnly || releaseBusy || !repoId || !releaseTag.trim() || !releaseName.trim()}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      setReleaseBusy(true);
                      try {
                        const created = await createRepositoryRelease(repoId, {
                          tag_name: releaseTag.trim(),
                          name: releaseName.trim(),
                          body: releaseBody.trim(),
                          target_commitish: releaseBranch.trim() || "main",
                          auto_generate_changelog: autoChangelog,
                        });
                        setReleases((prev) => [created, ...prev]);
                        setReleaseTag("");
                        setReleaseName("");
                        setReleaseBody("");
                        toast.success(t("repo.settings.releaseCreated"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("repo.settings.releaseCreateFailed"));
                      } finally {
                        setReleaseBusy(false);
                      }
                    })();
                  }}
                  className="rounded border px-3 py-1.5 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                >
                  {releaseBusy ? t("repo.settings.creating") : t("repo.settings.createRelease")}
                </button>
              </div>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title={t("repo.settings.sectionReleases")}>
              <div className="space-y-3">
                {releases.map((r) => (
                  <div key={r.id} className="rounded border p-2" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: theme.text }}>{r.name}</p>
                        <p className="text-[11px] font-mono" style={{ color: theme.text3 }}>{r.tag_name} · {r.target_commitish}</p>
                      </div>
                      <span className="text-[10px]" style={{ color: theme.text3 }}>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs" style={{ color: theme.text2 }}>{r.body || t("repo.settings.noNotes")}</pre>
                    <div className="mt-2 space-y-1">
                      {r.assets.map((a) => (
                        <div key={a.id} className="text-[11px]" style={{ color: theme.text3 }}>
                          {a.filename} ({a.size_bytes} bytes)
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setAssetFileByRelease((prev) => ({ ...prev, [r.id]: f }));
                        }}
                        className="text-xs"
                      />
                      <button
                        type="button"
                        disabled={readOnly || assetBusyId === r.id || !assetFileByRelease[r.id]}
                        onClick={() => {
                          void (async () => {
                            const file = assetFileByRelease[r.id];
                            if (!file || !repoId) return;
                            if (file.size > 50 * 1024 * 1024) {
                              toast.error(t("repo.settings.fileTooLarge"));
                              return;
                            }
                            setAssetBusyId(r.id);
                            try {
                              await uploadReleaseAsset(repoId, r.id, file, {
                                onProgress: (pct) => setAssetProgressByRelease((prev) => ({ ...prev, [r.id]: pct })),
                              });
                              const rels = await listRepositoryReleases(repoId);
                              setReleases(rels);
                              setAssetFileByRelease((prev) => ({ ...prev, [r.id]: null }));
                              setAssetFailedByRelease((prev) => ({ ...prev, [r.id]: null }));
                              setAssetProgressByRelease((prev) => ({ ...prev, [r.id]: 100 }));
                              toast.success(t("repo.settings.assetUploaded"));
                            } catch (e) {
                              setAssetFailedByRelease((prev) => ({ ...prev, [r.id]: file }));
                              toast.error(e instanceof Error ? e.message : t("repo.settings.uploadFailed"));
                            } finally {
                              setAssetBusyId(null);
                            }
                          })();
                        }}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                        style={{ borderColor: theme.border, color: theme.text2 }}
                      >
                        <Upload className="h-3 w-3" />
                        {assetBusyId === r.id ? t("repo.settings.uploading") : t("repo.settings.uploadAsset")}
                      </button>
                      {assetProgressByRelease[r.id] ? (
                        <span className="text-[11px]" style={{ color: theme.text3 }}>
                          {assetProgressByRelease[r.id]}%
                        </span>
                      ) : null}
                      {assetFailedByRelease[r.id] ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          onClick={() => {
                            const failed = assetFailedByRelease[r.id];
                            if (!failed) return;
                            setAssetFileByRelease((prev) => ({ ...prev, [r.id]: failed }));
                            setAssetProgressByRelease((prev) => ({ ...prev, [r.id]: 0 }));
                            toast(t("repo.settings.retryFileRestored"));
                          }}
                        >
                          {t("repo.settings.retryLastFile")}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 rounded border p-2" style={{ borderColor: theme.border }}>
                      <p className="text-xs font-semibold" style={{ color: theme.text2 }}>{t("repo.settings.publish")}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <select
                          value={publishRegistryByRelease[r.id] ?? ""}
                          onChange={(e) => setPublishRegistryByRelease((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                        >
                          <option value="">{t("repo.settings.selectRegistry")}</option>
                          {registries.map((x) => (
                            <option key={x.id} value={x.id}>{x.registry_type} · {x.namespace}</option>
                          ))}
                        </select>
                        <input
                          value={publishPkgByRelease[r.id] ?? ""}
                          onChange={(e) => setPublishPkgByRelease((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder={t("repo.settings.packageNamePlaceholder")}
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                        />
                        <input
                          value={publishVersionByRelease[r.id] ?? r.tag_name.replace(/^v/, "")}
                          onChange={(e) => setPublishVersionByRelease((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder={t("repo.settings.versionPlaceholder")}
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                        />
                        <label className="inline-flex items-center gap-2 text-xs" style={{ color: theme.text2 }}>
                          <input
                            type="checkbox"
                            checked={publishDryRunByRelease[r.id] ?? true}
                            onChange={(e) => setPublishDryRunByRelease((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                          />
                          {t("repo.settings.dryRun")}
                        </label>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={readOnly || publishBusyByRelease[r.id] || !publishRegistryByRelease[r.id] || !(publishPkgByRelease[r.id] ?? "").trim()}
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: theme.border, color: theme.text2 }}
                          onClick={() => {
                            void (async () => {
                              if (!repoId) return;
                              setPublishBusyByRelease((prev) => ({ ...prev, [r.id]: true }));
                              try {
                                const result = await publishRepositoryRelease(repoId, r.id, {
                                  registry_integration_id: publishRegistryByRelease[r.id],
                                  package_name: (publishPkgByRelease[r.id] ?? "").trim(),
                                  version: (publishVersionByRelease[r.id] ?? "").trim() || r.tag_name.replace(/^v/, ""),
                                  dry_run: publishDryRunByRelease[r.id] ?? true,
                                });
                                setPublishResultByRelease((prev) => ({ ...prev, [r.id]: result }));
                                if (result.ok) toast.success(result.dry_run ? t("repo.settings.dryRunPassed") : t("repo.settings.publishQueued"));
                                else toast.error(t("repo.settings.publishValidationFailed"));
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : t("repo.settings.publishFailed"));
                              } finally {
                                setPublishBusyByRelease((prev) => ({ ...prev, [r.id]: false }));
                              }
                            })();
                          }}
                        >
                          {publishBusyByRelease[r.id] ? t("repo.settings.publishing") : t("repo.settings.runPublish")}
                        </button>
                      </div>
                      {publishResultByRelease[r.id] ? (
                        <div className="mt-2 text-[11px]" style={{ color: theme.text3 }}>
                          <div>{t("repo.settings.command")}: <code>{publishResultByRelease[r.id]?.command_preview}</code></div>
                          {publishResultByRelease[r.id]?.job_id ? (
                            <div className="mt-1">
                              {t("repo.settings.job")}: <code>{publishResultByRelease[r.id]?.job_id}</code>
                            </div>
                          ) : null}
                          {publishResultByRelease[r.id]?.errors?.length ? (
                            <div className="mt-1" style={{ color: theme.danger }}>
                              {publishResultByRelease[r.id]?.errors.join("; ")}
                            </div>
                          ) : (
                            <div className="mt-1" style={{ color: theme.success }}>{t("repo.settings.validationOk")}</div>
                          )}
                        </div>
                      ) : null}
                      {(publishJobsByRelease[r.id] ?? []).length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {(publishJobsByRelease[r.id] ?? []).slice(0, 5).map((job) => (
                            <div key={job.id} className="rounded border p-2 text-[11px]" style={{ borderColor: theme.border }}>
                              <div className="flex items-center justify-between gap-2">
                                <span style={{ color: theme.text2 }}>
                                  {job.state.toUpperCase()} · attempt {job.attempt} · {job.version}
                                </span>
                                {job.state === "failed" || job.state === "success" ? (
                                  <button
                                    type="button"
                                    className="rounded border px-2 py-0.5"
                                    style={{ borderColor: theme.border, color: theme.text2 }}
                                    onClick={() => {
                                      void (async () => {
                                        if (!repoId) return;
                                        try {
                                          await retryReleasePublishJob(repoId, job.id);
                                          toast.success(t("repo.settings.retryQueued"));
                                        } catch (e) {
                                          toast.error(e instanceof Error ? e.message : t("repo.settings.retryFailed"));
                                        }
                                      })();
                                    }}
                                  >
                                    {t("repo.settings.retry")}
                                  </button>
                                ) : null}
                              </div>
                              <div className="mt-1"><code>{job.command_line}</code></div>
                              {job.error_text ? (
                                <div className="mt-1" style={{ color: theme.danger }}>{job.error_text}</div>
                              ) : null}
                              {job.log_text ? (
                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap" style={{ color: theme.text3 }}>
                                  {job.log_text}
                                </pre>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {releases.length === 0 ? <p className="text-xs" style={{ color: theme.text3 }}>{t("repo.settings.noReleases")}</p> : null}
              </div>
            </PlaceholderBlock>

            <PlaceholderBlock theme={theme} title={t("repo.settings.packageRegistries")}>
              <div className="grid gap-2 md:grid-cols-2">
                <select value={registryType} onChange={(e) => setRegistryType(e.target.value as "npm" | "pypi" | "docker")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}>
                  <option value="npm">{t("repo.settings.registryNpm")}</option>
                  <option value="pypi">{t("repo.settings.registryPypi")}</option>
                  <option value="docker">{t("repo.settings.registryDocker")}</option>
                </select>
                <input value={registryEndpoint} onChange={(e) => setRegistryEndpoint(e.target.value)} placeholder={t("repo.settings.registryEndpointPlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <input value={registryNamespace} onChange={(e) => setRegistryNamespace(e.target.value)} placeholder={t("repo.settings.registryNamespacePlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
                <input value={registryToken} onChange={(e) => setRegistryToken(e.target.value)} placeholder={t("repo.settings.registryTokenPlaceholder")} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }} />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={readOnly || registryBusy || !repoId || !registryEndpoint.trim() || !registryNamespace.trim() || !registryToken.trim()}
                  onClick={() => {
                    void (async () => {
                      if (!repoId) return;
                      setRegistryBusy(true);
                      try {
                        const created = await createRepositoryRegistry(repoId, {
                          registry_type: registryType,
                          endpoint: registryEndpoint.trim(),
                          namespace: registryNamespace.trim(),
                          token: registryToken,
                        });
                        setRegistries((prev) => [created, ...prev]);
                        setRegistryToken("");
                        toast.success(t("repo.settings.registryCreated"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("repo.settings.actionFailed"));
                      } finally {
                        setRegistryBusy(false);
                      }
                    })();
                  }}
                  className="rounded border px-3 py-1.5 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                >
                  {registryBusy ? t("repo.settings.saving") : t("repo.settings.saveRegistry")}
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {registries.map((x) => (
                  <div key={x.id} className="rounded border px-2 py-1 text-xs" style={{ borderColor: theme.border, color: theme.text2 }}>
                    {x.registry_type} · {x.endpoint} · {x.namespace} · {x.token_masked}
                  </div>
                ))}
                {registries.length === 0 ? <p className="text-xs" style={{ color: theme.text3 }}>{t("repo.settings.noRegistries")}</p> : null}
              </div>
            </PlaceholderBlock>
          </>
        )}
      </div>
    </div>
  );
}
