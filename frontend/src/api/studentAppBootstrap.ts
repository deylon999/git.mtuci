import { seedMeCache } from "./authApi";
import { seedNotificationsCache } from "./notificationsApi";
import { seedSystemInfoCache } from "./systemApi";
import type { Notification, UserRead } from "./types";
import type { UserSettings } from "./userSettingsApi";
import { seedUserSettingsCache } from "./userSettingsApi";
import type { SystemInfo } from "./systemApi";

export type StudentAppShellPayload = {
  user: UserRead;
  settings: UserSettings;
  notifications: Notification[];
  system_info: SystemInfo;
};

const STUDENT_BOOTSTRAP_PATHS = new Set(["/dashboard", "/profile"]);

export function isStudentBootstrapPath(pathname: string): boolean {
  return STUDENT_BOOTSTRAP_PATHS.has(pathname);
}

export function hydrateStudentAppShell(payload: StudentAppShellPayload): void {
  seedMeCache(payload.user);
  seedUserSettingsCache(payload.settings);
  seedNotificationsCache(payload.notifications);
  seedSystemInfoCache(payload.system_info);
}

type BootstrapListener = () => void;
const listeners = new Set<BootstrapListener>();

export function onStudentShellBootstrap(listener: BootstrapListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyStudentShellBootstrap(): void {
  for (const listener of listeners) {
    listener();
  }
}

let bootstrapPromise: Promise<boolean> | null = null;
let bootstrapResolved = false;
let bootstrapSkipped = false;

export function isStudentShellBootstrapResolved(): boolean {
  return bootstrapResolved || bootstrapSkipped;
}

export function resetStudentShellBootstrap(): void {
  bootstrapPromise = null;
  bootstrapResolved = false;
  bootstrapSkipped = false;
}

export function markStudentShellBootstrapSkipped(): void {
  bootstrapSkipped = true;
  bootstrapResolved = true;
  notifyStudentShellBootstrap();
}

export function markStudentShellBootstrapDone(): void {
  bootstrapResolved = true;
  notifyStudentShellBootstrap();
}

export function runStudentShellBootstrap(
  load: () => Promise<StudentAppShellPayload>,
): Promise<boolean> {
  if (bootstrapResolved || bootstrapSkipped) {
    return Promise.resolve(bootstrapSkipped);
  }
  if (!bootstrapPromise) {
    bootstrapPromise = load()
      .then((payload) => {
        hydrateStudentAppShell(payload);
        markStudentShellBootstrapDone();
        return true;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("403 ") || msg.startsWith("401 ")) {
          markStudentShellBootstrapSkipped();
          return false;
        }
        bootstrapPromise = null;
        throw err;
      });
  }
  return bootstrapPromise;
}
