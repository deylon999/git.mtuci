import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
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
  createStudentRepoFile,
  getStudentRepoBranches,
  getStudentRepoFileContent,
  getStudentRepoFiles,
  getStudentRepoSummary,
  searchStudentRepoFiles,
  type StudentRepoSummary,
} from "../api/studentDashboardApi";
import RepoMarkdown from "./RepoMarkdown";
import RepoCodeToolbar from "./repo/RepoCodeToolbar";
import RepoCreateFileModal from "./repo/RepoCreateFileModal";
import RepoNavTabs from "./repo/RepoNavTabs";
import RepoProjectSidebar from "./repo/RepoProjectSidebar";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme, type ThemeColors } from "../theme";

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

function guessHighlightLanguage(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    py: "Python",
    js: "JavaScript",
    ts: "TypeScript",
    md: "Markdown",
    json: "JSON",
    go: "Go",
    rs: "Rust",
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : "Text");
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
}: RepoFileBrowserProps) {
  const theme = getTheme(isDarkTheme);

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

  const [readmePath, setReadmePath] = useState<string | null>(null);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);

  const [localFilter, setLocalFilter] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [repoSearchResults, setRepoSearchResults] = useState<{ path: string }[]>([]);
  const [repoSearchLoading, setRepoSearchLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);

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
        const data = await getStudentRepoBranches(repoId);
        if (cancelled) return;
        setBranches(data.branches);
        setBranch(data.default_branch || "main");
      } catch {
        if (!cancelled) {
          setBranches([{ name: "main", is_default: true }]);
          setBranch("main");
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
          const rows = await searchStudentRepoFiles(repoId, q, branch);
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
      const list = await getStudentRepoFiles(repoId, currentPath, branch);
      setEntries(
        [...list].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name, "ru");
        }),
      );
    } catch (e) {
      setEntries([]);
      setDirError(e instanceof Error ? e.message : "Не удалось загрузить файлы");
    } finally {
      setDirLoading(false);
    }
  }, [repoId, currentPath, branch]);

  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await getStudentRepoSummary(repoId, branch);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [repoId, branch]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const onBranchChange = (next: string) => {
    setBranch(next);
    setCurrentPath("");
    setSelectedFile(null);
    setFileContent(null);
    setReadmePath(null);
    setReadmeContent(null);
    setLocalFilter("");
    setRepoSearchQuery("");
  };

  const openDirectory = (path: string) => {
    setSelectedFile(null);
    setFileContent(null);
    setFileError(null);
    setCurrentPath(path);
    setLocalFilter("");
  };

  const openFile = async (filepath: string) => {
    setSelectedFile(filepath);
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    try {
      const res = await getStudentRepoFileContent(repoId, filepath, branch);
      setFileContent(res.content);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Не удалось открыть файл");
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
        const res = await getStudentRepoFileContent(repoId, readme.path, branch);
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
  }, [isRepoHome, dirLoading, dirError, entries, repoId, branch, readmePath, readmeContent]);

  const handleCreateFile = async (payload: {
    path: string;
    content: string;
    message: string;
  }) => {
    await createStudentRepoFile(repoId, {
      ...payload,
      branch,
    });
    setCurrentPath("");
    setSelectedFile(null);
    await refreshDirectory();
    await loadSummary();
  };

  const scrollToReadme = () => {
    document.getElementById("repo-readme")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const defaultNewFilePath = currentPath ? `${currentPath}/` : "";

  const toolbar = (
    <RepoCodeToolbar
      theme={theme}
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
    />
  );

  const navTabs = (
    <RepoNavTabs
      theme={theme}
      repoId={repoId}
      active="code"
      giteaLinks={summary?.gitea_links}
      openIssuesCount={summary?.open_issues_count}
      openPrCount={summary?.open_pr_count}
    />
  );

  const fileTable = (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {navTabs}
      {toolbar}
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
            {filteredEntries.length} в каталоге
            {localFilter ? ` (отфильтровано из ${entries.length})` : ""}
          </span>
        </div>
      )}

      <div
        className="hidden sm:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
        style={{ borderColor: theme.border, color: theme.text3, backgroundColor: theme.bg }}
      >
        <span>Имя</span>
        <span>Последний коммит</span>
        <span className="text-right">Обновлено</span>
      </div>
      <div
        className="sm:hidden grid grid-cols-[1fr_auto] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
        style={{ borderColor: theme.border, color: theme.text3, backgroundColor: theme.bg }}
      >
        <span>Имя</span>
        <span className="text-right">Обновлено</span>
      </div>

      <div>
        {dirLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Загрузка…
          </div>
        ) : dirError ? (
          <p className="px-4 py-10 text-sm" style={{ color: theme.danger }}>
            {dirError}
          </p>
        ) : filteredEntries.length === 0 ? (
          <p className="px-4 py-10 text-sm text-center" style={{ color: theme.text2 }}>
            {localFilter ? "Нет совпадений в этой папке" : isRepoHome ? "Репозиторий пуст" : "Папка пуста"}
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
              Загружаем README…
            </div>
          ) : readmeContent ? (
            <RepoMarkdown content={readmeContent} theme={theme} />
          ) : null}
        </div>
      </section>
    ) : null;

  const isMarkdownFile = !!selectedFile && /\.(md|markdown)$/i.test(selectedFile);

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
        <span style={{ color: theme.text3 }}>{guessHighlightLanguage(selectedFile!)}</span>
      </div>
      <div className="overflow-auto max-h-[min(70vh,640px)]">
        {fileLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Читаем файл…
          </div>
        ) : fileError ? (
          <p className="px-4 py-8 text-sm" style={{ color: theme.danger }}>
            {fileError}
          </p>
        ) : isMarkdownFile ? (
          <div className="px-5 py-5">
            <RepoMarkdown content={fileContent ?? ""} theme={theme} />
          </div>
        ) : (
          <CodeBlock content={fileContent ?? ""} theme={theme} />
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
      {isRepoHome && (
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

function CodeBlock({ content, theme }: { content: string; theme: ThemeColors }) {
  const lines = content.split("\n");
  return (
    <pre className="flex text-xs font-mono leading-relaxed" style={{ color: theme.text }}>
      <code className="flex min-w-0 flex-1">
        <span
          className="select-none shrink-0 py-4 pr-3 pl-4 text-right border-r"
          style={{ color: theme.text3, borderColor: theme.border, backgroundColor: theme.bg }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </span>
        <span className="py-4 px-4 whitespace-pre-wrap break-words flex-1">
          {lines.map((line, i) => (
            <div key={i}>{line || "\u00a0"}</div>
          ))}
        </span>
      </code>
    </pre>
  );
}
