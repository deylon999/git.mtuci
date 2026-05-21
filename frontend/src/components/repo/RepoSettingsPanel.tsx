import { useState, type ReactNode } from "react";
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
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { pluralWord } from "../../i18n/plural";
import type { StudentRepoMeta } from "../../hooks/useStudentRepoWorkspace";
import type { ThemeColors } from "../../theme";

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
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [copied, setCopied] = useState(false);
  const cloneUrl = meta?.cloneUrl ?? "";

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
        {section === "general" && (
          <>
            <h2 className="text-base font-semibold" style={{ color: theme.text }}>
              {t("repo.settings.generalTitle")}
            </h2>
            <dl className="grid gap-3 text-sm">
              {[
                { label: t("repo.settings.labelRepoName"), value: meta?.name ?? "—" },
                { label: t("repo.settings.labelDescription"), value: summary?.description || meta?.description || "—" },
                {
                  label: t("repo.settings.labelVisibility"),
                  value:
                    meta?.visibility === "public"
                      ? t("student.repos.visibilityPublic")
                      : t("student.repos.visibilityPrivate"),
                },
                { label: t("repo.settings.labelDefaultBranch"), value: defaultBranch },
                { label: "Primary language", value: summary?.language || meta?.language || "—" },
                {
                  label: "Size",
                  value:
                    summary?.size_kb != null
                      ? summary.size_kb < 1024
                        ? `${summary.size_kb} KB`
                        : `${(summary.size_kb / 1024).toFixed(1)} MB`
                      : "—",
                },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[minmax(0,140px)_1fr] gap-3">
                  <dt style={{ color: theme.text3 }}>{row.label}</dt>
                  <dd style={{ color: theme.text }}>{row.value}</dd>
                </div>
              ))}
            </dl>
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
              Collaborators & teams
            </h2>
            <PlaceholderBlock theme={theme} title="Access">
              <p className="text-sm" style={{ color: theme.text2 }}>
                {t("repo.settings.collaboratorsHint")}
              </p>
              <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: theme.text3 }}>
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
          </>
        )}
      </div>
    </div>
  );
}
