import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Clock3,
  GitCompare,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  Loader2,
} from "lucide-react";
import {
  type StudentRepoSummary,
} from "../api/studentDashboardApi";
import RepoMarkdown from "./RepoMarkdown";
import RepoMonacoViewer from "./repo/RepoMonacoViewer";
import RepoCodeToolbar from "./repo/RepoCodeToolbar";
import { displayLanguageLabel } from "../utils/codeLanguage";
import RepoCreateFileModal from "./repo/RepoCreateFileModal";
import RepoNavTabs from "./repo/RepoNavTabs";
import RepoProjectSidebar from "./repo/RepoProjectSidebar";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme, type ThemeColors } from "../theme";
import { useRepoApi } from "../context/RepoApiContext";

export interface RepoBrowserFile {
  sha: string;
  name: string;
  path: string;
  type: "file" | "dir";
  size: number | null;
  last_commit_message?: string | null;
  last_commit_at?: string | null;
}

interface RepoFileBrowserProps {
  repoId: string;
  isDarkTheme?: boolean;
  repoDisplayName: string;
  giteaPath?: string | null;
  giteaWebUrl?: string | null;
  cloneUrl?: string | null;
  repoDescription?: string | null;
  repoLanguage?: string | null;
  /** Встроен в RepoSectionShell: без шапки, вкладок и сайдбара */
  embedded?: boolean;
  externalSummary?: StudentRepoSummary | null;
  externalSummaryLoading?: boolean;
}

const README_NAMES = ["readme.md", "readme.markdown", "readme", "readme.txt"];

const LANG_COLORS: Record<string, string> = {
  python: "#3572A5",
  javascript: "#f1e05a",
  typescript: "#3178c6",
  java: "#b07219",
  go: "#00ADD8",
  rust: "#dea584",
};

function formatBytes(size: number | null): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isBinaryLikePath(filepath: string): boolean {
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "pdf", "zip", "exe", "dll"].includes(
    ext,
  );
}

function looksBinaryContent(content: string | null): boolean {
  if (!content) return false;
  return content.includes("\u0000");
}

function isLargeTextContent(content: string | null): boolean {
  if (!content) return false;
  return content.length > 1_000_000;
}

function findReadme(entries: RepoBrowserFile[]): RepoBrowserFile | undefined {
  return entries.find(
    (e) => e.type === "file" && README_NAMES.includes(e.name.toLowerCase()),
  );
}

function FileTypeIcon({ name, type }: { name: string; type: "file" | "dir" }) {
  if (type === "dir") {
    return <Folder className="h-4 w-4 shrink-0" style={{ color: "#54aeff" }} />;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md") return <BookOpen className="h-4 w-4 shrink-0" style={{ color: "#a78bfa" }} />;
  if (["json", "yaml", "yml"].includes(ext)) {
    return <FileJson className="h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) {
    return <FileImage className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} />;
  }
  if (["py", "js", "ts", "java", "go", "rs"].includes(ext)) {
    return <FileCode2 className="h-4 w-4 shrink-0" style={{ color: "#60a5fa" }} />;
  }
  return <File className="h-4 w-4 shrink-0" style={{ color: "#94a3b8" }} />;
}

