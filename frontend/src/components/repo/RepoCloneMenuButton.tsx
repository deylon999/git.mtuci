import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { getStudentRepoCloneInfo, type StudentRepoCloneInfo } from "../../api/studentDashboardApi";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";

interface RepoCloneMenuButtonProps {
  theme: ThemeColors;
  repoId: string;
  cloneUrl?: string | null;
  giteaWebUrl?: string | null;
  pageUrl?: string | null;
  disabled?: boolean;
  size?: "sm" | "md";
}

export default function RepoCloneMenuButton({
  theme,
  repoId,
  cloneUrl,
  giteaWebUrl,
  pageUrl,
  disabled,
  size = "md",
}: RepoCloneMenuButtonProps) {
  const { t } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [cloneInfo, setCloneInfo] = useState<StudentRepoCloneInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (open && !btnRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCloneInfo(null);
      return;
    }
    if (btnRef.current) setMenuRect(btnRef.current.getBoundingClientRect());
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, repoId, cloneUrl, t]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error(t("repo.errors.copyFailed"));
    }
    setOpen(false);
  };

  const padding = size === "sm" ? "px-2.5 py-1.5" : "px-3 py-1.5";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const textSize = size === "sm" ? "text-xs" : "text-xs";

  const menu =
    open && menuRect
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] w-[min(100vw-1.5rem,22rem)] rounded-lg border py-1 shadow-2xl"
            style={{
              top: menuRect.bottom + 4,
              right: Math.max(8, window.innerWidth - menuRect.right),
              backgroundColor: theme.bg3,
              borderColor: theme.border,
            }}
          >
            {loading ? (
              <p className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: theme.text2 }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("repo.clone.preparing")}
              </p>
            ) : cloneInfo ? (
              <>
                <button
                  type="button"
                  onClick={() => void copyText(cloneInfo.git_clone_command, t("repo.clone.cloneCopied"))}
                  className="w-full px-3 py-2 text-left text-xs hover:opacity-90"
                  style={{ color: theme.text }}
                >
                  <Copy className="inline h-3 w-3 mr-1.5" />
                  {cloneInfo.auth_required ? t("repo.clone.copyWithToken") : t("repo.clone.copyHttps")}
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
                onClick={() => setOpen(false)}
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
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border ${padding} ${textSize} font-medium transition-opacity`}
        style={{
          borderColor: theme.border,
          backgroundColor: theme.bg3,
          color: disabled ? theme.text3 : theme.text,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <Copy className={iconSize} />
        {t("repo.clone.clone")}
        <ChevronDown className={`opacity-70 ${size === "sm" ? "h-3 w-3" : "h-3 w-3"}`} />
      </button>
      {menu}
    </div>
  );
}

