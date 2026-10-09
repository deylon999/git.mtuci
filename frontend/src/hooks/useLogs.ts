import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getLogs, getLogsStats } from "../api/adminApi";
import type { LogLevel, LogSource, LogsFilters, LogsPagination, LogEntry, LogsStats } from "../api/types";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const LOGS_TIME_FILTERS = ["all", "today", "hour", "week", "month"] as const;
export type LogsTimeFilter = (typeof LOGS_TIME_FILTERS)[number];

export function useLogsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [level, setLevel] = useState<LogLevel | "">(() => (searchParams.get("level") as LogLevel) || "");
  const [source, setSource] = useState<LogSource | "">(() => (searchParams.get("source") as LogSource) || "");
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [timeFilter, setTimeFilter] = useState<LogsTimeFilter>(() => {
    const fromUrl = searchParams.get("time");
    return LOGS_TIME_FILTERS.includes(fromUrl as LogsTimeFilter) ? (fromUrl as LogsTimeFilter) : "all";
  });
  const [sort, setSort] = useState<"desc" | "asc">(() => (searchParams.get("sort") === "asc" ? "asc" : "desc"));

  // Memoize date_from based on timeFilter to avoid constant recalculations
  const dateFrom = useMemo(() => {
    const now = new Date();
    switch (timeFilter) {
      case "today":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case "hour":
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case "week":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "month":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return null;
    }
  }, [timeFilter]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (level) params.set("level", level);
    if (source) params.set("source", source);
    if (search) params.set("search", search);
    if (timeFilter !== "all") params.set("time", timeFilter);
    if (sort) params.set("sort", sort);
    setSearchParams(params, { replace: true });
  }, [level, source, search, timeFilter, sort, setSearchParams]);

  const getFilters = useCallback((): LogsFilters => {
    const filters: LogsFilters = {
      sort,
    };

    if (level) filters.level = level;
    if (source) filters.source = source;
    if (search) filters.search = search;
    if (dateFrom) filters.date_from = dateFrom;

    return filters;
  }, [level, source, search, dateFrom, sort]);

  const resetFilters = useCallback(() => {
    setLevel("");
    setSource("");
    setSearch("");
    setTimeFilter("all");
    setSort("desc");
  }, []);

  return {
    level,
    setLevel,
    source,
    setSource,
    search,
    setSearch,
    timeFilter,
    setTimeFilter,
    sort,
    setSort,
    getFilters,
    resetFilters,
  };
}

export function useLogsPagination(initialLimit: number = 10) {
  const [limit, setLimit] = useState(initialLimit);
  const [page, setPage] = useState(1);

  const offset = (page - 1) * limit;

  const getPagination = useCallback((): LogsPagination => {
    return { limit, offset };
  }, [limit, offset]);

  const goToPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const nextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const resetPagination = useCallback(() => {
    setPage(1);
  }, []);

  return {
    limit,
    setLimit,
    page,
    setPage,
    offset,
    getPagination,
    goToPage,
    nextPage,
    prevPage,
    resetPagination,
  };
}

export function useLogsData(filters?: LogsFilters, pagination?: LogsPagination) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize filters and pagination by their fields (callers pass fresh objects every render) to prevent refetch loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on fields on purpose
  const memoizedFilters = useMemo(() => filters, [
    filters?.level,
    filters?.source,
    filters?.search,
    filters?.date_from,
    filters?.date_to,
    filters?.sort,
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on fields on purpose
  const memoizedPagination = useMemo(() => pagination, [pagination?.limit, pagination?.offset]);

  const requestIdRef = useRef(0);

  // Only the latest request may update state, so quick filter changes can't show an older result.
  const fetchLogs = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await getLogs(memoizedFilters, memoizedPagination);
      if (requestId !== requestIdRef.current) return;
      setLogs(response.logs);
      setTotal(response.total);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load logs");
      setLogs([]);
      setTotal(0);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [memoizedFilters, memoizedPagination]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, total, loading, error, refetch: fetchLogs };
}

export function useLogsStats() {
  const [stats, setStats] = useState<LogsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLogsStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
