/** Публичный URL Gitea для ссылок в браузере (совпадает с GITEA_PUBLIC_URL на бэкенде). */
export function getGiteaPublicBase(): string {
  const fromEnv = import.meta.env.VITE_GITEA_PUBLIC_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

const GITEA_RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "git",
  "assets",
  "css",
  "js",
  "img",
  "raw",
  "avatars",
  "explore",
  "issues",
  "pulls",
  "orgs",
  "org",
  "user",
  "repo",
  "login",
  "register",
  "install",
  "swagger",
  "metrics",
  "v2",
  "team",
  "administrator",
  "ghost",
  "notifications",
  "settings",
  "attachments",
]);

function normalizeGiteaLoginCandidate(raw: string): string | null {
  const login = raw
    .split("@")[0]
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  if (!login || GITEA_RESERVED_USERNAMES.has(login.toLowerCase())) {
    return null;
  }
  return login.slice(0, 40);
}

/** Логин владельца в Gitea — как resolve_gitea_username на бэкенде. */
export function resolveGiteaUsername(
  email: string | null | undefined,
  userId?: string | null,
  mtuciLogin?: string | null,
): string {
  const candidates: string[] = [];
  if (mtuciLogin?.trim()) {
    candidates.push(mtuciLogin.trim());
  }
  if (email?.includes("@")) {
    candidates.push(email.split("@")[0]?.trim() ?? "");
  }

  for (const raw of candidates) {
    const login = normalizeGiteaLoginCandidate(raw);
    if (login) return login;
  }

  if (userId) {
    return `u${userId.replace(/-/g, "").slice(0, 12)}`;
  }
  return "user";
}

export function parseGiteaPathFromCloneUrl(cloneUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!cloneUrl?.trim()) return null;
  const raw = cloneUrl.trim();

  const httpMatch = raw.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (httpMatch) {
    return { owner: decodeURIComponent(httpMatch[1]), repo: decodeURIComponent(httpMatch[2]) };
  }

  const scpMatch = raw.match(/^(?:[^@]+@|ssh:\/\/[^/]+\/)(?:[^:]+[:/])([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (scpMatch) {
    return { owner: scpMatch[1], repo: scpMatch[2] };
  }

  const pathMatch = raw.match(/\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (pathMatch) {
    return { owner: decodeURIComponent(pathMatch[1]), repo: decodeURIComponent(pathMatch[2]) };
  }

  return null;
}

export function buildGiteaWebUrl(giteaBase: string, owner: string, repoName: string): string {
  const base = giteaBase.replace(/\/$/, "");
  return `${base}/${owner}/${repoName}`;
}

export function buildGiteaCloneUrl(giteaBase: string, owner: string, repoName: string): string {
  return `${buildGiteaWebUrl(giteaBase, owner, repoName)}.git`;
}

export interface RepoLinkSource {
  name: string;
  gitea_repo_name?: string | null;
  clone_url?: string | null;
  gitea_web_url?: string | null;
  gitea_owner?: string | null;
  gitea_available?: boolean;
  owner_id?: string | null;
}

export interface RepoLinkContext {
  giteaBase: string;
}

export function resolveRepoLinks(
  repo: RepoLinkSource,
  _ctx: RepoLinkContext,
): { webUrl: string | null; cloneUrl: string | null } {
  const giteaBase = _ctx.giteaBase.replace(/\/$/, "");

  if (repo.gitea_available === false && !repo.gitea_web_url && !repo.clone_url) {
    return { webUrl: null, cloneUrl: null };
  }

  if (repo.gitea_web_url?.trim()) {
    const webUrl = repo.gitea_web_url.trim().replace(/\/$/, "");
    const parsed = parseGiteaPathFromCloneUrl(repo.clone_url);
    const owner = repo.gitea_owner?.trim() || parsed?.owner;
    const repoName = parsed?.repo || repo.gitea_repo_name || repo.name;
    const cloneUrl =
      owner && repoName
        ? buildGiteaCloneUrl(giteaBase, owner, repoName)
        : webUrl.startsWith("http")
          ? `${webUrl}.git`
          : null;
    return {
      webUrl: webUrl.startsWith("http") ? webUrl : null,
      cloneUrl: cloneUrl && /^https?:\/\//i.test(cloneUrl) ? cloneUrl : null,
    };
  }

  const parsed = parseGiteaPathFromCloneUrl(repo.clone_url);
  if (parsed?.owner && parsed?.repo) {
    return {
      webUrl: buildGiteaWebUrl(giteaBase, parsed.owner, parsed.repo),
      cloneUrl: buildGiteaCloneUrl(giteaBase, parsed.owner, parsed.repo),
    };
  }

  if (repo.gitea_owner?.trim() && (repo.gitea_repo_name || repo.name)) {
    const owner = repo.gitea_owner.trim();
    const repoName = (repo.gitea_repo_name || repo.name).trim();
    return {
      webUrl: buildGiteaWebUrl(giteaBase, owner, repoName),
      cloneUrl: buildGiteaCloneUrl(giteaBase, owner, repoName),
    };
  }

  return { webUrl: null, cloneUrl: null };
}
