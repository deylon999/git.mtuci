import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FilePlus,
  GitBranch,
  Loader2,
  Search,
} from "lucide-react";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import RepoCloneMenuButton from "./RepoCloneMenuButton";

export interface RepoCodeToolbarProps {
  theme: ThemeColors;
  repoId: string;
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
  readOnly?: boolean;
  cloneDisabled?: boolean;
}

export default function RepoCodeToolbar({
  theme,
  repoId,
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
  readOnly,
  cloneDisabled,
}: RepoCodeToolbarProps) {
  const { t } = useUserPreferences();
  const [branchOpen, setBranchOpen] = useState(false);
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

  const showRepoSearch =
    searchFocused && repoSearchQuery.trim().length >= 1;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b relative z-20"
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
            className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border py-1 shadow-lg max-h-48 overflow-y-auto"
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
                className="w-full px-3 py-1.5 text-left text-xs hover:opacity-90 truncate"
                style={{
                  color: b.name === branch ? theme.accent2 : theme.text,
                  fontWeight: b.name === branch ? 600 : 400,
                }}
              >
                {b.name}
                {b.is_default ? t("repo.commits.defaultSuffix") : ""}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={searchRef} className="relative flex-1 min-w-[140px] max-w-md">
        <Search
          className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none"
          style={{ color: theme.text3 }}
        />
        <input
          type="search"
          value={localFilter}
          onChange={(e) => {
            onLocalFilterChange(e.target.value);
            onRepoSearchQueryChange(e.target.value);
          }}
          onFocus={() => setSearchFocused(true)}
          placeholder={t("repo.clone.searchFiles")}
          className="w-full rounded-lg border pl-8 pr-2 py-1.5 text-xs outline-none"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.bg3,
            color: theme.text,
          }}
        />
        {showRepoSearch ? (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border shadow-xl overflow-hidden max-h-56 overflow-y-auto"
            style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
          >
            {repoSearchLoading ? (
              <p className="px-3 py-2 text-xs flex items-center gap-2" style={{ color: theme.text3 }}>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("repo.clone.searching")}
              </p>
            ) : repoSearchResults.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: theme.text3 }}>
                {t("repo.clone.notFound")}
              </p>
            ) : (
              <ul>
                {repoSearchResults.map((r) => (
                  <li key={r.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onPickSearchResult(r.path);
                        setSearchFocused(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs font-mono truncate hover:opacity-90"
                      style={{ color: theme.text }}
                    >
                      {r.path}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={readOnly}
        onClick={onAddFile}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shrink-0"
        style={{
          borderColor: `${theme.success}55`,
          backgroundColor: `${theme.success}14`,
          color: readOnly ? theme.text3 : theme.success,
          opacity: readOnly ? 0.55 : 1,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" />
        {t("repo.toolbar.newFile")}
      </button>

      <RepoCloneMenuButton
        theme={theme}
        repoId={repoId}
        cloneUrl={cloneUrl}
        giteaWebUrl={giteaWebUrl}
        pageUrl={pageUrl}
        disabled={cloneDisabled}
        size="md"
      />
    </div>
  );
}
