import { apiRequest } from "./client";

export interface SystemInfo {
  version: string;
  api_version: string;
  commits: number;
}

export function getSystemInfo(): Promise<SystemInfo> {
  return apiRequest<SystemInfo>("/system/info", { auth: false });
}
