import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  FileText,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RotateCcw,
  Tag,
  XCircle,
} from "lucide-react";
import RepoSettingsPanel from "../components/repo/RepoSettingsPanel";
import RepoStateTabs from "../components/repo/RepoStateTabs";
import { useStudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import RepoMarkdown from "../components/RepoMarkdown";
import {
  type StudentRepoIssue,
  type StudentRepoPull,
  type StudentRepoPullCheckItem,
  type StudentRepoPullDetailBundle,
  type StudentRepoPullDiscussionComment,
  type StudentRepoPullFile,
  type StudentRepoPullThread,
  type StudentRepoWikiPage,
} from "../api/studentDashboardApi";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme, type ThemeColors } from "../theme";
import type { RepoNavTabId } from "../components/repo/RepoNavTabs";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { useRepoApi } from "../context/RepoApiContext";

interface StudentRepositorySectionPageProps {
  isDarkTheme?: boolean;
  section: RepoNavTabId;
}

function PanelCard({ theme, children }: { theme: ThemeColors; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
    >
      {children}
    </div>
  );
}

function EmptyState({
  theme,
  icon,
  title,
  hint,
}: {
  theme: ThemeColors;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${theme.accent}18`, color: theme.accent2 }}
      >
        {icon}
      </div>
      <p className="text-sm font-semibold" style={{ color: theme.text }}>
        {title}
      </p>
      <p className="text-xs mt-2 max-w-sm" style={{ color: theme.text3 }}>
        {hint}
      </p>
    </div>
  );
}

function IssueRow({ theme, item }: { theme: ThemeColors; item: StudentRepoIssue }) {
  const { t } = useUserPreferences();
  const open = item.state === "open";
  const stateLabel = open
    ? t("repo.section.stateOpen")
    : item.state === "closed"
      ? t("repo.section.stateClosed")
      : item.state;
  return (
    <li
      className="flex gap-3 px-4 py-3.5 border-t transition-colors"
      style={{ borderColor: theme.border }}
    >
      <CircleDot
        className="h-4 w-4 shrink-0 mt-0.5"
        style={{ color: open ? theme.success : theme.text3 }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono tabular-nums" style={{ color: theme.text3 }}>
            #{item.number}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{
              backgroundColor: open ? `${theme.success}22` : theme.bg4,
              color: open ? theme.success : theme.text3,
            }}
          >
            {stateLabel}
          </span>
        </div>
        <p className="text-sm font-medium mt-0.5" style={{ color: theme.text }}>
          {item.title}
        </p>
        <p className="text-xs mt-1.5 flex flex-wrap gap-x-2 gap-y-1" style={{ color: theme.text3 }}>
          {item.author_name ? <span>{item.author_name}</span> : null}
          {item.updated_at ? <span>{t("repo.section.updated").replace("{time}", formatRelativeTime(item.updated_at))}</span> : null}
          {item.comments_count > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {item.comments_count}
            </span>
          ) : null}
        </p>
        {item.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.labels.map((lb) => (
              <span
                key={lb}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: theme.bg4, color: theme.accent2 }}
              >
                <Tag className="h-2.5 w-2.5" />
                {lb}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PullRow({
  theme,
  item,
  isActive,
  onOpen,
}: {
  theme: ThemeColors;
  item: StudentRepoPull;
  isActive: boolean;
  onOpen: () => void;
}) {
  const { t } = useUserPreferences();
  const merged = item.merged === true || item.state === "merged";
  const open = item.state === "open" && !merged;
  const statusLabel = merged
    ? t("repo.section.stateMerged")
    : item.state === "open"
      ? t("repo.section.stateOpen")
      : item.state === "closed"
        ? t("repo.section.stateClosed")
        : item.state;
  return (
    <li
      className="flex gap-3 px-4 py-3.5 border-t cursor-pointer transition-colors"
      style={{
        borderColor: theme.border,
        backgroundColor: isActive ? `${theme.accent}12` : "transparent",
      }}
      onClick={onOpen}
    >
      <GitPullRequest
        className="h-4 w-4 shrink-0 mt-0.5"
        style={{ color: merged ? theme.success : open ? theme.accent2 : theme.text3 }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono" style={{ color: theme.text3 }}>
            #{item.number}
          </span>
          <span
            className="text-[10px] font-semibold uppercase rounded px-1.5 py-0.5"
            style={{
              backgroundColor: merged ? `${theme.success}22` : open ? `${theme.accent}22` : theme.bg4,
              color: merged ? theme.success : open ? theme.accent2 : theme.text3,
            }}
          >
            {statusLabel}
          </span>
          {item.commits_count != null ? (
            <span className="text-[10px] font-mono tabular-nums" style={{ color: theme.text3 }}>
              {item.commits_count} {t("repo.sidebar.commitMany")}
            </span>
          ) : null}
        </div>
        <p className="text-sm font-medium mt-0.5" style={{ color: theme.text }}>
          {item.title}
        </p>
        <p className="text-xs mt-1.5 font-mono" style={{ color: theme.text2 }}>
          {item.head_branch ?? "?"} → {item.base_branch ?? t("repo.settings.defaultBranchPlaceholder")}
        </p>
        <p className="text-xs mt-1" style={{ color: theme.text3 }}>
          {item.author_name ? `${item.author_name} · ` : ""}
          {item.updated_at ? formatRelativeTime(item.updated_at) : ""}
        </p>
      </div>
      <ChevronDown
        className="h-4 w-4 shrink-0 mt-1"
        style={{
          color: theme.text3,
          transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform .15s ease",
        }}
      />
    </li>
  );
}

interface ParsedDiffLine {
  kind: "meta" | "ctx" | "add" | "del";
  raw: string;
  position: number | null;
}

interface ParsedDiffFile {
  path: string;
  lines: ParsedDiffLine[];
}

function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  if (!diff.trim()) return [];
  const rows = diff.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  let position = 0;

  const pushCurrent = () => {
    if (current && current.path) out.push(current);
  };

  for (const line of rows) {
    if (line.startsWith("diff --git ")) {
      pushCurrent();
      const match = line.match(/ b\/(.+)$/);
      current = { path: match?.[1]?.trim() || "", lines: [] };
      position = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      current.lines.push({ kind: "meta", raw: line, position: null });
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ")) {
      current.lines.push({ kind: "meta", raw: line, position: null });
      continue;
    }
    if (line.startsWith("+")) {
      position += 1;
      current.lines.push({ kind: "add", raw: line, position });
      continue;
    }
    if (line.startsWith("-")) {
      position += 1;
      current.lines.push({ kind: "del", raw: line, position });
      continue;
    }
    if (line.startsWith(" ")) {
      position += 1;
      current.lines.push({ kind: "ctx", raw: line, position });
      continue;
    }
    current.lines.push({ kind: "meta", raw: line, position: null });
  }
  pushCurrent();
  return out;
}

function IssuesPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {
  const { t } = useUserPreferences();
  const api = useRepoApi();
  const [state, setState] = useState("open");
  const [query, setQuery] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StudentRepoIssue[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [state, repoId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await api.getIssues(repoId, state, page, query || undefined);
        if (cancelled) return;
        setItems((prev) => (page === 1 ? res.issues : [...prev, ...res.issues]));
        setHasMore(res.has_more);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, state, page, query]);

  return (
    <PanelCard theme={theme}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: theme.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
          {t("repo.section.issuesTitle")}
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("repo.section.issuesSearchPlaceholder")}
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
          />
          <RepoStateTabs theme={theme} value={state} onChange={setState} />
        </div>
      </div>
      {api.createIssue ? (
        <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: theme.border }}>
          <input
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder={t("repo.section.issuesCreateTitlePlaceholder")}
            className="w-full rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
          />
          <textarea
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
            rows={2}
            placeholder={t("repo.section.issuesCreateDescriptionPlaceholder")}
            className="w-full rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
          />
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!createTitle.trim() || !api.createIssue) return;
                await api.createIssue(repoId, { title: createTitle.trim(), body: createBody.trim() || undefined });
                setCreateTitle("");
                setCreateBody("");
                setPage(1);
                const res = await api.getIssues(repoId, state, 1, query || undefined);
                setItems(res.issues);
                setHasMore(res.has_more);
              })();
            }}
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg4 }}
          >
            {t("repo.section.createIssue")}
          </button>
        </div>
      ) : null}
      {loading && page === 1 ? (
        <div className="flex justify-center py-14 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("repo.section.loadingShort")}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={<CircleDot className="h-6 w-6" />}
          title={t("repo.section.noIssuesTitle")}
          hint={t("repo.section.noIssuesHint")}
        />
      ) : (
        <ul>
          {items.map((item) => (
            <div key={`${item.number}-${item.updated_at}`} className="border-t" style={{ borderColor: theme.border }}>
              <IssueRow theme={theme} item={item} />
              <div className="px-4 pb-3 flex gap-2">
                {api.reactIssue ? (
                  <button
                    type="button"
                    onClick={() => void api.reactIssue?.(repoId, item.number, "heart")}
                    className="rounded border px-2 py-0.5 text-[10px]"
                    style={{ borderColor: theme.border, color: theme.text3 }}
                  >
                    {t("repo.section.react")}
                  </button>
                ) : null}
                {api.patchIssue && item.state !== "closed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        await api.patchIssue?.(repoId, item.number, { state: "closed" });
                        setItems((prev) => prev.map((x) => (x.number === item.number ? { ...x, state: "closed" } : x)));
                      })();
                    }}
                    className="rounded border px-2 py-0.5 text-[10px]"
                    style={{ borderColor: theme.border, color: theme.text3 }}
                  >
                    {t("repo.section.closeIssue")}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </ul>
      )}
      {hasMore && !loading ? (
        <div className="p-4 border-t text-center" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="text-sm font-medium hover:underline"
            style={{ color: theme.accent2 }}
          >
            {t("repo.section.loadMore")}
          </button>
        </div>
      ) : null}
    </PanelCard>
  );
}

function PullsPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {
  const { t } = useUserPreferences();
  const { summary } = useStudentRepoWorkspaceContext();
  const api = useRepoApi();
  const isBlocked = !!summary?.is_blocked;
  const [state, setState] = useState("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StudentRepoPull[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [headOptions, setHeadOptions] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [selectedPullNumber, setSelectedPullNumber] = useState<number | null>(null);
  const [detail, setDetail] = useState<StudentRepoPullDetailBundle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [checkLogOpenId, setCheckLogOpenId] = useState<string | null>(null);
  const [checkLogText, setCheckLogText] = useState("");
  const [checkLogLoading, setCheckLogLoading] = useState(false);
  const [checkLogTruncated, setCheckLogTruncated] = useState(false);
  const [retryCheckId, setRetryCheckId] = useState<string | null>(null);
  const [checksHint, setChecksHint] = useState<string | null>(null);
  const [lastChecksRefreshAt, setLastChecksRefreshAt] = useState<Date | null>(null);
  const [inlineTarget, setInlineTarget] = useState<{
    path: string;
    position: number;
    side: "new" | "old";
  } | null>(null);
  const [inlineBody, setInlineBody] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);
  const base = summary?.default_branch ?? "main";
  const parsedDiffFiles = useMemo(() => parseUnifiedDiff(detail?.diff || ""), [detail?.diff]);
  const parsedDiffByPath = useMemo(() => {
    const map = new Map<string, ParsedDiffFile>();
    for (const item of parsedDiffFiles) map.set(item.path, item);
    return map;
  }, [parsedDiffFiles]);
  const threadMap = useMemo(() => {
    const map = new Map<string, StudentRepoPullThread>();
    for (const thread of detail?.threads ?? []) {
      if (!thread.path || thread.position == null) continue;
      map.set(`${thread.path}::${thread.position}`, thread);
    }
    return map;
  }, [detail?.threads]);

  useEffect(() => {
    setPage(1);
    setSelectedPullNumber(null);
    setDetail(null);
  }, [state, repoId]);

  useEffect(() => {
    if (!createOpen || isBlocked) return;
    let cancelled = false;
    api.getUnmergedBranches(repoId, base, 50)
      .then((rows) => {
        if (cancelled) return;
        setHeadOptions(rows);
        setHead((current) => (rows.includes(current) ? current : rows[0] ?? ""));
      })
      .catch(() => {
        if (!cancelled) {
          setHeadOptions([]);
          setHead("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, repoId, base, isBlocked]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await api.getPulls(repoId, state, page);
        if (!cancelled) {
          setItems((prev) => (page === 1 ? res.pulls : [...prev, ...res.pulls]));
          setHasMore(res.has_more);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, state, page]);

  useEffect(() => {
    if (items.length === 0 || selectedPullNumber != null) return;
    setSelectedPullNumber(items[0].number);
  }, [items, selectedPullNumber]);

  useEffect(() => {
    if (!selectedPullNumber || !api.getPullDetail) return;
    let cancelled = false;
    setCheckLogOpenId(null);
    setCheckLogText("");
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const res = await api.getPullDetail!(repoId, selectedPullNumber);
        if (!cancelled) setDetail(res);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [repoId, selectedPullNumber, api]);

  const refreshDetail = async () => {
    if (!selectedPullNumber || !api.getPullDetail) return;
    const res = await api.getPullDetail(repoId, selectedPullNumber);
    setDetail(res);
    setLastChecksRefreshAt(new Date());
  };

  useEffect(() => {
    if (!selectedPullNumber || !api.getPullDetail) return;
    if (detail?.pull.state !== "open") return;
    const hasActiveChecks = (detail?.checks.items ?? []).some((x) => x.state === "running" || x.state === "queued");
    const intervalMs = hasActiveChecks ? 3000 : 10000;
    const timer = window.setInterval(() => {
      void refreshDetail();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [selectedPullNumber, api.getPullDetail, detail?.pull.state, detail?.checks.items]);

  useEffect(() => {
    if (!selectedPullNumber || !api.getPullDetail) return;
    const onFocus = () => {
      void refreshDetail();
    };
    const onVisible = () => {
      if (!document.hidden) void refreshDetail();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedPullNumber, api.getPullDetail, detail?.pull.state, detail?.checks.items]);

  const checkStateTone = (state: string): { bg: string; fg: string } => {
    if (state === "success") return { bg: `${theme.success}1e`, fg: theme.success };
    if (state === "failure") return { bg: `${theme.danger}18`, fg: theme.danger };
    if (state === "running") return { bg: `${theme.accent}20`, fg: theme.accent2 };
    if (state === "queued") return { bg: `${theme.warning}22`, fg: theme.warning };
    if (state === "cancelled") return { bg: `${theme.text3}26`, fg: theme.text3 };
    return { bg: `${theme.bg4}`, fg: theme.text3 };
  };

  const submitReview = async (event: "comment" | "approve" | "request_changes") => {
    if (!selectedPullNumber || !api.createPullReview) return;
    setReviewLoading(true);
    try {
      await api.createPullReview(repoId, selectedPullNumber, {
        event,
        body: reviewBody.trim() || undefined,
      });
      setReviewBody("");
      await refreshDetail();
    } finally {
      setReviewLoading(false);
    }
  };

  const submitDiscussion = async () => {
    if (!selectedPullNumber || !api.createPullComment || !discussionBody.trim()) return;
    setDiscussionLoading(true);
    try {
      await api.createPullComment(repoId, selectedPullNumber, { body: discussionBody.trim() });
      setDiscussionBody("");
      await refreshDetail();
    } finally {
      setDiscussionLoading(false);
    }
  };

  const submitInline = async () => {
    if (!selectedPullNumber || !api.createPullReview || !inlineTarget || !inlineBody.trim()) return;
    setInlineLoading(true);
    try {
      await api.createPullReview(repoId, selectedPullNumber, {
        event: "comment",
        comments: [
          {
            path: inlineTarget.path,
            body: inlineBody.trim(),
            new_position: inlineTarget.side === "new" ? inlineTarget.position : undefined,
            old_position: inlineTarget.side === "old" ? inlineTarget.position : undefined,
          },
        ],
      });
      setInlineBody("");
      setInlineTarget(null);
      await refreshDetail();
    } finally {
      setInlineLoading(false);
    }
  };

  const submitMerge = async () => {
    if (!selectedPullNumber || !api.mergePull) return;
    setMergeLoading(true);
    try {
      await api.mergePull(repoId, selectedPullNumber, { method: mergeMethod });
      await refreshDetail();
      setPage(1);
      setChecksHint(null);
    } finally {
      setMergeLoading(false);
    }
  };

  const openCheckLog = async (item: StudentRepoPullCheckItem) => {
    if (!selectedPullNumber || !api.getPullCheckLog) return;
    setCheckLogOpenId(item.id);
    setCheckLogLoading(true);
    setCheckLogTruncated(false);
    try {
      const res = await api.getPullCheckLog(repoId, selectedPullNumber, item.id);
      setCheckLogText(res.log || "");
      setCheckLogTruncated(!!res.truncated);
    } catch {
      setCheckLogText(t("repo.section.loadLogFailed"));
      setCheckLogTruncated(false);
    } finally {
      setCheckLogLoading(false);
    }
  };

  const retryCheck = async (item: StudentRepoPullCheckItem) => {
    if (!selectedPullNumber || !api.retryPullCheck) return;
    setRetryCheckId(item.id);
    setChecksHint(null);
    try {
      const res = await api.retryPullCheck(repoId, selectedPullNumber, item.id);
      setChecksHint(res.message || (res.accepted ? t("repo.section.rerunQueued") : t("repo.section.rerunUnavailable")));
      await refreshDetail();
      // Quick follow-up refreshes to visualize queued -> running transitions.
      window.setTimeout(() => void refreshDetail(), 1500);
      window.setTimeout(() => void refreshDetail(), 4500);
    } finally {
      setRetryCheckId(null);
    }
  };

  const mergeGateText = useMemo(() => {
    if (!detail) return "";
    if (detail.checks.conflict_state === "conflicting") return t("repo.section.mergeConflictsDetected");
    if (detail.checks.can_merge) return t("repo.section.mergeChecksPassed");
    if (detail.checks.blocked_reason === "already_merged") return t("repo.section.mergeAlreadyMerged");
    if (detail.checks.blocked_reason === "not_open") return t("repo.section.mergePrNotOpen");
    if (detail.checks.blocked_reason === "conflicts") return t("repo.section.mergeConflictsDetected");
    if (detail.checks.blocked_reason === "required_checks_missing") return t("repo.section.mergeRequiredChecksMissing");
    if (detail.checks.blocked_reason === "required_reviewers_missing") return t("repo.section.mergeRequiredReviewersMissing");
    if (detail.checks.blocked_reason === "branch_policy") return t("repo.section.mergeBlockedByPolicy");
    if (detail.checks.blocked_reason === "draft") return t("repo.section.mergeDraft");
    if (detail.checks.blocked_reason === "mergeability_unknown") return t("repo.section.mergeabilityUnknown");
    return t("repo.section.mergePending");
  }, [detail, t]);

  const checksStale = useMemo(() => {
    if (!lastChecksRefreshAt || !detail) return false;
    const hasActiveChecks = (detail.checks.items ?? []).some((x) => x.state === "running" || x.state === "queued");
    if (!hasActiveChecks) return false;
    return Date.now() - lastChecksRefreshAt.getTime() > 20000;
  }, [detail, lastChecksRefreshAt]);

  return (
    <PanelCard theme={theme}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: theme.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
          {t("repo.section.pullsTitle")}
        </h2>
        <div className="flex items-center gap-2">
          <RepoStateTabs theme={theme} value={state} onChange={setState} />
          {api.createPull ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={isBlocked}
              className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
              style={{
                borderColor: `${theme.accent}55`,
                backgroundColor: `${theme.accent}14`,
                color: isBlocked ? theme.text3 : theme.accent2,
                opacity: isBlocked ? 0.55 : 1,
              }}
            >
              {t("repo.section.createPr")}
            </button>
          ) : null}
        </div>
      </div>
      {createOpen ? (
        <div className="px-4 py-4 border-b space-y-3" style={{ borderColor: theme.border }}>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase" style={{ color: theme.text3 }}>
              {t("repo.section.prTitleLabel")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              placeholder={t("repo.section.prTitlePlaceholder")}
              disabled={createLoading || isBlocked}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase" style={{ color: theme.text3 }}>
                {t("repo.section.prHeadLabel")}
              </label>
              <select
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                disabled={createLoading || isBlocked}
              >
                {headOptions.length === 0 ? <option value="">—</option> : null}
                {headOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <p className="text-[11px]" style={{ color: theme.text3 }}>
                {t("repo.section.prHeadHint").replace("{base}", base)}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase" style={{ color: theme.text3 }}>
                {t("repo.section.prBaseLabel")}
              </label>
              <input
                value={base}
                readOnly
                className="rounded-lg border px-3 py-2 text-sm font-mono"
                style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text2 }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase" style={{ color: theme.text3 }}>
              {t("repo.section.prDescriptionLabel")}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
              disabled={createLoading || isBlocked}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border px-3 py-2 text-xs font-medium"
              style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text2 }}
              disabled={createLoading}
            >
              {t("repo.section.cancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!head || !title.trim()) return;
                  setCreateLoading(true);
                  try {
                    if (!api.createPull) throw new Error(t("repo.errors.readOnlyRepository"));
                    const pr = await api.createPull(repoId, { title: title.trim(), head, base, body });
                    setItems((prev) => [pr, ...prev]);
                    setCreateOpen(false);
                    setTitle("");
                    setBody("");
                  } catch {
                    // ignore, list will refresh on next load
                  } finally {
                    setCreateLoading(false);
                  }
                })();
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: `${theme.success}55`,
                backgroundColor: `${theme.success}14`,
                color: theme.success,
                opacity: createLoading || !head || !title.trim() ? 0.55 : 1,
              }}
              disabled={createLoading || isBlocked || !head || !title.trim()}
            >
              {t("repo.section.create")}
            </button>
          </div>
        </div>
      ) : null}
      {loading && page === 1 ? (
        <div className="flex justify-center py-14 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={<GitPullRequest className="h-6 w-6" />}
          title={t("repo.section.noPrTitle")}
          hint={t("repo.section.noPrHint")}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="border-r" style={{ borderColor: theme.border }}>
            <ul>
              {items.map((item) => (
                <PullRow
                  key={`${item.number}-${item.updated_at}`}
                  theme={theme}
                  item={item}
                  isActive={selectedPullNumber === item.number}
                  onOpen={() => setSelectedPullNumber(item.number)}
                />
              ))}
            </ul>
          </div>
          <div className="min-h-[320px] p-4 space-y-4">
            {!selectedPullNumber ? (
              <p className="text-sm" style={{ color: theme.text3 }}>
                {t("repo.section.selectPrPrompt")}
              </p>
            ) : detailLoading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: theme.text2 }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("repo.section.loadingPrDetails")}
              </div>
            ) : !detail ? (
              <p className="text-sm" style={{ color: theme.text3 }}>
                {t("repo.section.prDetailsUnavailable")}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GitPullRequest className="h-4 w-4" style={{ color: theme.accent2 }} />
                    <p className="text-sm font-semibold" style={{ color: theme.text }}>
                      #{detail.pull.number} {detail.pull.title}
                    </p>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        backgroundColor:
                          detail.pull.state === "open" ? `${theme.accent}22` : `${theme.bg4}`,
                        color: detail.pull.state === "open" ? theme.accent2 : theme.text3,
                      }}
                    >
                      {detail.pull.state === "open"
                        ? t("repo.section.stateOpen")
                        : detail.pull.state === "closed"
                          ? t("repo.section.stateClosed")
                          : detail.pull.state === "merged"
                            ? t("repo.section.stateMerged")
                            : detail.pull.state}
                    </span>
                  </div>
                  <p className="text-xs font-mono" style={{ color: theme.text2 }}>
                    {detail.pull.head_branch ?? "?"} → {detail.pull.base_branch ?? t("repo.settings.defaultBranchPlaceholder")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: theme.text3 }}>
                    <span>{detail.pull.commits_count ?? 0} {t("repo.sidebar.commitMany")}</span>
                    <span>
                      {t("repo.section.filesCount").replace(
                        "{count}",
                        String(detail.pull.changed_files_count ?? detail.files.length),
                      )}
                    </span>
                    <span>
                      {t("repo.section.reviewCommentsCount").replace("{count}", String(detail.pull.review_comments_count))}
                    </span>
                  </div>
                </div>

                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                >
                  <div className="flex items-center gap-2" style={{ color: theme.text2 }}>
                    {detail.checks.conflict_state === "conflicting" ? (
                      <XCircle className="h-4 w-4" style={{ color: theme.danger }} />
                    ) : detail.checks.can_merge ? (
                      <Check className="h-4 w-4" style={{ color: theme.success }} />
                    ) : (
                      <CircleDot className="h-4 w-4" />
                    )}
                    <span>
                      {mergeGateText}
                    </span>
                  </div>
                  {detail.checks.required_contexts.length > 0 ? (
                    <p className="mt-2 text-[11px]" style={{ color: theme.text3 }}>
                      {t("repo.section.requiredChecks").replace("{list}", detail.checks.required_contexts.join(", "))}
                    </p>
                  ) : null}
                  {detail.checks.missing_required_contexts.length > 0 ? (
                    <p className="mt-1 text-[11px]" style={{ color: theme.danger }}>
                      {t("repo.section.missingChecks").replace("{list}", detail.checks.missing_required_contexts.join(", "))}
                    </p>
                  ) : null}
                  {detail.checks.required_approvals > 0 ? (
                    <p className="mt-1 text-[11px]" style={{ color: theme.text3 }}>
                      {t("repo.section.approvals")
                        .replace("{current}", String(detail.checks.approvals))
                        .replace("{required}", String(detail.checks.required_approvals))}
                    </p>
                  ) : null}
                  {detail.checks.required_reviewer_logins.length > 0 ? (
                    <p className="mt-1 text-[11px]" style={{ color: theme.text3 }}>
                      {t("repo.section.requiredReviewers").replace("{list}", detail.checks.required_reviewer_logins.join(", "))}
                    </p>
                  ) : null}
                  {detail.checks.missing_required_reviewer_logins.length > 0 ? (
                    <p className="mt-1 text-[11px]" style={{ color: theme.danger }}>
                      {t("repo.section.missingReviewerApprovals").replace(
                        "{list}",
                        detail.checks.missing_required_reviewer_logins.join(", "),
                      )}
                    </p>
                  ) : null}
                  {detail.checks.policy_reasons.length > 0 ? (
                    <p className="mt-1 text-[11px]" style={{ color: theme.danger }}>
                      {detail.checks.policy_reasons.join(" ; ")}
                    </p>
                  ) : null}
                  {lastChecksRefreshAt ? (
                    <p className="mt-1 text-[10px]" style={{ color: theme.text3 }}>
                      {t("repo.section.checksUpdated").replace("{time}", formatRelativeTime(lastChecksRefreshAt.toISOString()))}
                    </p>
                  ) : null}
                  {checksStale ? (
                    <p className="mt-1 text-[10px]" style={{ color: theme.warning }}>
                      {t("repo.section.checksStale")}
                    </p>
                  ) : null}
                </div>

                {detail.checks.items.length > 0 ? (
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: theme.border }}>
                    <p className="text-xs font-semibold" style={{ color: theme.text2 }}>
                      {t("repo.section.checksTitle")}
                    </p>
                    {checksHint ? (
                      <p className="text-[11px]" style={{ color: theme.text3 }}>
                        {checksHint}
                      </p>
                    ) : null}
                    {detail.checks.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border px-2.5 py-2 text-[11px] flex flex-wrap items-center gap-2"
                        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                      >
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 font-semibold uppercase"
                          style={{
                            backgroundColor: checkStateTone(item.state).bg,
                            color: checkStateTone(item.state).fg,
                          }}
                        >
                          {item.state}
                        </span>
                        <span className="font-medium" style={{ color: theme.text }}>
                          {item.name}
                        </span>
                        {item.description ? (
                          <span style={{ color: theme.text3 }}>{item.description}</span>
                        ) : null}
                        <div className="ml-auto flex items-center gap-1.5">
                          {item.details_url ? (
                            <a
                              href={item.details_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded border px-2 py-1 inline-flex items-center gap-1"
                              style={{ borderColor: theme.border, color: theme.text2 }}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t("repo.section.details")}
                            </a>
                          ) : null}
                          {api.getPullCheckLog ? (
                            <button
                              type="button"
                              onClick={() => void openCheckLog(item)}
                              className="rounded border px-2 py-1"
                              style={{ borderColor: theme.border, color: theme.text2 }}
                            >
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {t("repo.section.log")}
                              </span>
                            </button>
                          ) : null}
                          {api.retryPullCheck && item.can_retry ? (
                            <button
                              type="button"
                              onClick={() => void retryCheck(item)}
                              className="rounded border px-2 py-1"
                              style={{ borderColor: theme.border, color: theme.text2 }}
                              disabled={retryCheckId === item.id}
                            >
                              <span className="inline-flex items-center gap-1">
                                <RotateCcw className={`h-3 w-3 ${retryCheckId === item.id ? "animate-spin" : ""}`} />
                                {t("repo.section.retry")}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {checkLogOpenId ? (
                      <div className="rounded border p-2" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold" style={{ color: theme.text2 }}>
                            {t("repo.section.checkLogTitle")}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCheckLogOpenId(null);
                              setCheckLogText("");
                              setCheckLogTruncated(false);
                            }}
                            className="text-[10px] hover:underline"
                            style={{ color: theme.text3 }}
                          >
                            {t("repo.section.close")}
                          </button>
                        </div>
                        {checkLogLoading ? (
                          <div className="flex items-center gap-1 text-[11px]" style={{ color: theme.text3 }}>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t("repo.section.loadingLog")}
                          </div>
                        ) : (
                          <>
                            <pre
                              className="max-h-64 overflow-auto text-[10px] leading-4 whitespace-pre-wrap"
                              style={{ color: theme.text2 }}
                            >
                              {checkLogText || t("repo.section.noLogOutput")}
                            </pre>
                            {checkLogTruncated ? (
                              <p className="mt-1 text-[10px]" style={{ color: theme.text3 }}>
                                {t("repo.section.logTruncated")}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {api.createPullReview ? (
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: theme.border }}>
                    <textarea
                      value={reviewBody}
                      onChange={(e) => setReviewBody(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                      placeholder={t("repo.section.prReviewSummaryPlaceholder")}
                      disabled={reviewLoading}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void submitReview("comment")}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                        style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg4 }}
                        disabled={reviewLoading}
                      >
                        {t("repo.section.comment")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitReview("approve")}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                        style={{ borderColor: `${theme.success}55`, color: theme.success, backgroundColor: `${theme.success}16` }}
                        disabled={reviewLoading}
                      >
                        {t("repo.section.approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitReview("request_changes")}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                        style={{ borderColor: `${theme.danger}55`, color: theme.danger, backgroundColor: `${theme.danger}14` }}
                        disabled={reviewLoading}
                      >
                        {t("repo.section.requestChanges")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {api.mergePull ? (
                  <div className="rounded-lg border p-3" style={{ borderColor: theme.border }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <GitMerge className="h-4 w-4" style={{ color: theme.text3 }} />
                      <select
                        value={mergeMethod}
                        onChange={(e) => setMergeMethod(e.target.value as "merge" | "squash" | "rebase")}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                        disabled={mergeLoading}
                      >
                        <option value="merge">{t("repo.section.mergeCommit")}</option>
                        <option value="squash">{t("repo.section.squash")}</option>
                        <option value="rebase">{t("repo.section.rebase")}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void submitMerge()}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                        style={{
                          borderColor: `${theme.success}55`,
                          color: theme.success,
                          backgroundColor: `${theme.success}14`,
                          opacity: detail.checks.can_merge ? 1 : 0.5,
                        }}
                        disabled={mergeLoading || !detail.checks.can_merge}
                      >
                        {t("repo.section.mergePr")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {detail.discussion.length > 0 ? (
                  <div className="space-y-2">
                    {detail.discussion.map((msg: StudentRepoPullDiscussionComment) => (
                      <div
                        key={msg.id}
                        className="rounded-lg border px-3 py-2 text-xs"
                        style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                      >
                        <p style={{ color: theme.text }}>{msg.body}</p>
                        <p className="mt-1" style={{ color: theme.text3 }}>
                          {msg.user_login ?? msg.user_name ?? t("repo.section.unknownUser")} ·{" "}
                          {msg.updated_at ? formatRelativeTime(msg.updated_at) : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {api.createPullComment ? (
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: theme.border }}>
                    <textarea
                      value={discussionBody}
                      onChange={(e) => setDiscussionBody(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                      placeholder={t("repo.section.discussionPlaceholder")}
                      disabled={discussionLoading}
                    />
                    <button
                      type="button"
                      onClick={() => void submitDiscussion()}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                      style={{ borderColor: theme.border, backgroundColor: theme.bg4, color: theme.text2 }}
                      disabled={discussionLoading || !discussionBody.trim()}
                    >
                      {t("repo.section.sendComment")}
                    </button>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {detail.files.map((file: StudentRepoPullFile) => {
                    const parsed =
                      parsedDiffByPath.get(file.filename) ||
                      (file.previous_filename ? parsedDiffByPath.get(file.previous_filename) : undefined);
                    return (
                      <div
                        key={file.filename}
                        className="rounded-lg border overflow-hidden"
                        style={{ borderColor: theme.border }}
                      >
                        <div
                          className="px-3 py-2 text-xs flex items-center justify-between"
                          style={{ backgroundColor: theme.bg, color: theme.text2 }}
                        >
                          <span className="font-mono">{file.filename}</span>
                          <span>
                            +{file.additions} / -{file.deletions}
                          </span>
                        </div>
                        {parsed ? (
                          <div className="max-h-[360px] overflow-auto">
                            {parsed.lines.map((line, idx) => {
                              const key = `${parsed.path}::${line.position ?? "none"}::${idx}`;
                              const thread = line.position != null ? threadMap.get(`${parsed.path}::${line.position}`) : null;
                              const isTarget =
                                inlineTarget?.path === parsed.path && inlineTarget?.position === line.position;
                              return (
                                <div key={key} className="border-t" style={{ borderColor: theme.border }}>
                                  <div
                                    className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-2 px-2 py-1.5 text-[11px] font-mono"
                                    style={{
                                      backgroundColor:
                                        line.kind === "add"
                                          ? `${theme.success}14`
                                          : line.kind === "del"
                                            ? `${theme.danger}12`
                                            : "transparent",
                                      color: line.kind === "meta" ? theme.text3 : theme.text2,
                                    }}
                                  >
                                    <span>{line.position ?? ""}</span>
                                    <span className="whitespace-pre-wrap break-all">{line.raw}</span>
                                    {line.position != null && api.createPullReview ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setInlineTarget({
                                            path: parsed.path,
                                            position: line.position!,
                                            side: line.kind === "del" ? "old" : "new",
                                          });
                                          setInlineBody("");
                                        }}
                                        className="rounded border px-1.5 py-0.5 text-[10px]"
                                        style={{ borderColor: theme.border, color: theme.text3 }}
                                      >
                                        {thread
                                          ? t("repo.section.replyCount").replace(
                                              "{count}",
                                              String(thread.comments.length),
                                            )
                                          : t("repo.section.comment")}
                                      </button>
                                    ) : null}
                                  </div>
                                  {thread ? (
                                    <div className="px-2 pb-2 space-y-1">
                                      {thread.comments.map((comment) => (
                                        <div
                                          key={comment.id}
                                          className="rounded border px-2 py-1 text-xs"
                                          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                                        >
                                          <p style={{ color: theme.text }}>{comment.body}</p>
                                          <p style={{ color: theme.text3 }}>
                                            {comment.user_login ?? comment.user_name ?? t("repo.section.unknownUser")} ·{" "}
                                            {comment.updated_at ? formatRelativeTime(comment.updated_at) : ""}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {isTarget && api.createPullReview ? (
                                    <div className="px-2 pb-2 space-y-2">
                                      <textarea
                                        value={inlineBody}
                                        onChange={(e) => setInlineBody(e.target.value)}
                                        rows={2}
                                        className="w-full rounded border px-2 py-1 text-xs"
                                        style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
                                        placeholder={t("repo.section.inlineCommentPlaceholder")}
                                        disabled={inlineLoading}
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void submitInline()}
                                          className="rounded border px-2 py-1 text-[11px]"
                                          style={{ borderColor: theme.border, color: theme.text2, backgroundColor: theme.bg4 }}
                                          disabled={inlineLoading || !inlineBody.trim()}
                                        >
                                          {t("repo.section.send")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setInlineTarget(null)}
                                          className="rounded border px-2 py-1 text-[11px]"
                                          style={{ borderColor: theme.border, color: theme.text3 }}
                                          disabled={inlineLoading}
                                        >
                                          {t("repo.section.cancel")}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs" style={{ color: theme.text3 }}>
                            {t("repo.section.diffUnavailable")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {hasMore && !loading ? (
        <div className="p-4 border-t text-center" style={{ borderColor: theme.border }}>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="text-sm font-medium hover:underline"
            style={{ color: theme.accent2 }}
          >
            {t("repo.section.loadMore")}
          </button>
        </div>
      ) : null}
    </PanelCard>
  );
}

function WikiPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {
  const { t } = useUserPreferences();
  const api = useRepoApi();
  const [pages, setPages] = useState<StudentRepoWikiPage[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingList(true);
      try {
        const res = await api.getWikiPages(repoId);
        if (cancelled) return;
        setPages(res.pages);
        if (res.pages.length > 0) setActiveSlug(res.pages[0].slug);
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    async function load() {
      setLoadingPage(true);
      try {
        const res = await api.getWikiContent(repoId, activeSlug);
        if (!cancelled) {
          setTitle(res.title);
          setContent(res.content);
        }
      } catch {
        if (!cancelled) {
          setTitle(activeSlug);
          setContent("");
        }
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [repoId, activeSlug]);

  if (loadingList) {
    return (
      <PanelCard theme={theme}>
        <div className="flex justify-center py-14 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </PanelCard>
    );
  }

  if (pages.length === 0) {
    return (
      <PanelCard theme={theme}>
        <EmptyState
          theme={theme}
          icon={<BookOpen className="h-6 w-6" />}
          title={t("repo.section.wikiEmptyTitle")}
          hint={t("repo.section.wikiEmptyHint")}
        />
      </PanelCard>
    );
  }

  return (
    <PanelCard theme={theme}>
      <div className="flex flex-col md:flex-row min-h-[320px]">
        <aside
          className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r p-2"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
        >
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.text3 }}>
            {t("repo.section.wikiPages")}
          </p>
          {pages.map((p) => {
            const active = p.slug === activeSlug;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => setActiveSlug(p.slug)}
                className="w-full text-left rounded-lg px-2.5 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: active ? `${theme.accent}18` : "transparent",
                  color: active ? theme.accent2 : theme.text2,
                }}
              >
                {p.title}
              </button>
            );
          })}
        </aside>
        <div className="flex-1 min-w-0 px-5 py-4">
          <h2 className="text-base font-semibold mb-3" style={{ color: theme.text }}>
            {title}
          </h2>
          {loadingPage ? (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.text2 }} />
          ) : content ? (
            <RepoMarkdown content={content} theme={theme} />
          ) : (
            <p className="text-sm" style={{ color: theme.text3 }}>
              {t("repo.section.emptyPage")}
            </p>
          )}
        </div>
      </div>
    </PanelCard>
  );
}


export default function StudentRepositorySectionPage({
  isDarkTheme = false,
  section,
}: StudentRepositorySectionPageProps) {
  const theme = getTheme(isDarkTheme);
  const { repoId, meta, summary } = useStudentRepoWorkspaceContext();

  if (section === "issues") return <IssuesPanel theme={theme} repoId={repoId} />;
  if (section === "pulls") return <PullsPanel theme={theme} repoId={repoId} />;
  if (section === "wiki") return <WikiPanel theme={theme} repoId={repoId} />;
  if (section === "settings") return <RepoSettingsPanel theme={theme} meta={meta} summary={summary} />;
  return null;
}
