import { useCallback, useEffect, useState } from "react";
import { Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import toast from "react-hot-toast";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import {
  addRepositoryCollaborator,
  addRepositoryTeam,
  createRepositoryInvite,
  getRepositoryAccess,
  getRepositoryAccessAudit,
  removeRepositoryCollaborator,
  removeRepositoryTeam,
  revokeRepositoryInvite,
  updateRepositoryCollaborator,
  updateRepositoryTeam,
  type RepoAccessAuditEntry,
  type RepoAccessRole,
  type RepoAccessSummary,
} from "../../api/repositoryAccessApi";

const ROLES: RepoAccessRole[] = ["read", "write", "admin"];

interface RepoAccessPanelProps {
  theme: ThemeColors;
  repoId: string;
  readOnly?: boolean;
}

function RoleSelect({
  theme,
  value,
  onChange,
  disabled,
  t,
}: {
  theme: ThemeColors;
  value: RepoAccessRole;
  onChange: (role: RepoAccessRole) => void;
  disabled?: boolean;
  t: (key: string) => string;
}) {
  const labels: Record<RepoAccessRole, string> = {
    read: t("repo.access.roleRead"),
    write: t("repo.access.roleWrite"),
    admin: t("repo.access.roleAdmin"),
  };
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RepoAccessRole)}
      className="rounded-lg border px-2 py-1 text-xs"
      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {labels[r]}
        </option>
      ))}
    </select>
  );
}

function auditActionLabel(action: string, t: (k: string) => string): string {
  const key = `repo.access.audit.${action}`;
  const translated = t(key);
  return translated === key ? action : translated;
}

