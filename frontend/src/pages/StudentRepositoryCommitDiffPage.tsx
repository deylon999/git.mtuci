import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRepoApi } from "../context/RepoApiContext";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getTheme } from "../theme";

type DiffLineKind = "add" | "del" | "hunk" | "file" | "meta" | "ctx";

function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("diff --git")) return "file";
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

interface StudentRepositoryCommitDiffPageProps {
  isDarkTheme?: boolean;
}

export default function StudentRepositoryCommitDiffPage({ isDarkTheme = false }: StudentRepositoryCommitDiffPageProps) {
  const theme = getTheme(isDarkTheme);
  const { t } = useUserPreferences();
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
        if (!cancelled) setError(e instanceof Error ? e.message : t("repo.commitDiff.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, repoId, sha, t]);

  return (
    <div className="flex flex-col gap-3">
      <Link
        to={`/repositories/${repoId}/commits`}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-90"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text2 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("repo.commitDiff.backToCommits")}
      </Link>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <p className="text-sm font-semibold" style={{ color: theme.text }}>
            {t("repo.commitDiff.title")}
          </p>
          <p className="text-xs font-mono mt-1" style={{ color: theme.text3 }}>
            {sha}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("repo.commitDiff.loading")}
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm" style={{ color: theme.danger }}>
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ backgroundColor: theme.bg }}>
            {diff ? (
              <pre className="min-w-max py-2 text-xs leading-relaxed font-mono">
                {diff.split("\n").map((line, index) => {
                  const kind = diffLineKind(line);
                  const style =
                    kind === "add"
                      ? { backgroundColor: `${theme.success}1f`, color: theme.text }
                      : kind === "del"
                        ? { backgroundColor: `${theme.danger}1f`, color: theme.text }
                        : kind === "hunk"
                          ? { backgroundColor: `${theme.accent}14`, color: theme.accent2 }
                          : kind === "file"
                            ? { color: theme.text, fontWeight: 600, borderTop: index > 0 ? `1px solid ${theme.border}` : undefined }
                            : kind === "meta"
                              ? { color: theme.text3 }
                              : { color: theme.text2 };
                  return (
                    <div key={index} className="px-4" style={style}>
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            ) : (
              <p className="px-4 py-4 text-xs" style={{ color: theme.text2 }}>
                —
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

