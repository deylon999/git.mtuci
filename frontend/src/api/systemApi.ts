import { apiRequest } from "./client";

export interface SystemInfo {
  version: string;
  api_version: string;
  commits: number;
  gitea_public_url?: string;
}

let systemInfoInflight: Promise<SystemInfo> | null = null;
let systemInfoCache: { savedAt: number; data: SystemInfo } | null = null;
const SYSTEM_INFO_TTL_MS = 300_000;

export function seedSystemInfoCache(data: SystemInfo): void {
  systemInfoCache = { savedAt: Date.now(), data };
  systemInfoInflight = null;
}

export function getSystemInfo(): Promise<SystemInfo> {
  const now = Date.now();
  if (systemInfoCache && now - systemInfoCache.savedAt < SYSTEM_INFO_TTL_MS) {
    return Promise.resolve(systemInfoCache.data);
  }
  if (systemInfoInflight) {
    return systemInfoInflight;
  }
  systemInfoInflight = apiRequest<SystemInfo>("/system/info", { auth: false })
    .then((data) => {
      systemInfoCache = { savedAt: Date.now(), data };
      return data;
    })
    .finally(() => {
      systemInfoInflight = null;
    });
  return systemInfoInflight;
}