function Breadcrumb({
  theme,
  repoDisplayName,
  pathParts,
  onNavigate,
}: {
  theme: ThemeColors;
  repoDisplayName: string;
  pathParts: string[];
  onNavigate: (path: string) => void;
}) {
  return (
    <nav
      className="flex flex-wrap items-center gap-1.5 text-sm px-4 py-2.5 border-b"
      style={{ borderColor: theme.border, backgroundColor: theme.bg }}
    >
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="font-semibold hover:underline"
        style={{ color: theme.accent2 }}
      >
        {repoDisplayName}
      </button>
      {pathParts.map((part, idx) => {
        const subPath = pathParts.slice(0, idx + 1).join("/");
        const isLast = idx === pathParts.length - 1;
        return (
          <span key={subPath} className="inline-flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" style={{ color: theme.text3 }} />
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNavigate(subPath)}
              className="hover:underline disabled:no-underline disabled:cursor-default"
              style={{ color: isLast ? theme.text : theme.accent2, fontWeight: isLast ? 600 : 400 }}
            >
              {part}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

export default function RepoFileBrowser({
  repoId,
  isDarkTheme = false,
  repoDisplayName,
  giteaPath,
  giteaWebUrl,
  cloneUrl,
  repoDescription,
  repoLanguage,
  embedded = false,
  externalSummary,
  externalSummaryLoading,
}: RepoFileBrowserProps) {
  const theme = getTheme(isDarkTheme);
  const { t, tp, language } = useUserPreferences();
  const api = useRepoApi();
  const sortLocale = language === "en" ? "en" : "ru";

  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState<{ name: string; is_default: boolean }[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);

  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<RepoBrowserFile[]>([]);
  const [dirLoading, setDirLoading] = useState(true);
  const [dirError, setDirError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileHistoryOpen, setFileHistoryOpen] = useState(false);
  const [fileHistoryLoading, setFileHistoryLoading] = useState(false);
  const [fileHistoryError, setFileHistoryError] = useState<string | null>(null);
  const [fileHistoryPage, setFileHistoryPage] = useState(1);
  const [fileHistoryHasMore, setFileHistoryHasMore] = useState(false);
  const [fileHistoryCommits, setFileHistoryCommits] = useState<
    {
      sha: string;
      message: string | null;
      author_name: string | null;
      author_login: string | null;
      authored_at: string | null;
      web_url: string | null;
    }[]
  >([]);
  const [fileBlameOpen, setFileBlameOpen] = useState(false);
  const [fileBlameLoading, setFileBlameLoading] = useState(false);
  const [fileBlameError, setFileBlameError] = useState<string | null>(null);
  const [fileBlameChunks, setFileBlameChunks] = useState<
    {
      sha: string;
      message: string | null;
      author_name: string | null;
      author_login: string | null;
      authored_at: string | null;
      web_url: string | null;
      start_line: number;
      end_line: number;
      line_count: number;
    }[]
  >([]);

  const [readmePath, setReadmePath] = useState<string | null>(null);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);

  const [localFilter, setLocalFilter] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [repoSearchResults, setRepoSearchResults] = useState<{ path: string }[]>([]);
  const [repoSearchLoading, setRepoSearchLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBase, setCompareBase] = useState("main");
  const [compareHead, setCompareHead] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<{
    status: string | null;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    files: {
      filename: string;
      previous_filename?: string | null;
      status: string | null;
      additions: number;
      deletions: number;
      changes: number;
      is_binary?: boolean;
      too_large?: boolean;
      truncated?: boolean;
    }[];
  } | null>(null);

  const [summary, setSummary] = useState<StudentRepoSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const pathParts = useMemo(
    () => (currentPath ? currentPath.split("/").filter(Boolean) : []),
    [currentPath],
  );

  const isRepoHome = !currentPath && !selectedFile;
  const isDirectoryView = !!currentPath && !selectedFile;
  const isFileView = !!selectedFile;

  const langColor = repoLanguage
    ? LANG_COLORS[repoLanguage.toLowerCase()] ?? theme.text2
    : theme.text2;

  const filteredEntries = useMemo(() => {
    const q = localFilter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, localFilter]);

  const pageUrl =
    typeof window !== "undefined" ? window.location.href : null;

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      setBranchLoading(true);
      try {
        const data = await api.getBranches(repoId);
        if (cancelled) return;
        setBranches(data.branches);
        const defaultBranch = data.default_branch || "main";
        setBranch(defaultBranch);
        setCompareBase(defaultBranch);
        setCompareHead(defaultBranch);
      } catch {
        if (!cancelled) {
          setBranches([{ name: "main", is_default: true }]);
          setBranch("main");
          setCompareBase("main");
          setCompareHead("main");
        }
      } finally {
        if (!cancelled) setBranchLoading(false);
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  useEffect(() => {
    const q = repoSearchQuery.trim();
    if (q.length < 1) {
      setRepoSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setRepoSearchLoading(true);
        try {
          const rows = await api.searchFiles(repoId, q, branch);
          if (!cancelled) setRepoSearchResults(rows);
        } catch {
          if (!cancelled) setRepoSearchResults([]);
        } finally {
          if (!cancelled) setRepoSearchLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [repoSearchQuery, branch, repoId]);

  const refreshDirectory = useCallback(async () => {
    setDirLoading(true);
    setDirError(null);
    try {
      const list = await api.getFiles(repoId, currentPath, branch);
      setEntries(
        [...list].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name, sortLocale);
        }),
      );
    } catch (e) {
      setEntries([]);
      setDirError(e instanceof Error ? e.message : t("repo.browser.loadFilesFailed"));
    } finally {
      setDirLoading(false);
    }
  }, [repoId, currentPath, branch, t, sortLocale]);

  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await api.getSummary(repoId, branch);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [repoId, branch]);

  useEffect(() => {
    if (embedded) {
      setSummary(externalSummary ?? null);
      setSummaryLoading(externalSummaryLoading ?? false);
      return;
    }
    void loadSummary();
  }, [embedded, loadSummary, externalSummary, externalSummaryLoading]);

  const onBranchChange = (next: string) => {
    setBranch(next);
    setCompareHead(next);
    setCurrentPath("");
    setSelectedFile(null);
    setFileContent(null);
    setFileHistoryOpen(false);
    setFileHistoryError(null);
    setFileHistoryCommits([]);
    setFileHistoryPage(1);
    setFileHistoryHasMore(false);
    setFileBlameOpen(false);
    setFileBlameError(null);
    setFileBlameChunks([]);
    setReadmePath(null);
    setReadmeContent(null);
    setLocalFilter("");
    setRepoSearchQuery("");
  };

  const openDirectory = (path: string) => {
    setSelectedFile(null);
    setFileContent(null);
    setFileError(null);
    setFileHistoryOpen(false);
    setFileHistoryError(null);
    setFileHistoryCommits([]);
    setFileHistoryPage(1);
    setFileHistoryHasMore(false);
    setFileBlameOpen(false);
    setFileBlameError(null);
    setFileBlameChunks([]);
    setCurrentPath(path);
    setLocalFilter("");
  };

  const openFile = async (filepath: string) => {
    setSelectedFile(filepath);
    setFileHistoryOpen(false);
    setFileHistoryError(null);
    setFileHistoryCommits([]);
    setFileHistoryPage(1);
    setFileHistoryHasMore(false);
    setFileBlameOpen(false);
    setFileBlameError(null);
    setFileBlameChunks([]);
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    try {
      const res = await api.getFileContent(repoId, filepath, branch);
      setFileContent(res.content);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : t("repo.browser.openFileFailed"));
    } finally {
      setFileLoading(false);
    }
  };

  const onEntryClick = (entry: RepoBrowserFile) => {
    if (entry.type === "dir") {
      openDirectory(entry.path);
      return;
    }
    void openFile(entry.path);
  };

  const pickSearchResult = (path: string) => {
    void openFile(path);
  };

  useEffect(() => {
    if (!isRepoHome || dirLoading || dirError) return;
    const readme = findReadme(entries);
    if (!readme) {
      setReadmePath(null);
      setReadmeContent(null);
      return;
    }
    if (readme.path === readmePath && readmeContent != null) return;

    let cancelled = false;
    async function loadReadme() {
      setReadmeLoading(true);
      try {
        const res = await api.getFileContent(repoId, readme.path, branch);
        if (!cancelled) {
          setReadmePath(readme.path);
          setReadmeContent(res.content);
        }
      } catch {
        if (!cancelled) {
          setReadmePath(null);
          setReadmeContent(null);
        }
      } finally {
        if (!cancelled) setReadmeLoading(false);
      }
    }
    void loadReadme();
    return () => {
      cancelled = true;
    };
  }, [isRepoHome, dirLoading, dirError, entries, repoId, branch, readmePath, readmeContent, api]);

  const handleCreateFile = async (payload: {
    path: string;
    content: string;
    message: string;
  }) => {
    if (!api.createFile) throw new Error(t("repo.errors.readOnlyRepository"));
    await api.createFile(repoId, {
      ...payload,
      branch,
    });
    setCurrentPath("");
    setSelectedFile(null);
    await refreshDirectory();
    await loadSummary();
  };

  const runCompare = async () => {
    if (!api.compareRefs) return;
    const baseRef = compareBase.trim();
    const headRef = compareHead.trim();
    if (!baseRef || !headRef) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const res = await api.compareRefs(repoId, baseRef, headRef);
      setCompareResult(res);
    } catch (e) {
      setCompareResult(null);
      setCompareError(e instanceof Error ? e.message : t("repo.browser.compareFailed"));
    } finally {
      setCompareLoading(false);
    }
  };

  const loadFileHistory = useCallback(
    async (filepath: string, nextPage = 1, append = false) => {
      if (!api.getFileHistory) return;
      setFileHistoryLoading(true);
      if (!append) setFileHistoryError(null);
      try {
        const res = await api.getFileHistory(repoId, filepath, branch, nextPage, 20);
        setFileHistoryCommits((prev) => (append ? [...prev, ...(res.commits ?? [])] : (res.commits ?? [])));
        setFileHistoryPage(res.page ?? nextPage);
        setFileHistoryHasMore(!!res.has_more);
      } catch (e) {
        setFileHistoryError(e instanceof Error ? e.message : t("repo.browser.loadFileHistoryFailed"));
      } finally {
        setFileHistoryLoading(false);
      }
    },
    [api, repoId, branch, t],
  );

  const loadFileBlame = useCallback(
    async (filepath: string) => {
      if (!api.getFileBlame) return;
      setFileBlameLoading(true);
      setFileBlameError(null);
      try {
        const res = await api.getFileBlame(repoId, filepath, branch);
        setFileBlameChunks(res.chunks ?? []);
      } catch (e) {
        setFileBlameChunks([]);
        setFileBlameError(e instanceof Error ? e.message : t("repo.browser.loadBlameFailed"));
      } finally {
        setFileBlameLoading(false);
      }
    },
    [api, repoId, branch, t],
  );

  const scrollToReadme = () => {
    document.getElementById("repo-readme")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const defaultNewFilePath = currentPath ? `${currentPath}/` : "";

  const toolbar = (
    <RepoCodeToolbar
      theme={theme}
      repoId={repoId}
      branch={branch}
      branches={branches.length ? branches : [{ name: branch, is_default: true }]}
      branchLoading={branchLoading}
      onBranchChange={onBranchChange}
      localFilter={localFilter}
      onLocalFilterChange={(v) => {
        setLocalFilter(v);
        setRepoSearchQuery(v);
      }}
      repoSearchQuery={repoSearchQuery}
      onRepoSearchQueryChange={setRepoSearchQuery}
      repoSearchResults={repoSearchResults}
      repoSearchLoading={repoSearchLoading}
      onPickSearchResult={pickSearchResult}
      onAddFile={() => setCreateOpen(true)}
      cloneUrl={cloneUrl}
      giteaWebUrl={giteaWebUrl}
      pageUrl={pageUrl}
      readOnly={api.mode === "teacher" || summary?.is_blocked}
      cloneDisabled={api.mode === "teacher" || summary?.is_blocked}
    />
  );

  const navTabs = embedded ? null : (
    <RepoNavTabs
      theme={theme}
      repoId={repoId}
      active="code"
      openIssuesCount={summary?.open_issues_count}
      openPrCount={summary?.open_pr_count}
    />
  );

  const fileTable = (
    <div
      className="rounded-xl border"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {navTabs}
      {toolbar}
      {api.compareRefs ? (
        <div className="border-b px-3 py-2" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
              style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {t("repo.browser.compareRefs")}
            </button>
            {compareResult ? (
              <span className="text-[11px]" style={{ color: theme.text3 }}>
                {tp("repo.browser.compareAheadBehind", {
                  base: compareBase,
                  head: compareHead,
                  ahead: compareResult.ahead_by,
                  behind: compareResult.behind_by,
                })}
              </span>
            ) : null}
          </div>
          {compareOpen ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={compareBase}
                  onChange={(e) => setCompareBase(e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
                >
                  {(branches.length ? branches : [{ name: branch, is_default: true }]).map((b) => (
                    <option key={`base-${b.name}`} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <span className="text-xs" style={{ color: theme.text3 }}>...</span>
                <select
                  value={compareHead}
                  onChange={(e) => setCompareHead(e.target.value)}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
                >
                  {(branches.length ? branches : [{ name: branch, is_default: true }]).map((b) => (
                    <option key={`head-${b.name}`} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void runCompare()}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                  disabled={compareLoading || !compareBase || !compareHead}
                >
                  {compareLoading ? t("repo.browser.comparing") : t("repo.browser.compareRun")}
                </button>
              </div>
              {compareError ? (
                <p className="text-xs" style={{ color: theme.danger }}>{compareError}</p>
              ) : null}
              {compareResult ? (
                <div className="rounded border p-2 text-[11px]" style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}>
                  <p style={{ color: theme.text2 }}>
                    {tp("repo.browser.compareStatusCommits", {
                      status: compareResult.status ?? t("repo.browser.compareUnknownStatus"),
                      commits: compareResult.total_commits,
                    })}
                  </p>
                  <div className="mt-1 space-y-1 max-h-36 overflow-auto">
                    {compareResult.files.slice(0, 30).map((f) => (
                      <div key={`${f.filename}-${f.status ?? ''}`} className="font-mono" style={{ color: theme.text3 }}>
                        {f.status ?? t("repo.browser.compareModified")}{" "}
                        {f.previous_filename ? `${f.previous_filename} -> ${f.filename}` : f.filename}{" "}
                        (+{f.additions}/-{f.deletions})
                        {f.is_binary ? t("repo.browser.compareBinarySuffix") : ""}
                        {f.too_large ? t("repo.browser.compareLargeSuffix") : ""}
                        {f.truncated ? t("repo.browser.compareTruncatedSuffix") : ""}
                      </div>
                    ))}
                    {compareResult.files.length === 0 ? (
                      <p style={{ color: theme.text3 }}>{t("repo.browser.compareNoFileChanges")}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-b-xl">
      {(isDirectoryView || isRepoHome) && pathParts.length > 0 && (
        <Breadcrumb
          theme={theme}
          repoDisplayName={repoDisplayName}
          pathParts={pathParts}
          onNavigate={openDirectory}
        />
      )}
      {isRepoHome && pathParts.length === 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-[11px] border-b"
          style={{ borderColor: theme.border, color: theme.text3 }}
        >
          <GitBranch className="h-3 w-3" style={{ color: theme.success }} />
          <span>
            {tp("repo.browser.entriesInDir", { n: filteredEntries.length })}
            {localFilter ? tp("repo.browser.filteredFrom", { total: entries.length }) : ""}
          </span>
        </div>
      )}

      <div
        className="hidden sm:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
        style={{ borderColor: theme.border, color: theme.text3, backgroundColor: theme.bg }}
      >
        <span>{t("repo.browser.colName")}</span>
        <span>{t("repo.browser.colLastCommit")}</span>
        <span className="text-right">{t("repo.browser.colUpdated")}</span>
      </div>
      <div
        className="sm:hidden grid grid-cols-[1fr_auto] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
        style={{ borderColor: theme.border, color: theme.text3, backgroundColor: theme.bg }}
      >
        <span>{t("repo.browser.colName")}</span>
        <span className="text-right">{t("repo.browser.colUpdated")}</span>
      </div>

      <div>
        {dirLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("repo.browser.loading")}
          </div>
        ) : dirError ? (
          <p className="px-4 py-10 text-sm" style={{ color: theme.danger }}>
            {dirError}
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="px-4 py-10 text-sm text-center" style={{ color: theme.text2 }}>
            {localFilter
              ? t("repo.browser.noMatchesInFolder")
              : isRepoHome
                ? t("repo.browser.emptyRepo")
                : t("repo.browser.emptyFolder")}
          </p>
        ) : (
          filteredEntries.map((entry) => {
            const commitMsg = entry.last_commit_message?.trim() || "—";
            const updated =
              entry.last_commit_at != null ? formatRelativeTime(entry.last_commit_at) : "—";
            return (
              <button
                key={`${entry.type}:${entry.path}`}
                type="button"
                onClick={() => onEntryClick(entry)}
                className="grid w-full sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] grid-cols-[1fr_auto] gap-3 items-center px-4 py-2.5 text-left text-sm border-t transition-colors"
                style={{ borderColor: theme.border, color: theme.text }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.hoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FileTypeIcon name={entry.name} type={entry.type} />
                  <span
                    className="truncate font-medium"
                    style={{ color: entry.type === "dir" ? theme.text : theme.accent2 }}
                  >
                    {entry.name}
                  </span>
                </span>
                <span
                  className="hidden sm:block truncate text-xs"
                  style={{ color: theme.text2 }}
                  title={commitMsg}
                >
                  {commitMsg}
                </span>
                <span className="text-xs text-right tabular-nums shrink-0" style={{ color: theme.text3 }}>
                  {updated}
                </span>
              </button>
            );
          })
        )}
      </div>
      </div>
    </div>
  );

  const readmeSection =
    isRepoHome && (readmeLoading || readmeContent) ? (
      <section
        id="repo-readme"
        className="rounded-xl border overflow-hidden scroll-mt-4"
        style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{
            borderColor: theme.border,
            background: `linear-gradient(90deg, ${theme.accent}22 0%, transparent 55%)`,
          }}
        >
          <BookOpen className="h-4 w-4" style={{ color: theme.accent2 }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
              README
            </h2>
            <p className="text-[11px] font-mono" style={{ color: theme.text3 }}>
              {readmePath}
            </p>
          </div>
        </div>
        <div className="px-5 py-5">
          {readmeLoading ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("repo.browser.loadingReadme")}
            </div>
          ) : readmeContent ? (
            <RepoMarkdown content={readmeContent} theme={theme} />
          ) : null}
        </div>
      </section>
    ) : null;

  const isMarkdownFile = !!selectedFile && /\.(md|markdown)$/i.test(selectedFile);
  const binaryByContent = looksBinaryContent(fileContent);
  const veryLargeContent = isLargeTextContent(fileContent);

  const fileViewer = isFileView ? (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {navTabs}
      {toolbar}
      <Breadcrumb
        theme={theme}
        repoDisplayName={repoDisplayName}
        pathParts={selectedFile!.split("/").filter(Boolean)}
        onNavigate={(path) => {
          if (!path) {
            setSelectedFile(null);
            setFileContent(null);
            setCurrentPath("");
            return;
          }
          setSelectedFile(null);
          setFileContent(null);
          setCurrentPath(path);
        }}
      />
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b text-xs"
        style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
      >
        <span className="font-mono truncate" style={{ color: theme.text }}>
          {selectedFile}
        </span>
        <div className="flex items-center gap-2">
          {api.getFileHistory ? (
            <button
              type="button"
              onClick={() => {
                const next = !fileHistoryOpen;
                setFileHistoryOpen(next);
                if (next && selectedFile && fileHistoryCommits.length === 0 && !fileHistoryLoading) {
                  void loadFileHistory(selectedFile, 1, false);
                }
              }}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
              style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
            >
              <Clock3 className="h-3 w-3" />
              {t("repo.browser.history")}
            </button>
          ) : null}
          {api.getFileBlame ? (
            <button
              type="button"
              onClick={() => {
                const next = !fileBlameOpen;
                setFileBlameOpen(next);
                if (next && selectedFile && fileBlameChunks.length === 0 && !fileBlameLoading) {
                  void loadFileBlame(selectedFile);
                }
              }}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
              style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg3 }}
            >
              <FileText className="h-3 w-3" />
              {t("repo.browser.blame")}
            </button>
          ) : null}
          <span style={{ color: theme.text3 }}>{displayLanguageLabel(selectedFile!)}</span>
        </div>
      </div>
      {fileHistoryOpen ? (
        <div className="border-b px-4 py-2.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
          {fileHistoryLoading && fileHistoryCommits.length === 0 ? (
            <div className="flex items-center gap-2" style={{ color: theme.text3 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("repo.browser.loadingFileHistory")}
            </div>
          ) : fileHistoryError ? (
            <p style={{ color: theme.danger }}>{fileHistoryError}</p>
          ) : fileHistoryCommits.length === 0 ? (
            <p style={{ color: theme.text3 }}>{t("repo.browser.noFileHistory")}</p>
          ) : (
            <div className="space-y-1.5">
              {fileHistoryCommits.map((row) => (
                <div
                  key={`${row.sha}-${row.authored_at ?? ""}`}
                  className="rounded border px-2 py-1.5"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono" style={{ color: theme.accent2 }}>
                      {row.sha.slice(0, 12)}
                    </span>
                    <span style={{ color: theme.text }}>{row.message ?? t("repo.browser.commitFallback")}</span>
                  </div>
                  <p className="mt-0.5" style={{ color: theme.text3 }}>
                    {row.author_name ?? row.author_login ?? t("repo.browser.userFallback")}
                    {row.authored_at ? ` · ${formatRelativeTime(row.authored_at)}` : ""}
                  </p>
                </div>
              ))}
              {fileHistoryHasMore ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedFile || fileHistoryLoading) return;
                    void loadFileHistory(selectedFile, fileHistoryPage + 1, true);
                  }}
                  className="rounded border px-2 py-1 text-[11px]"
                  style={{ borderColor: theme.border, color: theme.text2 }}
                  disabled={fileHistoryLoading}
                >
                  {fileHistoryLoading ? t("repo.browser.loadingMore") : t("repo.commits.loadMore")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      {fileBlameOpen ? (
        <div className="border-b px-4 py-2.5 text-xs" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
          {fileBlameLoading && fileBlameChunks.length === 0 ? (
            <div className="flex items-center gap-2" style={{ color: theme.text3 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("repo.browser.loadingBlame")}
            </div>
          ) : fileBlameError ? (
            <p style={{ color: theme.danger }}>{fileBlameError}</p>
          ) : fileBlameChunks.length === 0 ? (
            <p style={{ color: theme.text3 }}>{t("repo.browser.noBlame")}</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-auto">
              {fileBlameChunks.slice(0, 120).map((row) => (
                <div
                  key={`${row.sha}-${row.start_line}-${row.end_line}`}
                  className="rounded border px-2 py-1.5"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono" style={{ color: theme.text3 }}>
                      L{row.start_line}
                      {row.end_line > row.start_line ? `-L${row.end_line}` : ""}
                    </span>
                    <span className="font-mono" style={{ color: theme.accent2 }}>
                      {row.sha ? row.sha.slice(0, 12) : t("repo.browser.unknownCommit")}
                    </span>
                    <span style={{ color: theme.text }}>{row.message ?? t("repo.browser.commitFallback")}</span>
                  </div>
                  <p className="mt-0.5" style={{ color: theme.text3 }}>
                    {row.author_name ?? row.author_login ?? t("repo.browser.userFallback")}
                    {row.authored_at ? ` · ${formatRelativeTime(row.authored_at)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      <div className="overflow-auto max-h-[min(70vh,640px)]">
        {fileLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("repo.browser.readingFile")}
          </div>
        ) : fileError ? (
          <p className="px-4 py-8 text-sm" style={{ color: theme.danger }}>
            {fileError}
          </p>
        ) : isMarkdownFile ? (
          <div className="px-5 py-5">
            <RepoMarkdown content={fileContent ?? ""} theme={theme} />
          </div>
        ) : isBinaryLikePath(selectedFile!) || binaryByContent ? (
          <p className="px-4 py-8 text-sm" style={{ color: theme.text2 }}>
            {t("repo.browser.binaryPreviewUnavailable")}
          </p>
        ) : veryLargeContent ? (
          <p className="px-4 py-8 text-sm" style={{ color: theme.text2 }}>
            {t("repo.browser.fileTooLargePreview")}
          </p>
        ) : (
          <RepoMonacoViewer
            repoId={repoId}
            filepath={selectedFile!}
            content={fileContent ?? ""}
            isDarkTheme={isDarkTheme}
            theme={theme}
          />
        )}
      </div>
    </div>
  ) : null;

  const browserBody = (
    <div className={embedded ? "flex flex-col gap-4" : "flex-1 min-w-0 flex flex-col gap-4"}>
      {!embedded && isRepoHome && (
        <header
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
        >
          <div
            className="h-1 w-full"
            style={{
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2}, ${theme.success})`,
            }}
          />
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <FolderGit2 className="h-5 w-5 shrink-0" style={{ color: theme.accent2 }} />
              <h1 className="text-xl font-bold truncate" style={{ color: theme.text }}>
                {repoDisplayName}
              </h1>
            </div>
            {giteaPath ? (
              <p className="text-sm font-mono truncate mt-1" style={{ color: theme.text2 }}>
                {giteaPath}
              </p>
            ) : null}
          </div>
        </header>
      )}

      {isFileView ? fileViewer : fileTable}
      {readmeSection}

      <RepoCreateFileModal
        theme={theme}
        open={createOpen}
        defaultPath={defaultNewFilePath}
        branch={branch}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateFile}
      />
    </div>
  );

  if (embedded) {
    return browserBody;
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
      {browserBody}
      <RepoProjectSidebar
        theme={theme}
        loading={summaryLoading}
        summary={summary}
        repoId={repoId}
        activeBranch={branch}
        onGoToReadme={scrollToReadme}
        onOpenLicense={(path) => void openFile(path)}
      />
    </div>
  );
}

