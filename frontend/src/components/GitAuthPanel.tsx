import { useEffect, useState } from "react";
import {
  createMyGitToken,
  createMySshKey,
  deleteMySshKey,
  listMyGitTokens,
  listMySshKeys,
  revokeMyGitToken,
  rotateMyGitToken,
  type GitTokenRead,
  type UserSshKeyRead,
} from "../api/gitAuthApi";
import { getTheme } from "../theme";
import { useUserPreferences } from "../context/UserPreferencesContext";

const MAX_ACTIVE_GIT_TOKENS_PER_USER = 10;

export default function GitAuthPanel({ isDarkTheme = false }: { isDarkTheme?: boolean }) {
  const theme = getTheme(isDarkTheme);
  const { t } = useUserPreferences();
  const [tokens, setTokens] = useState<GitTokenRead[]>([]);
  const [sshKeys, setSshKeys] = useState<UserSshKeyRead[]>([]);
  const [tokenName, setTokenName] = useState("cli");
  const [scopeReadRepository, setScopeReadRepository] = useState(true);
  const [scopeWriteRepository, setScopeWriteRepository] = useState(true);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [sshTitle, setSshTitle] = useState("laptop");
  const [sshKey, setSshKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [t, s] = await Promise.all([listMyGitTokens(), listMySshKeys()]);
    setTokens(t);
    setSshKeys(s);
  };

  useEffect(() => {
    void load();
  }, []);

  const fieldBaseStyle = {
    width: "100%",
    backgroundColor: theme.inputBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "6px",
    padding: "10px 12px",
    color: theme.text,
    fontSize: "12px",
    outline: "none",
  } as const;

  const primaryButtonStyle = {
    backgroundColor: theme.accent,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "8px 20px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  } as const;

  const secondaryButtonStyle = {
    backgroundColor: "transparent",
    color: theme.text2,
    border: `1px solid ${theme.border}`,
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
  } as const;
  const themedCheckboxStyle = (checked: boolean) =>
    ({
      appearance: "none",
      WebkitAppearance: "none",
      width: 14,
      height: 14,
      borderRadius: 4,
      border: `1px solid ${checked ? theme.accent : theme.border}`,
      backgroundColor: checked ? theme.accent : theme.bg2,
      cursor: "pointer",
      display: "inline-block",
      backgroundImage: checked
        ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2l2 2.2 5-5' fill='none' stroke='white' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"
        : "none",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "10px 10px",
    }) as const;

  const visibleTokens = showAllTokens ? tokens : tokens.slice(0, 5);
  const selectedScopes = [
    scopeReadRepository ? "read:repository" : null,
    scopeWriteRepository ? "write:repository" : null,
  ].filter(Boolean) as string[];
  const activeTokensCount = tokens.filter((token) => token.is_active).length;
  const limitReached = activeTokensCount >= MAX_ACTIVE_GIT_TOKENS_PER_USER;
  const canCreateToken = tokenName.trim().length > 0 && selectedScopes.length > 0 && !limitReached;
  const formatDateTime = (iso: string | null) => {
    if (!iso) return t("gitAuthPanel.neverUsed");
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString();
  };

  return (
    <div style={{ backgroundColor: theme.bg3, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 20 }}>
      <style>{`
        .git-auth-primary-btn {
          transition: background-color 0.15s ease;
        }
        .git-auth-primary-btn:hover:not(:disabled) {
          background-color: #1d4ed8 !important;
        }
      `}</style>
      <h3 style={{ color: theme.text, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("gitAuthPanel.title")}</h3>
      {error ? <p style={{ color: theme.danger, fontSize: 12 }}>{error}</p> : null}
      {newToken ? (
        <div style={{ marginBottom: 12, fontSize: 12, color: theme.success }}>
          {t("gitAuthPanel.newToken")} <code style={{ color: theme.text }}>{newToken}</code>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ color: theme.text2, fontSize: 12, marginBottom: 0 }}>{t("gitAuthPanel.patTitle")}</p>
          <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder={t("gitAuthPanel.tokenNamePlaceholder")} style={fieldBaseStyle} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.text2, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={scopeReadRepository}
                onChange={(e) => setScopeReadRepository(e.target.checked)}
                style={themedCheckboxStyle(scopeReadRepository)}
              />
              {t("gitAuthPanel.scopeReadRepository")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: theme.text2, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={scopeWriteRepository}
                onChange={(e) => setScopeWriteRepository(e.target.checked)}
                style={themedCheckboxStyle(scopeWriteRepository)}
              />
              {t("gitAuthPanel.scopeWriteRepository")}
            </label>
          </div>
          <button
            className="git-auth-primary-btn"
            type="button"
            disabled={busy || !canCreateToken}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await createMyGitToken({
                    name: tokenName.trim(),
                    scopes: selectedScopes,
                  });
                  setNewToken(res.token);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("gitAuthPanel.failedCreateToken"));
                } finally {
                  setBusy(false);
                }
              })();
            }}
            style={{ ...primaryButtonStyle, opacity: busy || !canCreateToken ? 0.6 : 1, cursor: busy || !canCreateToken ? "not-allowed" : "pointer", alignSelf: "flex-start" }}
          >
            {t("gitAuthPanel.createToken")}
          </button>
          {limitReached ? (
            <div style={{ fontSize: 11, color: theme.danger }}>
              {t("gitAuthPanel.limitReachedHint")}
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
            {visibleTokens.map((token) => (
              <div key={token.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, color: theme.text2, fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${theme.border}` }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: theme.text, fontSize: 12 }}>
                    {token.name} ({token.token_preview ?? t("gitAuthPanel.hidden")})
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: theme.text2, lineHeight: 1.4 }}>
                    {t("gitAuthPanel.createdAt")}: {formatDateTime(token.created_at)} · {t("gitAuthPanel.lastUsedAt")}: {formatDateTime(token.last_used_at)} · {t("gitAuthPanel.status")}: {token.is_active ? t("gitAuthPanel.statusActive") : t("gitAuthPanel.statusDisabled")}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      disabled={busy}
                      title={t("gitAuthPanel.reissueHint")}
                      onClick={() => void rotateMyGitToken(token.id, {}).then((r) => setNewToken(r.token)).then(load)}
                      style={{ ...secondaryButtonStyle, opacity: busy ? 0.6 : 1 }}
                    >
                      {t("gitAuthPanel.reissue")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      title={t("gitAuthPanel.disableHint")}
                      onClick={() => void revokeMyGitToken(token.id).then(load)}
                      style={{ ...secondaryButtonStyle, opacity: busy ? 0.6 : 1 }}
                    >
                      {t("gitAuthPanel.disable")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {tokens.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllTokens((prev) => !prev)}
                style={{ ...secondaryButtonStyle, marginTop: 10 }}
              >
                {showAllTokens ? t("gitAuthPanel.collapse") : `${t("gitAuthPanel.showAll")} (${tokens.length})`}
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ color: theme.text2, fontSize: 12, marginBottom: 0 }}>{t("gitAuthPanel.sshKeys")}</p>
          <input value={sshTitle} onChange={(e) => setSshTitle(e.target.value)} placeholder={t("gitAuthPanel.keyTitlePlaceholder")} style={fieldBaseStyle} />
          <textarea value={sshKey} onChange={(e) => setSshKey(e.target.value)} placeholder={t("gitAuthPanel.keyValuePlaceholder")} rows={3} style={fieldBaseStyle} />
          <button
            className="git-auth-primary-btn"
            type="button"
            disabled={busy || !sshTitle.trim() || !sshKey.trim()}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await createMySshKey({ title: sshTitle.trim(), public_key: sshKey.trim() });
                  setSshKey("");
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("gitAuthPanel.failedAddSshKey"));
                } finally {
                  setBusy(false);
                }
              })();
            }}
            style={{ ...primaryButtonStyle, opacity: busy || !sshTitle.trim() || !sshKey.trim() ? 0.6 : 1, cursor: busy || !sshTitle.trim() || !sshKey.trim() ? "not-allowed" : "pointer", alignSelf: "flex-start" }}
          >
            {t("gitAuthPanel.addSshKey")}
          </button>
          <div style={{ marginTop: 8 }}>
            {sshKeys.map((k) => (
              <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: theme.text2, fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${theme.border}` }}>
                <span>{k.title} ({k.key_type ?? "ssh"})</span>
                <button type="button" disabled={busy} onClick={() => void deleteMySshKey(k.id).then(load)} style={{ ...secondaryButtonStyle, opacity: busy ? 0.6 : 1 }}>
                  {t("gitAuthPanel.delete")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
