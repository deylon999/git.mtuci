import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getStudentRepoSummary,
  getStudentRepositories,
  type StudentRepoSummary,
} from "../api/studentDashboardApi";
import { getCachedRepoWorkspace, setCachedRepoWorkspace } from "../utils/repoWorkspaceCache";
import { tr } from "../utils/i18nLabels";

export interface StudentRepoMeta {
  name: string;
  giteaPath: string | null;
  giteaWebUrl: string | null;
  cloneUrl: string | null;
  description: string | null;
  language: string | null;
  visibility: string | null;
}

function metaFromPartial(initial?: Partial<StudentRepoMeta> | null): StudentRepoMeta | null {
  if (!initial?.name) return null;
  return {
    name: initial.name,
    giteaPath: initial.giteaPath ?? null,
    giteaWebUrl: initial.giteaWebUrl ?? null,
    cloneUrl: initial.cloneUrl ?? null,
    description: initial.description ?? null,
    language: initial.language ?? null,
    visibility: initial.visibility ?? null,
  };
}

export function useStudentRepoWorkspace(repoId: string | undefined, initialMeta?: Partial<StudentRepoMeta> | null) {
  const navigate = useNavigate();
  const cached = repoId ? getCachedRepoWorkspace(repoId) : undefined;
  const [meta, setMeta] = useState<StudentRepoMeta | null>(
    () => metaFromPartial(initialMeta) ?? cached?.meta ?? null,
  );
  const [summary, setSummary] = useState<StudentRepoSummary | null>(cached?.summary ?? null);
  const [loading, setLoading] = useState(() => !meta && !cached?.meta);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId) return;
    const cachedEntry = getCachedRepoWorkspace(repoId);
    setMeta(metaFromPartial(initialMeta) ?? cachedEntry?.meta ?? null);
    setSummary(cachedEntry?.summary ?? null);
    setError(null);
    setLoading(!metaFromPartial(initialMeta)?.name && !cachedEntry?.meta);
  }, [repoId, initialMeta?.name]);

  useEffect(() => {
    if (!repoId) {
      navigate("/repositories", { replace: true });
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let nextMeta = metaFromPartial(initialMeta) ?? getCachedRepoWorkspace(repoId)?.meta ?? null;
        if (!nextMeta?.name) {
          const list = await getStudentRepositories("lite");
          const repo = list.repositories.find((r) => r.id === repoId);
          if (!repo) {
            navigate("/repositories", { replace: true });
            return;
          }
          nextMeta = {
            name: repo.name,
            giteaPath: repo.gitea_path,
            giteaWebUrl: repo.gitea_web_url,
            cloneUrl: repo.clone_url,
            description: repo.description,
            language: repo.language,
            visibility: repo.visibility,
          };
        }
        if (!cancelled) setMeta(nextMeta);
        const summaryRes = await getStudentRepoSummary(repoId);
        if (!cancelled) {
          setSummary(summaryRes);
          if (nextMeta) {
            setCachedRepoWorkspace(repoId, { meta: nextMeta, summary: summaryRes });
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : tr("repo.errors.workspaceLoadFailed");
        if (msg.includes("404") && /not found|не найден/i.test(msg)) {
          navigate("/repositories", { replace: true });
          return;
        }
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, navigate, initialMeta?.name]);

  return { meta, summary, loading, error, setSummary };
}
