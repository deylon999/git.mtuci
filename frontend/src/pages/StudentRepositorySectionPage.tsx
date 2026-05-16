import { useEffect, useState } from "react";
import {
  BookOpen,
  CircleDot,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Tag,
} from "lucide-react";
import RepoSettingsPanel from "../components/repo/RepoSettingsPanel";
import RepoStateTabs from "../components/repo/RepoStateTabs";
import { useStudentRepoWorkspaceContext } from "../context/StudentRepoWorkspaceContext";
import RepoMarkdown from "../components/RepoMarkdown";
import {
  getStudentRepoIssues,
  getStudentRepoPulls,
  getStudentRepoWikiContent,
  getStudentRepoWikiPages,
  type StudentRepoIssue,
  type StudentRepoPull,
  type StudentRepoWikiPage,
} from "../api/studentDashboardApi";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { getTheme, type ThemeColors } from "../theme";
import type { RepoNavTabId } from "../components/repo/RepoNavTabs";
import { useUserPreferences } from "../context/UserPreferencesContext";

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
            {open ? "open" : item.state}
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

function PullRow({ theme, item }: { theme: ThemeColors; item: StudentRepoPull }) {
  const open = item.state === "open";
  return (
    <li
      className="flex gap-3 px-4 py-3.5 border-t"
      style={{ borderColor: theme.border }}
    >
      <GitPullRequest
        className="h-4 w-4 shrink-0 mt-0.5"
        style={{ color: open ? theme.accent2 : theme.text3 }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono" style={{ color: theme.text3 }}>
            #{item.number}
          </span>
          <span
            className="text-[10px] font-semibold uppercase rounded px-1.5 py-0.5"
            style={{
              backgroundColor: open ? `${theme.accent}22` : theme.bg4,
              color: open ? theme.accent2 : theme.text3,
            }}
          >
            {item.state}
          </span>
        </div>
        <p className="text-sm font-medium mt-0.5" style={{ color: theme.text }}>
          {item.title}
        </p>
        <p className="text-xs mt-1.5 font-mono" style={{ color: theme.text2 }}>
          {item.head_branch ?? "?"} → {item.base_branch ?? "main"}
        </p>
        <p className="text-xs mt-1" style={{ color: theme.text3 }}>
          {item.author_name ? `${item.author_name} · ` : ""}
          {item.updated_at ? formatRelativeTime(item.updated_at) : ""}
        </p>
      </div>
    </li>
  );
}

function IssuesPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {
  const { t } = useUserPreferences();
  const [state, setState] = useState("open");
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
        const res = await getStudentRepoIssues(repoId, state, page);
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
  }, [repoId, state, page]);

  return (
    <PanelCard theme={theme}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: theme.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
          Issues
        </h2>
        <RepoStateTabs theme={theme} value={state} onChange={setState} />
      </div>
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
            <IssueRow key={`${item.number}-${item.updated_at}`} theme={theme} item={item} />
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
  const [state, setState] = useState("open");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StudentRepoPull[]>([]);
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
        const res = await getStudentRepoPulls(repoId, state, page);
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

  return (
    <PanelCard theme={theme}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: theme.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
          Pull requests
        </h2>
        <RepoStateTabs theme={theme} value={state} onChange={setState} />
      </div>
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
        <ul>
          {items.map((item) => (
            <PullRow key={`${item.number}-${item.updated_at}`} theme={theme} item={item} />
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

function WikiPanel({ theme, repoId }: { theme: ThemeColors; repoId: string }) {
  const { t } = useUserPreferences();
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
        const res = await getStudentRepoWikiPages(repoId);
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
        const res = await getStudentRepoWikiContent(repoId, activeSlug);
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
