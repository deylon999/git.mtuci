import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  FilePlus,
  GitBranch,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import type { ThemeColors } from "../../theme";

export interface RepoCodeToolbarProps {
  theme: ThemeColors;
  branch: string;
  branches: { name: string; is_default: boolean }[];
  branchLoading?: boolean;
  onBranchChange: (branch: string) => void;
  localFilter: string;
  onLocalFilterChange: (value: string) => void;
  repoSearchQuery: string;
  onRepoSearchQueryChange: (value: string) => void;
  repoSearchResults: { path: string }[];
  repoSearchLoading?: boolean;
  onPickSearchResult: (path: string) => void;
  onAddFile: () => void;
  cloneUrl?: string | null;
  giteaWebUrl?: string | null;
  pageUrl?: string | null;
}

export default function RepoCodeToolbar({
  theme,
  branch,
  branches,
  branchLoading,
  onBranchChange,
  localFilter,
  onLocalFilterChange,
  repoSearchQuery,
  onRepoSearchQueryChange,
  repoSearchResults,
  repoSearchLoading,
  onPickSearchResult,
  onAddFile,
  cloneUrl,
  giteaWebUrl,
  pageUrl,
}: RepoCodeToolbarProps) {
  const [branchOpen, setBranchOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Не удалось скопировать");
    }
    setCloneOpen(false);
  };

  const showRepoSearch =
    searchFocused && repoSearchQuery.trim().length >= 1;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b"
      style={{ borderColor: theme.border, backgroundColor: theme.bg4 }}
    >
      <div className="relative">
        <button
          type="button"
          disabled={branchLoading}
          onClick={() => setBranchOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-w-[100px] justify-between"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
        >
          <span className="inline-flex items-center gap-1 truncate">
            <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: theme.success }} />
            {branchLoading ? "…" : branch}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
        {branchOpen ? (
          <div
            className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border py-1 shadow-lg max-h-48 overflow-y-auto"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            {branches.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => {
                  onBranchChange(b.name);
                  setBranchOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:opacity-90"
                style={{
                  color: b.name === branch ? theme.accent2 : theme.text,
                  backgroundColor: b.name === branch ? `${theme.accent}18` : "transparent",
                }}
              >
                <GitBranch className="h-3 w-3 shrink-0" />
                {b.name}
                {b.is_default ? (
                  <span className="ml-auto text-[10px]" style={{ color: theme.text3 }}>
                    default
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={searchRef} className="relative flex-1 min-w-[180px] max-w-md">
        <Search
          className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none"
          style={{ color: theme.text3 }}
        />
        <input
          type="search"
          value={localFilter}
          onChange={(e) => onLocalFilterChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          placeholder="Поиск файла…"
          className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.bg3,
            color: theme.text,
          }}
        />
        {showRepoSearch ? (
          <div
            className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border shadow-xl overflow-hidden"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            <div
              className="px-2 py-1.5 border-b flex items-center gap-2"
              style={{ borderColor: theme.border }}
            >
              <input
                type="text"
                value={repoSearchQuery}
                onChange={(e) => onRepoSearchQueryChange(e.target.value)}
                placeholder="Перейти к файлу во всём репозитории…"
                className="flex-1 bg-transparent text-xs outline-none py-1"
                style={{ color: theme.text }}
                autoFocus
              />
              {repoSearchLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: theme.text3 }} />
              ) : null}
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {repoSearchResults.length === 0 && !repoSearchLoading ? (
                <li className="px-3 py-2 text-xs" style={{ color: theme.text3 }}>
                  Ничего не найдено
                </li>
              ) : (
                repoSearchResults.map((item) => (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onPickSearchResult(item.path);
                        setSearchFocused(false);
                        onLocalFilterChange("");
                        onRepoSearchQueryChange("");
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-mono truncate hover:opacity-90"
                      style={{ color: theme.accent2 }}
                    >
                      {item.path}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onAddFile}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shrink-0"
        style={{
          borderColor: `${theme.success}55`,
          backgroundColor: `${theme.success}14`,
          color: theme.success,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" />
        Добавить
      </button>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setCloneOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
        >
          <Copy className="h-3.5 w-3.5" />
          Клонировать
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
        {cloneOpen ? (
          <div
            className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-lg border py-1 shadow-lg"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            {cloneUrl ? (
              <button
                type="button"
                onClick={() => void copyText(cloneUrl, "URL клонирования скопирован")}
                className="w-full px-3 py-2 text-left text-xs hover:opacity-90"
                style={{ color: theme.text }}
              >
                HTTPS — клонировать
              </button>
            ) : null}
            {pageUrl ? (
              <button
                type="button"
                onClick={() => void copyText(pageUrl, "Ссылка на страницу скопирована")}
                className="w-full px-3 py-2 text-left text-xs hover:opacity-90"
                style={{ color: theme.text }}
              >
                <Link2 className="inline h-3 w-3 mr-1.5" />
                Копировать ссылку
              </button>
            ) : null}
            {giteaWebUrl ? (
              <a
                href={giteaWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 w-full px-3 py-2 text-left text-xs hover:opacity-90"
                style={{ color: theme.accent2 }}
                onClick={() => setCloneOpen(false)}
              >
                <ExternalLink className="h-3 w-3" />
                Открыть в Gitea
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
