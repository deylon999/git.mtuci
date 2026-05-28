import { apiRequest } from "./client";

export type RepoAccessRole = "read" | "write" | "admin";

export interface RepoAccessUser {
  id: string;
  full_name: string;
  email: string;
  group_name: string | null;
}

export interface RepoCollaborator {
  user: RepoAccessUser;
  role: RepoAccessRole;
  granted_at: string;
  is_owner: boolean;
}

export interface RepoTeamAccess {
  id: string;
  team_name: string;
  role: RepoAccessRole;
  member_count: number;
  granted_at: string;
}

export interface RepoAccessInvite {
  id: string;
  user: RepoAccessUser;
  role: RepoAccessRole;
  status: "pending" | "accepted" | "declined" | "revoked";
  invited_by: RepoAccessUser | null;
  created_at: string;
  expires_at: string | null;
}

export interface RepoAccessAuditEntry {
  id: string;
  action: string;
  target_type: string;
  target_label: string | null;
  old_role: string | null;
  new_role: string | null;
  actor: RepoAccessUser | null;
  created_at: string;
}

export interface RepoAccessSummary {
  repository_id: string;
  can_manage: boolean;
  my_role: RepoAccessRole | null;
  owner: RepoAccessUser;
  collaborators: RepoCollaborator[];
  teams: RepoTeamAccess[];
  invites: RepoAccessInvite[];
}

export async function getRepositoryAccess(repoId: string): Promise<RepoAccessSummary> {
  return apiRequest<RepoAccessSummary>(`/repositories/${repoId}/access`);
}

export async function getRepositoryAccessAudit(
  repoId: string,
  limit = 50
): Promise<RepoAccessAuditEntry[]> {
  return apiRequest<RepoAccessAuditEntry[]>(`/repositories/${repoId}/access/audit?limit=${limit}`);
}

export async function addRepositoryCollaborator(
  repoId: string,
  body: { email?: string; user_id?: string; role: RepoAccessRole }
): Promise<RepoCollaborator> {
  return apiRequest<RepoCollaborator>(`/repositories/${repoId}/access/collaborators`, {
    method: "POST",
    body,
  });
}

export async function updateRepositoryCollaborator(
  repoId: string,
  userId: string,
  role: RepoAccessRole
): Promise<RepoCollaborator> {
  return apiRequest<RepoCollaborator>(`/repositories/${repoId}/access/collaborators/${userId}`, {
    method: "PATCH",
    body: { role },
  });
}

export async function removeRepositoryCollaborator(repoId: string, userId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/access/collaborators/${userId}`, {
    method: "DELETE",
  });
}

export async function addRepositoryTeam(
  repoId: string,
  body: { team_name: string; role: RepoAccessRole }
): Promise<RepoTeamAccess> {
  return apiRequest<RepoTeamAccess>(`/repositories/${repoId}/access/teams`, {
    method: "POST",
    body,
  });
}

export async function updateRepositoryTeam(
  repoId: string,
  teamId: string,
  role: RepoAccessRole
): Promise<RepoTeamAccess> {
  return apiRequest<RepoTeamAccess>(`/repositories/${repoId}/access/teams/${teamId}`, {
    method: "PATCH",
    body: { role },
  });
}

export async function removeRepositoryTeam(repoId: string, teamId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/access/teams/${teamId}`, {
    method: "DELETE",
  });
}

export async function createRepositoryInvite(
  repoId: string,
  body: { email?: string; user_id?: string; role: RepoAccessRole }
): Promise<RepoAccessInvite> {
  return apiRequest<RepoAccessInvite>(`/repositories/${repoId}/access/invites`, {
    method: "POST",
    body,
  });
}

export async function revokeRepositoryInvite(repoId: string, inviteId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/access/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export async function getMyPendingInvites(): Promise<RepoAccessInvite[]> {
  return apiRequest<RepoAccessInvite[]>("/students/me/repository-invites/pending");
}

export async function respondRepositoryInvite(
  inviteId: string,
  accept: boolean
): Promise<RepoAccessInvite> {
  return apiRequest<RepoAccessInvite>(`/students/me/repository-invites/${inviteId}/respond`, {
    method: "POST",
    body: { accept },
  });
}
