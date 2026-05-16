import { useCallback, useEffect, useState } from "react";
import { Copy, Key, Loader2, RefreshCw } from "lucide-react";
import {
  getStudentGitCloneTokenStatus,
  regenerateStudentGitCloneToken,
  type StudentGitCloneTokenStatus,
} from "../api/studentDashboardApi";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

interface StudentGitTokenSettingsProps {
  isDarkTheme?: boolean;
}

export default function StudentGitTokenSettings({ isDarkTheme = false }: StudentGitTokenSettingsProps) {
  const { t } = useUserPreferences();
  const theme = getTheme(isDarkTheme);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [status, setStatus] = useState<StudentGitCloneTokenStatus | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getStudentGitCloneTokenStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("gitToken.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRegenerate = async () => {
    if (!window.confirm(t("gitToken.confirmRegenerate"))) return;
    setRegenerating(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await regenerateStudentGitCloneToken();
      setNewToken(res.token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("gitToken.createError"));
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="settings-card rounded-xl border p-5"
      style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${theme.accent}22` }}
        >
          <Key className="h-5 w-5" style={{ color: theme.accent2 }} />
        </div>
        <div>
          <h3 className="text-base font-semibold" style={{ color: theme.text }}>
            {t("gitToken.title")}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: theme.text2 }}>
            {t("gitToken.subtitle")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : (
        <>
          <div
            className="rounded-lg border px-3 py-2 text-sm mb-3"
            style={{ backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text2 }}
          >
            <p>
              {t("gitToken.giteaUser")}:{" "}
              <span className="font-mono" style={{ color: theme.text }}>
                {status?.gitea_username ?? "—"}
              </span>
            </p>
            <p className="mt-1">
              {t("gitToken.token")}:{" "}
              {status?.configured ? (
                <span className="font-mono" style={{ color: theme.success }}>
                  {status.masked_token}
                </span>
              ) : (
                <span style={{ color: theme.warning }}>{t("gitToken.notConfigured")}</span>
              )}
            </p>
          </div>

          <p className="text-xs mb-3" style={{ color: theme.text3 }}>
            {t("gitToken.hint")}{" "}
            <code className="font-mono">http://login:token@host/owner/repo.git</code>
          </p>

          {newToken ? (
            <div
              className="rounded-lg border p-3 mb-3"
              style={{ backgroundColor: `${theme.success}12`, borderColor: `${theme.success}40` }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: theme.success }}>
                {t("gitToken.newTokenTitle")}
              </p>
              <code className="block text-[11px] font-mono break-all mb-2" style={{ color: theme.text }}>
                {newToken}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: theme.border, color: theme.text2 }}
              >
                <Copy className="h-3 w-3" />
                {copied ? t("common.copied") : t("common.copy")}
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="text-xs mb-2" style={{ color: theme.danger }}>
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={regenerating}
            onClick={() => void handleRegenerate()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: theme.accent }}
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {status?.configured ? t("gitToken.regenerate") : t("gitToken.create")}
          </button>
        </>
      )}
    </div>
  );
}