export function RepoAccessPanel({ theme, repoId, readOnly = false }: RepoAccessPanelProps) {
  const { t } = useUserPreferences();
  const [summary, setSummary] = useState<RepoAccessSummary | null>(null);
  const [audit, setAudit] = useState<RepoAccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<RepoAccessRole>("read");
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState<RepoAccessRole>("read");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RepoAccessRole>("read");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [access, auditRows] = await Promise.all([
        getRepositoryAccess(repoId),
        getRepositoryAccessAudit(repoId),
      ]);
      setSummary(access);
      setAudit(auditRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("repo.access.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [repoId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canManage = summary?.can_manage && !readOnly;

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast.success(t("repo.access.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("repo.access.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !summary) {
    return (
      <p className="text-sm" style={{ color: theme.text2 }}>
        {t("repo.access.loading")}
      </p>
    );
  }

  if (error && !summary) {
    return (
      <div
        className="rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: theme.danger, backgroundColor: `${theme.danger}14`, color: theme.text }}
      >
        {error}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      {summary.my_role ? (
        <p className="text-xs" style={{ color: theme.text3 }}>
          {t("repo.access.myRole")}: <span className="font-medium">{summary.my_role}</span>
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
          <Users className="h-4 w-4" />
          {t("repo.access.collaboratorsTitle")}
        </h3>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: `${theme.border}33` }}>
              <tr>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.text2 }}>
                  {t("repo.access.colUser")}
                </th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.text2 }}>
                  {t("repo.access.colRole")}
                </th>
                {canManage ? (
                  <th className="w-24 px-3 py-2" />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {summary.collaborators.map((c) => (
                <tr key={c.user.id} className="border-t" style={{ borderColor: theme.border }}>
                  <td className="px-3 py-2">
                    <div className="font-medium" style={{ color: theme.text }}>
                      {c.user.full_name}
                      {c.is_owner ? (
                        <span className="ml-1 text-[10px] uppercase" style={{ color: theme.text3 }}>
                          ({t("repo.access.owner")})
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs" style={{ color: theme.text3 }}>
                      {c.user.email}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canManage && !c.is_owner ? (
                        <RoleSelect
                          theme={theme}
                          value={c.role}
                          disabled={busy}
                          t={t}
                          onChange={(role) => {
                          void runAction(async () => {
                            await updateRepositoryCollaborator(repoId, c.user.id, role);
                          });
                        }}
                      />
                    ) : (
                      <span style={{ color: theme.text2 }}>{c.role}</span>
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2 text-right">
                      {!c.is_owner ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void runAction(async () => {
                              await removeRepositoryCollaborator(repoId, c.user.id);
                            });
                          }}
                          className="p-1 rounded hover:opacity-80"
                          title={t("repo.access.remove")}
                        >
                          <Trash2 className="h-4 w-4" style={{ color: theme.danger }} />
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage ? (
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <label className="flex-1 w-full space-y-1">
              <span className="text-xs" style={{ color: theme.text3 }}>
                {t("repo.access.addCollaborator")}
              </span>
              <input
                type="email"
                value={collabEmail}
                onChange={(e) => setCollabEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={busy}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
            </label>
            <RoleSelect theme={theme} value={collabRole} disabled={busy} t={t} onChange={setCollabRole} />
            <button
              type="button"
              disabled={busy || !collabEmail.trim()}
              onClick={() => {
                void runAction(async () => {
                  await addRepositoryCollaborator(repoId, {
                    email: collabEmail.trim(),
                    role: collabRole,
                  });
                  setCollabEmail("");
                });
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
              style={{
                borderColor: `${theme.accent}55`,
                backgroundColor: `${theme.accent}14`,
                color: theme.accent2,
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("repo.access.add")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
          <Shield className="h-4 w-4" />
          {t("repo.access.teamsTitle")}
        </h3>
        <p className="text-xs" style={{ color: theme.text3 }}>
          {t("repo.access.teamsHint")}
        </p>
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
          {summary.teams.length === 0 ? (
            <p className="px-3 py-4 text-sm" style={{ color: theme.text3 }}>
              {t("repo.access.noTeams")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: `${theme.border}33` }}>
                <tr>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: theme.text2 }}>
                    {t("repo.access.colTeam")}
                  </th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: theme.text2 }}>
                    {t("repo.access.colMembers")}
                  </th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: theme.text2 }}>
                    {t("repo.access.colRole")}
                  </th>
                  {canManage ? <th className="w-24 px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {summary.teams.map((team) => (
                  <tr key={team.id} className="border-t" style={{ borderColor: theme.border }}>
                    <td className="px-3 py-2 font-medium" style={{ color: theme.text }}>
                      {team.team_name}
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.text2 }}>
                      {team.member_count}
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <RoleSelect
                          theme={theme}
                          value={team.role}
                          disabled={busy}
                          t={t}
                          onChange={(role) => {
                            void runAction(async () => {
                              await updateRepositoryTeam(repoId, team.id, role);
                            });
                          }}
                        />
                      ) : (
                        <span style={{ color: theme.text2 }}>{team.role}</span>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void runAction(async () => {
                              await removeRepositoryTeam(repoId, team.id);
                            });
                          }}
                          className="p-1 rounded hover:opacity-80"
                          title={t("repo.access.remove")}
                        >
                          <Trash2 className="h-4 w-4" style={{ color: theme.danger }} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canManage ? (
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <label className="flex-1 w-full space-y-1">
              <span className="text-xs" style={{ color: theme.text3 }}>
                {t("repo.access.addTeam")}
              </span>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="БВТ-2403"
                disabled={busy}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
            </label>
            <RoleSelect theme={theme} value={teamRole} disabled={busy} t={t} onChange={setTeamRole} />
            <button
              type="button"
              disabled={busy || !teamName.trim()}
              onClick={() => {
                void runAction(async () => {
                  await addRepositoryTeam(repoId, { team_name: teamName.trim(), role: teamRole });
                  setTeamName("");
                });
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium shrink-0"
              style={{
                borderColor: `${theme.accent}55`,
                backgroundColor: `${theme.accent}14`,
                color: theme.accent2,
              }}
            >
              {t("repo.access.add")}
            </button>
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
            <Mail className="h-4 w-4" />
            {t("repo.access.invitesTitle")}
          </h3>
          {summary.invites.length > 0 ? (
            <ul className="space-y-2">
              {summary.invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: theme.border }}
                >
                  <div>
                    <span style={{ color: theme.text }}>{inv.user.full_name}</span>
                    <span className="text-xs ml-2" style={{ color: theme.text3 }}>
                      {inv.user.email} · {inv.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void runAction(async () => {
                        await revokeRepositoryInvite(repoId, inv.id);
                      });
                    }}
                    className="text-xs"
                    style={{ color: theme.danger }}
                  >
                    {t("repo.access.revokeInvite")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: theme.text3 }}>
              {t("repo.access.noInvites")}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <label className="flex-1 w-full space-y-1">
              <span className="text-xs" style={{ color: theme.text3 }}>
                {t("repo.access.inviteByEmail")}
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={busy}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              />
            </label>
            <RoleSelect theme={theme} value={inviteRole} disabled={busy} t={t} onChange={setInviteRole} />
            <button
              type="button"
              disabled={busy || !inviteEmail.trim()}
              onClick={() => {
                void runAction(async () => {
                  await createRepositoryInvite(repoId, {
                    email: inviteEmail.trim(),
                    role: inviteRole,
                  });
                  setInviteEmail("");
                });
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium shrink-0"
              style={{
                borderColor: `${theme.accent}55`,
                backgroundColor: `${theme.accent}14`,
                color: theme.accent2,
              }}
            >
              {t("repo.access.sendInvite")}
            </button>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
            {t("repo.access.auditTitle")}
          </h3>
          {audit.length === 0 ? (
            <p className="text-xs" style={{ color: theme.text3 }}>
              {t("repo.access.noAudit")}
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto" style={{ borderColor: theme.border }}>
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: `${theme.border}33`, position: "sticky", top: 0 }}>
                  <tr>
                    <th className="text-left px-3 py-2" style={{ color: theme.text2 }}>
                      {t("repo.access.colWhen")}
                    </th>
                    <th className="text-left px-3 py-2" style={{ color: theme.text2 }}>
                      {t("repo.access.colAction")}
                    </th>
                    <th className="text-left px-3 py-2" style={{ color: theme.text2 }}>
                      {t("repo.access.colTarget")}
                    </th>
                    <th className="text-left px-3 py-2" style={{ color: theme.text2 }}>
                      {t("repo.access.colActor")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id} className="border-t" style={{ borderColor: theme.border }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.text3 }}>
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.text2 }}>
                        {auditActionLabel(row.action, t)}
                        {row.old_role || row.new_role ? (
                          <span className="block text-[10px]" style={{ color: theme.text3 }}>
                            {row.old_role ?? "—"} → {row.new_role ?? "—"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.text }}>
                        {row.target_label ?? row.target_type}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.text2 }}>
                        {row.actor?.full_name ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
