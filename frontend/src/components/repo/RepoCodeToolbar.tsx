import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { getStudentRepoCloneInfo, type StudentRepoCloneInfo } from "../../api/studentDashboardApi";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";

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
}: RepoCodeToolbarProps) {
  const { t } = useUserPreferences();
  const [branchOpen, setBranchOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneInfo, setCloneInfo] = useState<StudentRepoCloneInfo | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const cloneBtnRef = useRef<HTMLButtonElement>(null);
  const cloneMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
      const target = e.target as Node;
      if (
        cloneOpen &&
        !cloneBtnRef.current?.contains(target) &&
        !cloneMenuRef.current?.contains(target)
      ) {
        setCloneOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [cloneOpen]);

  useEffect(() => {
    if (!cloneOpen) {
      setCloneInfo(null);
      return;
    }
    if (cloneBtnRef.current) {
      setMenuRect(cloneBtnRef.current.getBoundingClientRect());
    }
    let cancelled = false;
    setCloneLoading(true);
    getStudentRepoCloneInfo(repoId)
      .then((data) => {
        if (!cancelled) setCloneInfo(data);
      })
      .catch(() => {
        if (!cancelled && cloneUrl) {
          setCloneInfo({
            clone_url: cloneUrl,
            git_clone_command: `git clone ${cloneUrl}`,
            auth_required: false,
            note: t("repo.clone.tokenNote"),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCloneLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cloneOpen, repoId, cloneUrl]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error(t("repo.errors.copyFailed"));
    }
    setCloneOpen(false);
  };

  const showRepoSearch =
    searchFocused && repoSearchQuery.trim().length >= 1;

  const cloneMenu =
    cloneOpen && menuRect
      ? createPortal(
          <div
            ref={cloneMenuRef}
            className="fixed z-[9999] w-[min(100vw-1.5rem,22rem)] rounded-lg border py-1 shadow-2xl"
            style={{
              top: menuRect.bottom + 4,
              right: Math.max(8, window.innerWidth - menuRect.right),
              backgroundColor: theme.bg3,
              borderColor: theme.border,
            }}
          >
            {cloneLoading ? (
              <p className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: theme.text2 }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("repo.clone.preparing")}
              </p>
            ) : cloneInfo ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(cloneInfo.git_clone_command, t("repo.clone.cloneCopied"))
                  }
                  className="w-full px-3 py-2 text-left text-xs hover:opacity-90"
                  style={{ color: theme.text }}
                >
                  <Copy className="inline h-3 w-3 mr-1.5" />
                  {cloneInfo.auth_required
                    ? t("repo.clone.copyWithToken")
                    : t("repo.clone.copyHttps")}
                </button>
                <p
                  className="px-3 pb-2 text-[10px] font-mono break-all leading-snug max-h-24 overflow-y-auto"
                  style={{ color: theme.text3 }}
                >
                  {cloneInfo.git_clone_command}
                </p>
                {cloneInfo.note ? (
                  <p className="px-3 pb-2 text-[10px] leading-snug" style={{ color: theme.text3 }}>
                    {cloneInfo.note}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="px-3 py-2 text-xs" style={{ color: theme.text3 }}>
                {t("repo.clone.giteaUnavailable")}
              </p>
            )}
            {pageUrl ? (
              <button
                type="button"
                onClick={() => void copyText(pageUrl, t("repo.clone.pageLinkCopied"))}
                className="w-full px-3 py-2 text-left text-xs hover:opacity-90 border-t"
                style={{ color: theme.text2, borderColor: theme.border }}
              >
                <Link2 className="inline h-3 w-3 mr-1.5" />
                {t("repo.clone.pageLink")}
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
                {t("repo.clone.openGitea")}
              </a>
            ) : null}
          </div>,
          document.body,
        )
      : null;

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
                {b.is_default ? " (default)" : ""}
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
        onClick={onAddFile}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shrink-0"
        style={{
          borderColor: `${theme.success}55`,
          backgroundColor: `${theme.success}14`,
          color: theme.success,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" />
        {t("repo.toolbar.newFile")}
      </button>

      <div className="relative shrink-0">
        <button
          ref={cloneBtnRef}
          type="button"
          onClick={() => setCloneOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: theme.border, backgroundColor: theme.bg3, color: theme.text }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("repo.clone.clone")}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
        {cloneMenu}
      </div>
    </div>
  );
}
