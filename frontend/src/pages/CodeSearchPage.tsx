import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookmarkPlus, Play, Save, Search, Star, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  codeSearch,
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  type CodeSearchHit,
  type SavedSearch,
} from "../api/searchApi";
import { useUserPreferences } from "../context/UserPreferencesContext";

interface Props {
  isDarkTheme?: boolean;
}

export default function CodeSearchPage({ isDarkTheme = false }: Props) {
  const { t } = useUserPreferences();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [extension, setExtension] = useState(params.get("ext") ?? "");
  const [pathPrefix, setPathPrefix] = useState(params.get("path") ?? "");
  const [pathContains, setPathContains] = useState(params.get("path_contains") ?? "");
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "");
  const [repoId, setRepoId] = useState(params.get("repo_id") ?? "");
  const [minScore, setMinScore] = useState(params.get("min_score") ?? "");
  const [sort, setSort] = useState<"relevance" | "path">((params.get("sort") as "relevance" | "path") || "relevance");
  const [branch, setBranch] = useState(params.get("branch") ?? "main");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<CodeSearchHit[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [facets, setFacets] = useState<{ extensions?: Array<{ value: string; count: number }>; repositories?: Array<{ value: string; count: number }> }>({});

  const qFromUrl = params.get("q") ?? "";

  async function loadSaved() {
    try {
      setSaved(await listSavedSearches());
    } catch {
      // ignore
    }
  }

  async function runSearch() {
    if (!qFromUrl.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await codeSearch(qFromUrl, {
        extension: params.get("ext") || undefined,
        path_prefix: params.get("path") || undefined,
        path_contains: params.get("path_contains") || undefined,
        symbol: params.get("symbol") || undefined,
        repo_id: params.get("repo_id") || undefined,
        min_score: params.get("min_score") ? Number(params.get("min_score")) : undefined,
        sort: (params.get("sort") as "relevance" | "path") || "relevance",
        branch: params.get("branch") || "main",
        limit: 50,
      });
      setHits(res.hits);
      setFacets(res.facets ?? {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("codeSearch.searchFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch();
    void loadSaved();
  }, [qFromUrl, params.get("ext"), params.get("path"), params.get("path_contains"), params.get("symbol"), params.get("repo_id"), params.get("min_score"), params.get("sort"), params.get("branch")]);

  const grouped = useMemo(() => {
    const map = new Map<string, CodeSearchHit[]>();
    for (const h of hits) {
      const k = h.repository_name;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return [...map.entries()];
  }, [hits]);

  function applySearch() {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (extension.trim()) next.set("ext", extension.trim());
    if (pathPrefix.trim()) next.set("path", pathPrefix.trim());
    if (pathContains.trim()) next.set("path_contains", pathContains.trim());
    if (symbol.trim()) next.set("symbol", symbol.trim());
    if (repoId.trim()) next.set("repo_id", repoId.trim());
    if (minScore.trim()) next.set("min_score", minScore.trim());
    if (sort) next.set("sort", sort);
    if (branch.trim()) next.set("branch", branch.trim());
    setParams(next);
  }

  async function saveCurrent() {
    if (!qFromUrl.trim()) return;
    try {
      await createSavedSearch({
        name: `${qFromUrl}${extension ? ` .${extension}` : ""}`,
        query: qFromUrl,
        search_type: "code",
        filters: {
          extension: params.get("ext") || null,
          path_prefix: params.get("path") || null,
          path_contains: params.get("path_contains") || null,
          symbol: params.get("symbol") || null,
          repo_id: params.get("repo_id") || null,
          min_score: params.get("min_score") || null,
          sort: params.get("sort") || "relevance",
          branch: params.get("branch") || "main",
        },
      });
      toast.success(t("codeSearch.saved"));
      void loadSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("codeSearch.saveFailed"));
    }
  }

  function savedFilters(s: SavedSearch): Record<string, string | null> {
    return ((s.filters ?? s.filters_json ?? {}) as Record<string, string | null>) || {};
  }

  function savedMeta(s: SavedSearch): { pinned: boolean; group: string } {
    const f = savedFilters(s) as Record<string, unknown>;
    const meta = (f.__meta as Record<string, unknown> | undefined) ?? {};
    return {
      pinned: Boolean(meta.pinned),
      group: typeof meta.group === "string" ? meta.group : "Default",
    };
  }

  const groupedSaved = useMemo(() => {
    const map = new Map<string, SavedSearch[]>();
    const sorted = [...saved].sort((a, b) => {
      const am = savedMeta(a);
      const bm = savedMeta(b);
      if (am.pinned !== bm.pinned) return am.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const s of sorted) {
      const g = savedMeta(s).group || "Default";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [saved]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className={`rounded-xl border p-4 ${isDarkTheme ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border px-8 py-2 text-sm" placeholder={t("codeSearch.searchPlaceholder")} />
          </div>
          <input value={extension} onChange={(e) => setExtension(e.target.value)} className="w-28 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.extPlaceholder")} />
          <input value={pathPrefix} onChange={(e) => setPathPrefix(e.target.value)} className="w-40 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.pathPrefixPlaceholder")} />
          <input value={pathContains} onChange={(e) => setPathContains(e.target.value)} className="w-40 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.pathContainsPlaceholder")} />
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-36 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.symbolPlaceholder")} />
          <input value={repoId} onChange={(e) => setRepoId(e.target.value)} className="w-36 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.repoIdPlaceholder")} />
          <input value={minScore} onChange={(e) => setMinScore(e.target.value)} className="w-24 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.minScorePlaceholder")} />
          <select value={sort} onChange={(e) => setSort(e.target.value as "relevance" | "path")} className="w-32 rounded-lg border px-2 py-2 text-sm">
            <option value="relevance">relevance</option>
            <option value="path">path</option>
          </select>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} className="w-28 rounded-lg border px-2 py-2 text-sm" placeholder={t("codeSearch.branchPlaceholder")} />
          <button onClick={applySearch} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">{t("codeSearch.find")}</button>
          <button onClick={() => void saveCurrent()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"><BookmarkPlus className="h-4 w-4" /> {t("codeSearch.save")}</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className={`rounded-xl border p-3 ${isDarkTheme ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <h3 className="mb-2 text-sm font-semibold">{t("codeSearch.savedSearches")}</h3>
          <div className="space-y-2">
            {groupedSaved.map(([groupName, groupItems]) => (
              <div key={groupName} className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{groupName}</div>
                {groupItems.map((s) => (
              <div key={s.id} className="rounded border px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="block min-w-0 flex-1 text-left text-sm hover:underline truncate"
                    onClick={() => {
                      const next = new URLSearchParams();
                      next.set("q", s.query);
                      const f = savedFilters(s);
                      if (f.extension) next.set("ext", f.extension);
                      if (f.path_prefix) next.set("path", f.path_prefix);
                      if (f.path_contains) next.set("path_contains", f.path_contains);
                      if (f.symbol) next.set("symbol", f.symbol);
                      if (f.repo_id) next.set("repo_id", f.repo_id);
                      if (f.min_score) next.set("min_score", f.min_score);
                      if (f.sort) next.set("sort", f.sort);
                      if (f.branch) next.set("branch", f.branch);
                      setQuery(s.query);
                      setExtension(f.extension ?? "");
                      setPathPrefix(f.path_prefix ?? "");
                      setPathContains(f.path_contains ?? "");
                      setSymbol(f.symbol ?? "");
                      setRepoId(f.repo_id ?? "");
                      setMinScore(f.min_score ?? "");
                      setSort((f.sort as "relevance" | "path") ?? "relevance");
                      setBranch(f.branch ?? "main");
                      setParams(next);
                    }}
                    title={s.name}
                  >
                    {s.name}
                  </button>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="rounded border px-1.5 py-1 text-xs"
                      title={t("codeSearch.run")}
                      onClick={() => {
                        const next = new URLSearchParams();
                        next.set("q", s.query);
                        const f = savedFilters(s);
                        if (f.extension) next.set("ext", f.extension);
                        if (f.path_prefix) next.set("path", f.path_prefix);
                        if (f.path_contains) next.set("path_contains", f.path_contains);
                        if (f.symbol) next.set("symbol", f.symbol);
                        if (f.repo_id) next.set("repo_id", f.repo_id);
                        if (f.min_score) next.set("min_score", f.min_score);
                        if (f.sort) next.set("sort", f.sort);
                        if (f.branch) next.set("branch", f.branch);
                        setParams(next);
                      }}
                    >
                      <Play className="h-3 w-3" />
                    </button>
                    <button
                      className="rounded border px-1.5 py-1 text-xs"
                      title={t("codeSearch.updateFromCurrent")}
                      onClick={async () => {
                        try {
                          await updateSavedSearch(s.id, {
                            name: s.name,
                            query: qFromUrl || s.query,
                            filters: {
                              extension: params.get("ext") || null,
                              path_prefix: params.get("path") || null,
                              path_contains: params.get("path_contains") || null,
                              symbol: params.get("symbol") || null,
                              repo_id: params.get("repo_id") || null,
                              min_score: params.get("min_score") || null,
                              sort: params.get("sort") || "relevance",
                              branch: params.get("branch") || "main",
                              __meta: { ...savedMeta(s) },
                            },
                          });
                          toast.success(t("codeSearch.savedUpdated"));
                          void loadSaved();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : t("codeSearch.updateFailed"));
                        }
                      }}
                    >
                      <Save className="h-3 w-3" />
                    </button>
                    <button
                      className={`rounded border px-1.5 py-1 text-xs ${savedMeta(s).pinned ? "text-amber-600" : ""}`}
                      title={t("codeSearch.pinUnpin")}
                      onClick={async () => {
                        const f = savedFilters(s);
                        const meta = savedMeta(s);
                        try {
                          await updateSavedSearch(s.id, {
                            filters: {
                              ...f,
                              __meta: { ...meta, pinned: !meta.pinned },
                            },
                          });
                          void loadSaved();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : t("codeSearch.pinUpdateFailed"));
                        }
                      }}
                    >
                      <Star className="h-3 w-3" />
                    </button>
                    <button
                      className="rounded border px-1.5 py-1 text-xs text-red-600"
                      title="Delete"
                      onClick={async () => {
                        try {
                          await deleteSavedSearch(s.id);
                          toast.success(t("codeSearch.deleted"));
                          void loadSaved();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : t("codeSearch.deleteFailed"));
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    defaultValue={s.name}
                    className="w-full rounded border px-1.5 py-1 text-xs"
                    onBlur={async (e) => {
                      const nextName = e.target.value.trim();
                      if (!nextName || nextName === s.name) return;
                      try {
                        await updateSavedSearch(s.id, { name: nextName });
                        void loadSaved();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : t("codeSearch.renameFailed"));
                      }
                    }}
                  />
                  <input
                    defaultValue={savedMeta(s).group}
                    className="w-24 rounded border px-1.5 py-1 text-xs"
                    title={t("codeSearch.group")}
                    onBlur={async (e) => {
                      const group = e.target.value.trim() || "Default";
                      const f = savedFilters(s);
                      const meta = savedMeta(s);
                      try {
                        await updateSavedSearch(s.id, {
                          filters: {
                            ...f,
                            __meta: { ...meta, group },
                          },
                        });
                        void loadSaved();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : t("codeSearch.groupUpdateFailed"));
                      }
                    }}
                  />
                </div>
              </div>
            ))}</div>
            ))}
            {saved.length === 0 ? <div className="text-xs text-slate-500">{t("codeSearch.noSavedQueries")}</div> : null}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-3">
          {(facets.extensions?.length || facets.repositories?.length) ? (
            <div className={`rounded-xl border p-3 text-xs ${isDarkTheme ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
              <div className="mb-2 font-semibold">{t("codeSearch.facets")}</div>
              {facets.extensions?.length ? (
                <div className="mb-2">
                  <div className="mb-1 text-slate-500">{t("codeSearch.extensions")}</div>
                  <div className="flex flex-wrap gap-1">
                    {facets.extensions.map((e) => (
                      <button key={e.value} className="rounded border px-2 py-0.5" onClick={() => { setExtension(e.value); }}>
                        .{e.value} ({e.count})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {loading ? <div className="text-sm text-slate-500">{t("codeSearch.searching")}</div> : null}
          {!loading && grouped.length === 0 ? <div className="text-sm text-slate-500">{t("codeSearch.noResults")}</div> : null}
          {grouped.map(([repo, rows]) => (
            <div key={repo} className={`rounded-xl border p-3 ${isDarkTheme ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
              <h3 className="mb-2 text-sm font-semibold">{repo}</h3>
              <div className="space-y-2">
                {rows.map((r, idx) => (
                  <button
                    key={`${r.repository_id}-${r.path}-${idx}`}
                    className="block w-full rounded border p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => navigate(`/repositories/${r.repository_id}/code?path=${encodeURIComponent(r.path)}&branch=${encodeURIComponent(r.branch)}`)}
                  >
                    <div className="text-xs text-slate-500">{r.path}</div>
                    {r.snippet ? <div className="mt-1 text-sm">{r.snippet}</div> : null}
                    {r.highlights && r.highlights.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {r.highlights.slice(0, 2).map((h, i) => (
                          <div key={i} className="text-xs text-slate-500">
                            {h}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] text-slate-400">score: {r.score.toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
