import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  getStudentRepoSummary,
  getStudentRepositories,
  type StudentRepoSummary,
  type StudentRepositoryItem,
} from "../api/studentDashboardApi";
import { getTeacherRepoItem, getTeacherRepoSummary } from "../api/teacherRepositoriesApi";
import { useAuthUser } from "../context/AuthUserContext";
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
  source?: "personal" | "assignment";
  courseId?: string | null;
  assignmentId?: string | null;
  assignmentLabel?: string | null;
}

function metaFromItem(repo: StudentRepositoryItem): StudentRepoMeta {
  return {
    name: repo.name,
    giteaPath: repo.gitea_path,
    giteaWebUrl: repo.gitea_web_url,
    cloneUrl: repo.clone_url,
    description: repo.description,
    language: repo.language,
    visibility: repo.visibility,
    source: repo.source,
    courseId: repo.course_id ?? null,
    assignmentId: repo.assignment_id ?? null,
    assignmentLabel: repo.assignment_label ?? null,
  };
}

/** Same rule as StudentRepositoryLayout's RepoApiProvider: staff use /teacher/repositories (any repo they may see). */
function isStaffRole(role: string | undefined): boolean {
  return role === "teacher" || role === "laborant" || role === "admin";
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
    source: initial.source,
    courseId: initial.courseId ?? null,
    assignmentId: initial.assignmentId ?? null,
    assignmentLabel: initial.assignmentLabel ?? null,
  };
}

export function useStudentRepoWorkspace(repoId: string | undefined, initialMeta?: Partial<StudentRepoMeta> | null) {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const staff = isStaffRole(user?.role);
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
    // Reset only when the repo (or the seeded meta it came with) changes, not on every new initialMeta object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, initialMeta?.name]);

  useEffect(() => {
    if (!repoId) {
      navigate("/repositories", { replace: true });
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let nextMeta = metaFromPartial(initialMeta) ?? getCachedRepoWorkspace(repoId)?.meta ?? null;
        if (!nextMeta?.name) {
          if (staff) {
            nextMeta = metaFromItem(await getTeacherRepoItem(repoId));
          } else {
            const list = await getStudentRepositories("lite");
            const repo = list.repositories.find((r) => r.id === repoId);
            if (!repo) {
              navigate("/repositories", { replace: true });
              return;
            }
            nextMeta = metaFromItem(repo);
          }
        }
        if (!cancelled) setMeta(nextMeta);
        const summaryRes = staff ? await getTeacherRepoSummary(repoId) : await getStudentRepoSummary(repoId);
        if (!cancelled) {
          setSummary(summaryRes);
          if (nextMeta) {
            setCachedRepoWorkspace(repoId, { meta: nextMeta, summary: summaryRes });
          }
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : tr("repo.errors.workspaceLoadFailed");
        if (e instanceof ApiError && e.status === 404) {
          navigate("/repositories", { replace: true });
          return;
        }
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, navigate, initialMeta, staff]);

  return { meta, setMeta, summary, setSummary, loading, error };
}
