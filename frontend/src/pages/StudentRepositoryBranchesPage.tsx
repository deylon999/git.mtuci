import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createStudentRepoBranch,
  deleteStudentRepoBranch,
  getStudentRepoBranches,
} from "../api/studentDashboardApi";
import { useStudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import { getTheme } from "../theme";

interface StudentRepositoryBranchesPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryBranchesPage({ isDarkTheme = false }: StudentRepositoryBranchesPageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId, summary } = useStudentRepoWorkspaceContext();
  const isBlocked = !!summary?.is_blocked;

  const [branches, setBranches] = useState<{ name: string; is_default: boolean }[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newBranch, setNewBranch] = useState("");
  const [fromRef, setFromRef] = useState("");
  const [saving, setSaving] = useState(false);

  const branchNames = useMemo(() => branches.map((b) => b.name), [branches]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentRepoBranches(repoId);
      setBranches(data.branches);
      setDefaultBranch(data.default_branch || "main");
      if (!fromRef) setFromRef(data.default_branch || "main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load branches");
      setBranches([]);
      setDefaultBranch("main");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  const canMutate = !isBlocked;

  const onCreate = async () => {
    const name = newBranch.trim();
    const from = (fromRef || defaultBranch).trim();
    if (!name) return;
    setSaving(true);
    try {
      await createStudentRepoBranch(repoId, { name, from_ref: from });
      setNewBranch("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create branch");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (name: string) => {
    if (!name || name === defaultBranch) return;
    const ok = window.confirm(`Delete branch "${name}"?`);
    if (!ok) return;
    setSaving(true);
    try {
      await deleteStudentRepoBranch(repoId, name);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: theme.border }}>
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: theme.text }}>
          <GitBranch className="h-4 w-4" />
          Branches
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={fromRef}
            onChange={(e) => setFromRef(e.target.value)}
            className="rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
            disabled={saving || !canMutate}
            title="Create from"
          >
            {[defaultBranch, ...branchNames.filter((b) => b !== defaultBranch)].map((b) => (
              <option key={b} value={b}>
                {b}
                {b === defaultBranch ? " (default)" : ""}
              </option>
            ))}
          </select>
          <input
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder="new-branch-name"
            className="rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
            disabled={saving || !canMutate}
          />
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={saving || !canMutate || !newBranch.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{
              borderColor: `${theme.success}55`,
              backgroundColor: `${theme.success}14`,
              color: saving || !canMutate ? theme.text3 : theme.success,
              opacity: saving || !canMutate ? 0.55 : 1,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="px-4 py-3 text-sm" style={{ color: theme.danger }}>
          {error}
        </div>
      ) : (
        <ul>
          {branches.map((b) => (
            <li
              key={b.name}
              className="flex items-center justify-between gap-3 px-4 py-2.5 border-t"
              style={{ borderColor: theme.border }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                  {b.name}
                </p>
                <p className="text-[11px]" style={{ color: theme.text3 }}>
                  {b.is_default ? "Default branch" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onDelete(b.name)}
                disabled={saving || !canMutate || b.is_default}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.bg4,
                  color: saving || !canMutate || b.is_default ? theme.text3 : theme.danger,
                  opacity: saving || !canMutate || b.is_default ? 0.55 : 1,
                }}
                title={b.is_default ? "Cannot delete default branch" : "Delete branch"}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

