import { apiRequest } from "./client";

export interface Repository {
  id: string;
  name: string;
  description: string | null;
  gitea_repo_name: string | null;
  clone_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export type RepositoryVisibility = "public" | "private";

export interface CreateRepositoryRequest {
  name: string;
  description?: string;
  visibility?: RepositoryVisibility;
  add_readme?: boolean;
  gitignore_template?: string | null;
  license_template?: string | null;
}

export interface RepositoryTemplateOption {
  id: string;
  label: string;
}

export interface RepositoryCreateTemplates {
  gitignores: RepositoryTemplateOption[];
  licenses: RepositoryTemplateOption[];
}

export interface UpdateRepositoryRequest {
  name?: string;
  description?: string;
  repo_type?: "public" | "private" | "course";
}

export async function getRepositoryCreateTemplates(): Promise<RepositoryCreateTemplates> {
  return apiRequest<RepositoryCreateTemplates>("/repositories/create-templates");
}

export async function getMyRepositories(): Promise<Repository[]> {
  return apiRequest<Repository[]>("/repositories/my");
}

export async function createRepository(data: CreateRepositoryRequest): Promise<Repository> {
  return apiRequest<Repository>("/repositories/", {
    method: "POST",
    body: data,
  });
}

export async function updateRepository(id: string, data: UpdateRepositoryRequest): Promise<Repository> {
  return apiRequest<Repository>(`/repositories/${id}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteRepository(id: string): Promise<void> {
  return apiRequest<void>(`/repositories/${id}`, {
    method: "DELETE",
  });
}
