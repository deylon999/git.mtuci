import { apiRequest } from "./client";

export interface GitTokenRead {
  id: string;
  name: string;
  scopes: string[];
  token_preview: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface GitTokenCreateRead extends GitTokenRead {
  token: string;
}

export interface UserSshKeyRead {
  id: string;
  title: string;
  key_fingerprint: string | null;
  key_type: string | null;
  public_key_preview: string | null;
  read_only: boolean;
  created_at: string;
}

export async function listMyGitTokens(): Promise<GitTokenRead[]> {
  return apiRequest<GitTokenRead[]>("/users/me/git-auth/tokens");
}

export async function createMyGitToken(body: {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}): Promise<GitTokenCreateRead> {
  return apiRequest<GitTokenCreateRead>("/users/me/git-auth/tokens", { method: "POST", body });
}

export async function revokeMyGitToken(tokenId: string): Promise<void> {
  return apiRequest<void>(`/users/me/git-auth/tokens/${tokenId}`, { method: "DELETE" });
}

export async function rotateMyGitToken(
  tokenId: string,
  body: { name?: string; scopes?: string[]; expires_at?: string | null },
): Promise<GitTokenCreateRead> {
  return apiRequest<GitTokenCreateRead>(`/users/me/git-auth/tokens/${tokenId}/rotate`, {
    method: "POST",
    body,
  });
}

export async function listMySshKeys(): Promise<UserSshKeyRead[]> {
  return apiRequest<UserSshKeyRead[]>("/users/me/git-auth/ssh-keys");
}

export async function createMySshKey(body: {
  title: string;
  public_key: string;
  read_only?: boolean;
}): Promise<UserSshKeyRead> {
  return apiRequest<UserSshKeyRead>("/users/me/git-auth/ssh-keys", { method: "POST", body });
}

export async function deleteMySshKey(keyId: string): Promise<void> {
  return apiRequest<void>(`/users/me/git-auth/ssh-keys/${keyId}`, { method: "DELETE" });
}

