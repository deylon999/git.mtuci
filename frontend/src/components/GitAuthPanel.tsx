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

export default function GitAuthPanel({ isDarkTheme = false }: { isDarkTheme?: boolean }) {
  const theme = getTheme(isDarkTheme);
  const [tokens, setTokens] = useState<GitTokenRead[]>([]);
  const [sshKeys, setSshKeys] = useState<UserSshKeyRead[]>([]);
  const [tokenName, setTokenName] = useState("cli");
  const [tokenScopes, setTokenScopes] = useState("read:repository,write:repository");
  const [newToken, setNewToken] = useState<string | null>(null);
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

  return (
    <div style={{ backgroundColor: theme.bg3, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 20 }}>
      <h3 style={{ color: theme.text, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Git Auth: PAT + SSH keys</h3>
      {error ? <p style={{ color: theme.danger, fontSize: 12 }}>{error}</p> : null}
      {newToken ? (
        <div style={{ marginBottom: 12, fontSize: 12, color: theme.success }}>
          New token: <code style={{ color: theme.text }}>{newToken}</code>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <p style={{ color: theme.text2, fontSize: 12, marginBottom: 8 }}>Personal Access Tokens</p>
          <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Token name" style={{ width: "100%", marginBottom: 8, border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, background: theme.inputBg, color: theme.text }} />
          <input value={tokenScopes} onChange={(e) => setTokenScopes(e.target.value)} placeholder="scope1,scope2" style={{ width: "100%", marginBottom: 8, border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, background: theme.inputBg, color: theme.text }} />
          <button
            type="button"
            disabled={busy || !tokenName.trim()}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await createMyGitToken({
                    name: tokenName.trim(),
                    scopes: tokenScopes.split(",").map((s) => s.trim()).filter(Boolean),
                  });
                  setNewToken(res.token);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Failed to create token");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Create token
          </button>
          <div style={{ marginTop: 8 }}>
            {tokens.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", color: theme.text2, fontSize: 12, marginTop: 6 }}>
                <span>{t.name} ({t.token_preview ?? "hidden"})</span>
                <span>
                  <button type="button" disabled={busy} onClick={() => void rotateMyGitToken(t.id, {}).then((r) => setNewToken(r.token)).then(load)} style={{ marginRight: 6 }}>Rotate</button>
                  <button type="button" disabled={busy} onClick={() => void revokeMyGitToken(t.id).then(load)}>Revoke</button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p style={{ color: theme.text2, fontSize: 12, marginBottom: 8 }}>SSH keys</p>
          <input value={sshTitle} onChange={(e) => setSshTitle(e.target.value)} placeholder="Key title" style={{ width: "100%", marginBottom: 8, border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, background: theme.inputBg, color: theme.text }} />
          <textarea value={sshKey} onChange={(e) => setSshKey(e.target.value)} placeholder="ssh-ed25519 AAAA..." rows={3} style={{ width: "100%", marginBottom: 8, border: `1px solid ${theme.border}`, borderRadius: 6, padding: 8, background: theme.inputBg, color: theme.text }} />
          <button
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
                  setError(e instanceof Error ? e.message : "Failed to add SSH key");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Add SSH key
          </button>
          <div style={{ marginTop: 8 }}>
            {sshKeys.map((k) => (
              <div key={k.id} style={{ display: "flex", justifyContent: "space-between", color: theme.text2, fontSize: 12, marginTop: 6 }}>
                <span>{k.title} ({k.key_type ?? "ssh"})</span>
                <button type="button" disabled={busy} onClick={() => void deleteMySshKey(k.id).then(load)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

