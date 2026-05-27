import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRepoApi } from "../context/RepoApiContext";
import { getTheme } from "../theme";

interface StudentRepositoryCommitDiffPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryCommitDiffPage({ isDarkTheme = false }: StudentRepositoryCommitDiffPageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId, sha } = useParams<{ repoId: string; sha: string }>();
  const api = useRepoApi();
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId || !sha) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getCommitDiff(repoId, sha)
      .then((res) => {
        if (!cancelled) setDiff(res.diff || "");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load diff");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, sha]);

  return (
    <div className="flex flex-col gap-3">
      <Link
        to={`/repositories/${repoId}/commits`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-90"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to commits
      </Link>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <p className="text-sm font-semibold" style={{ color: theme.text }}>
            Commit diff
          </p>
          <p className="text-xs font-mono mt-1" style={{ color: theme.text3 }}>
            {sha}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm" style={{ color: theme.danger }}>
            {error}
          </div>
        ) : (
          <pre
            className="px-4 py-4 overflow-auto text-xs leading-relaxed"
            style={{ color: theme.text, backgroundColor: theme.bg }}
          >
            {diff || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}

