import { apiRequest } from "./client";

export interface ReleaseAsset {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
}

export interface RepositoryRelease {
  id: string;
  repository_id: string;
  tag_name: string;
  name: string;
  body: string;
  target_commitish: string;
  is_prerelease: boolean;
  is_draft: boolean;
  created_by: string;
  created_at: string;
  assets: ReleaseAsset[];
}

export interface RegistryIntegration {
  id: string;
  repository_id: string;
  registry_type: "npm" | "pypi" | "docker";
  endpoint: string;
  namespace: string;
  token_masked: string;
  created_at: string;
}

export interface PublishReleaseResult {
  release_id: string;
  registry_integration_id: string;
  registry_type: "npm" | "pypi" | "docker";
  package_name: string;
  version: string;
  dry_run: boolean;
  ok: boolean;
  command_preview: string;
  errors: string[];
  job_id?: string | null;
}

export interface ReleasePublishJob {
  id: string;
  repository_id: string;
  release_id: string;
  registry_integration_id: string;
  requested_by: string;
  package_name: string;
  version: string;
  dry_run: boolean;
  command_line: string;
  state: "queued" | "running" | "success" | "failed";
  attempt: number;
  error_text: string | null;
  log_text: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export function listRepositoryReleases(repositoryId: string): Promise<RepositoryRelease[]> {
  return apiRequest<RepositoryRelease[]>(`/repositories/${repositoryId}/releases`);
}

export function createRepositoryRelease(
  repositoryId: string,
  payload: {
    tag_name: string;
    name: string;
    body?: string;
    target_commitish?: string;
    is_prerelease?: boolean;
    is_draft?: boolean;
    auto_generate_changelog?: boolean;
  },
): Promise<RepositoryRelease> {
  return apiRequest<RepositoryRelease>(`/repositories/${repositoryId}/releases`, {
    method: "POST",
    body: payload,
  });
}

export async function uploadReleaseAsset(
  repositoryId: string,
  releaseId: string,
  file: File,
  opts?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<void> {
  const onProgress = opts?.onProgress;
  if (onProgress) {
    await new Promise<void>((resolve, reject) => {
      const token = localStorage.getItem("access_token");
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/repositories/${repositoryId}/releases/${releaseId}/assets`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
      opts?.signal?.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload cancelled"));
      });
    });
    return;
  }
  const token = localStorage.getItem("access_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/repositories/${repositoryId}/releases/${releaseId}/assets`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

export function listRepositoryRegistries(repositoryId: string): Promise<RegistryIntegration[]> {
  return apiRequest<RegistryIntegration[]>(`/repositories/${repositoryId}/registries`);
}

export function createRepositoryRegistry(
  repositoryId: string,
  payload: { registry_type: "npm" | "pypi" | "docker"; endpoint: string; namespace: string; token: string },
): Promise<RegistryIntegration> {
  return apiRequest<RegistryIntegration>(`/repositories/${repositoryId}/registries`, {
    method: "POST",
    body: payload,
  });
}

export function publishRepositoryRelease(
  repositoryId: string,
  releaseId: string,
  payload: { registry_integration_id: string; package_name: string; version?: string; dry_run?: boolean },
): Promise<PublishReleaseResult> {
  return apiRequest<PublishReleaseResult>(`/repositories/${repositoryId}/releases/${releaseId}/publish`, {
    method: "POST",
    body: payload,
  });
}

export function listReleasePublishJobs(repositoryId: string, releaseId: string): Promise<ReleasePublishJob[]> {
  return apiRequest<ReleasePublishJob[]>(`/repositories/${repositoryId}/releases/${releaseId}/publish-jobs`);
}

export function retryReleasePublishJob(repositoryId: string, jobId: string): Promise<ReleasePublishJob> {
  return apiRequest<ReleasePublishJob>(`/repositories/${repositoryId}/publish-jobs/${jobId}/retry`, {
    method: "POST",
  });
}
