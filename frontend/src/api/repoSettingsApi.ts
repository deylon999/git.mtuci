import { apiRequest } from "./client";

export interface BranchProtectionRule {
  id: string;
  branch_pattern: string;
  required_approvals: number;
  require_status_checks: boolean;
  status_check_contexts: string[];
  required_reviewer_logins: string[];
  dismiss_stale_approvals: boolean;
  block_on_rejected_reviews: boolean;
  created_at: string;
  updated_at: string;
}

export interface RepoWebhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_delivery_status: string | null;
  last_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepoDeployKey {
  id: string;
  title: string;
  key_fingerprint: string | null;
  key_type: string | null;
  read_only: boolean;
  created_at: string;
}

export interface RepoSecret {
  id: string;
  name: string;
  updated_at: string;
}

export async function listBranchProtection(repoId: string): Promise<BranchProtectionRule[]> {
  return apiRequest<BranchProtectionRule[]>(`/repositories/${repoId}/settings/branch-protection`);
}

export async function upsertBranchProtection(repoId: string, body: Omit<BranchProtectionRule, "id" | "created_at" | "updated_at">): Promise<BranchProtectionRule> {
  return apiRequest<BranchProtectionRule>(`/repositories/${repoId}/settings/branch-protection`, {
    method: "PUT",
    body,
  });
}

export async function listWebhooks(repoId: string): Promise<RepoWebhook[]> {
  return apiRequest<RepoWebhook[]>(`/repositories/${repoId}/settings/webhooks`);
}

export async function createWebhook(
  repoId: string,
  body: { url: string; events: string[]; secret?: string; is_active?: boolean },
): Promise<RepoWebhook> {
  return apiRequest<RepoWebhook>(`/repositories/${repoId}/settings/webhooks`, { method: "POST", body });
}

export async function testWebhook(repoId: string, webhookId: string): Promise<RepoWebhook> {
  return apiRequest<RepoWebhook>(`/repositories/${repoId}/settings/webhooks/${webhookId}/test`, { method: "POST" });
}

export async function redeliverWebhook(repoId: string, webhookId: string): Promise<RepoWebhook> {
  return apiRequest<RepoWebhook>(`/repositories/${repoId}/settings/webhooks/${webhookId}/redeliver`, { method: "POST" });
}

export async function deleteWebhook(repoId: string, webhookId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/settings/webhooks/${webhookId}`, { method: "DELETE" });
}

export async function listDeployKeys(repoId: string): Promise<RepoDeployKey[]> {
  return apiRequest<RepoDeployKey[]>(`/repositories/${repoId}/settings/deploy-keys`);
}

export async function createDeployKey(
  repoId: string,
  body: { title: string; public_key: string; read_only?: boolean },
): Promise<RepoDeployKey> {
  return apiRequest<RepoDeployKey>(`/repositories/${repoId}/settings/deploy-keys`, { method: "POST", body });
}

export async function deleteDeployKey(repoId: string, keyId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/settings/deploy-keys/${keyId}`, { method: "DELETE" });
}

export async function listRepoSecrets(repoId: string): Promise<RepoSecret[]> {
  return apiRequest<RepoSecret[]>(`/repositories/${repoId}/settings/secrets`);
}

export async function upsertRepoSecret(repoId: string, body: { name: string; value: string }): Promise<RepoSecret> {
  return apiRequest<RepoSecret>(`/repositories/${repoId}/settings/secrets`, { method: "PUT", body });
}

export async function deleteRepoSecret(repoId: string, secretId: string): Promise<void> {
  return apiRequest<void>(`/repositories/${repoId}/settings/secrets/${secretId}`, { method: "DELETE" });
}
