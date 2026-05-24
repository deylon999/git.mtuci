import { Search, Download, GitCommit, GitPullRequest, GitBranch, Plus, Trash2, GitMerge, ArrowUpCircle, Wifi } from "lucide-react";
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getTodayStats, getHotRepos, getTopUsers, getHourlyActivity, getRecentActivity } from "../api/adminApi";
import type { TodayStats, HotRepoStat, TopUserStat, HourlyActivity, ActivityItem } from "../api/types";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { getAdminPageTheme, getAdminNativeSelectProps } from "../layout/adminPageTheme";

interface ActivityPageProps {
  isDarkTheme?: boolean;
}

const getColors = (isDark: boolean) => {
  const ui = getAdminPageTheme(isDark);
  const c = ui.colors;
  return {
    pageBg: c.pageBg,
    cardBg: c.card,
    cardBg2: c.input,
    border: c.borderInput,
    accent: "#2563eb",
    accent2: "#3b82f6",
    danger: "#e24b4a",
    success: "#4caf50",
    warning: "#f59e0b",
    purple: "#8b5cf6",
    teal: "#14b8a6",
    violet: "#7c3aed",
    textPrimary: c.text,
    textName: c.textName,
    textSecondary: c.textCell,
    textMuted: c.textMuted,
  };
};

// Иконки событий
const EventIcons = {
  commit: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="3"/><path d="M1 8h4M11 8h4" strokeLinecap="round"/></svg>,
  pr: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 6v2a4 4 0 004 4h2M14 8l-2-2 2-2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  pull_request: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M4 6v2a4 4 0 004 4h2M14 8l-2-2 2-2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  push: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 12V4M4 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  create: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="1" width="12" height="14" rx="2"/><path d="M8 5v6M5 8h6" strokeLinecap="round"/></svg>,
  repo_created: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="1" width="12" height="14" rx="2"/><path d="M8 5v6M5 8h6" strokeLinecap="round"/></svg>,
  fork: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="8" cy="13" r="2"/><path d="M4 6v1a4 4 0 008 0V6M8 11V9" strokeLinecap="round"/></svg>,
  merge: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="8" r="2"/><path d="M4 6v5M4 6c0 3 8 2 8 2" strokeLinecap="round"/></svg>,
  pr_merge: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="8" r="2"/><path d="M4 6v5M4 6c0 3 8 2 8 2" strokeLinecap="round"/></svg>,
  delete: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 9h6l1-9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  repo_deleted: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 9h6l1-9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  login: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 8H6M9 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  logout: <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3M5 8h5M8 5L5 8l3 3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

export default function ActivityPage({ isDarkTheme = true }: ActivityPageProps) {
  const { t, tp, language } = useUserPreferences();
  const dateLocale = language === "en" ? "en-US" : "ru-RU";
  const colors = getColors(isDarkTheme);
  const adminSelect = getAdminNativeSelectProps(isDarkTheme, "compact");
  const toolbarSelectStyle: CSSProperties = {
    fontSize: "11px",
    padding: "5px 8px",
    borderRadius: "7px",
    border: `0.5px solid ${colors.border}`,
    cursor: "pointer",
    fontFamily: "inherit",
    backgroundColor: adminSelect.style.backgroundColor,
    color: adminSelect.style.color,
    ...(isDarkTheme ? { colorScheme: "dark" } : {}),
  };
  const pageSizeSelectStyle: CSSProperties = {
    padding: "3px 6px",
    borderRadius: "6px",
    border: `0.5px solid ${colors.border}`,
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "inherit",
    backgroundColor: adminSelect.style.backgroundColor,
    color: adminSelect.style.color,
    ...(isDarkTheme ? { colorScheme: "dark" } : {}),
  };
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [hotRepos, setHotRepos] = useState<HotRepoStat[]>([]);
  const [topUsers, setTopUsers] = useState<TopUserStat[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [pageOffset, setPageOffset] = useState(0);
  const [realtimeEvents, setRealtimeEvents] = useState<Array<{id: number, type: string, message: string, time: Date}>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const eventIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const statCardStyle: CSSProperties = {
    background: colors.cardBg,
    border: `1px solid ${colors.border}`,
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    minHeight: "104px",
  };

  // Подпись снизу карточки — как на странице «Логи» (одинаковый 10px, выровнено по центру)
  const renderTrend = (delta: number | undefined) => {
    const footerStyle: CSSProperties = {
      fontSize: "10px",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    };
    if (delta === undefined || delta === 0) {
      return (
        <span style={{ ...footerStyle, color: colors.textMuted }}>
          <span>—</span>
          <span>{t("admin.activity.vsYesterday")}</span>
        </span>
      );
    }
    const isPositive = delta > 0;
    const absValue = Math.abs(delta);
    const color = isPositive ? colors.success : colors.danger;
    const arrow = isPositive ? "↑" : "↓";
    const sign = isPositive ? "+" : "−";

    return (
      <span style={footerStyle}>
        <span style={{ color, fontWeight: 500 }}>{arrow} {sign}{absValue}</span>
        <span style={{ color: colors.textMuted, fontWeight: 400 }}>{t("admin.activity.vsYesterday")}</span>
      </span>
    );
  };

  const renderStatCard = (label: string, value: number, delta: number | undefined) => (
    <div style={statCardStyle}>
      <div style={{ fontSize: "11px", color: colors.textMuted, marginBottom: "4px" }}>{label}</div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          fontSize: "22px",
          fontWeight: 600,
          color: colors.textPrimary,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "3px" }}>{renderTrend(delta)}</div>
    </div>
  );

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "all">("today");

  // Available users and event types for filters
  const eventTypes = [
    { value: "", label: t("admin.activity.filterAllTypes") },
    { value: "push", label: "Push" },
    { value: "commit", label: "Commit" },
    { value: "pull_request", label: "Pull Request" },
    { value: "pr_merge", label: "PR Merge" },
    { value: "repo_created", label: t("admin.activity.eventRepoCreated") },
    { value: "repo_deleted", label: t("admin.activity.eventRepoDeleted") },
    { value: "fork", label: "Fork" },
    { value: "login", label: t("admin.activity.eventLogin") },
  ];

  // Calculate date range (moved outside loadData to avoid recreating)
  const getDateRange = useCallback(() => {
    const now = new Date();
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    
    switch (dateRange) {
      case "today":
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        dateTo = now.toISOString();
        break;
      case "week":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFrom = weekAgo.toISOString();
        dateTo = now.toISOString();
        break;
      case "month":
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        dateFrom = monthAgo.toISOString();
        dateTo = now.toISOString();
        break;
      case "all":
        dateFrom = undefined;
        dateTo = undefined;
        break;
    }
    return { dateFrom, dateTo };
  }, [dateRange]);

  // Load data function
  const loadData = useCallback(async () => {
    try {
      const { dateFrom, dateTo } = getDateRange();
      const filters = {
        search: searchQuery || undefined,
        activityType: eventTypeFilter || undefined,
        userId: userFilter || undefined,
        dateFrom,
        dateTo,
      };
      
      const [statsData, reposData, usersData, hourlyData, activityData] = await Promise.all([
        getTodayStats(),
        getHotRepos(),
        getTopUsers(),
        getHourlyActivity(),
        getRecentActivity(pageSize, pageOffset, filters),
      ]);
      setStats(statsData);
      setHotRepos(reposData);
      setTopUsers(usersData);
      setHourlyActivity(hourlyData);
      setActivities(activityData.activities);
      setTotalActivities(activityData.total);
    } catch (error) {
      console.error("Failed to load activity data:", error);
    } finally {
      setLoading(false);
    }
  }, [pageSize, pageOffset, searchQuery, eventTypeFilter, userFilter, dateRange, getDateRange])

  // WebSocket connection
  useEffect(() => {
    const wsUrl = `ws://localhost:8000/ws/activity`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WebSocket message:", data);
      
      if (data.type === "new_activity") {
        // Add to realtime events
        setRealtimeEvents(prev => [{
          id: ++eventIdRef.current,
          type: data.activity_type,
          message: `${data.user_name} ${data.activity_type} to ${data.repo_name}: ${data.message}`,
          time: new Date()
        }, ...prev].slice(0, 5)); // Keep last 5
        
        // Real-time update hot repos if repo_name exists
        if (data.repo_name) {
          setHotRepos(prev => {
            const existing = prev.find(r => r.name === data.repo_name);
            let updated: HotRepoStat[];
            
            if (existing) {
              // Update existing repo
              updated = prev.map(r => 
                r.name === data.repo_name 
                  ? { ...r, events: r.events + 1 }
                  : r
              );
            } else {
              // Add new repo to the list
              const newRepo: HotRepoStat = {
                name: data.repo_name,
                url: data.repo_url || `#`,
                events: 1,
                language: null
              };
              updated = [...prev, newRepo];
            }
            
            // Sort by events desc and take top 5
            return updated
              .sort((a, b) => b.events - a.events)
              .slice(0, 5);
          });
        }
        
        // Refresh stats after short delay
        setTimeout(() => loadData(), 500);
      } else if (data.type === "stats_updated") {
        setTimeout(() => loadData(), 500);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [loadData]);

  // Track if filters have changed (not on initial mount)
  const filtersChangedRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Reset offset when filters change and reload data
  const handleFilterChange = useCallback((setter: (value: any) => void, value: any) => {
    setter(value);
    setPageOffset(0);
    filtersChangedRef.current = true;
  }, []);

  // Initial load only - empty deps
  useEffect(() => {
    loadData();
    isInitialLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data when filters or pagination change (skip initial mount)
  useEffect(() => {
    if (!isInitialLoadRef.current) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, pageOffset, searchQuery, eventTypeFilter, userFilter, dateRange]);

  const getEventIconBg = (type: string) => {
    switch (type) {
      case "commit": return { bg: `${colors.accent}20`, color: colors.accent2 };
      case "pr":
      case "pull_request": return { bg: `${colors.teal}20`, color: colors.teal };
      case "push": return { bg: `${colors.success}20`, color: colors.success };
      case "create":
      case "repo_created": return { bg: `${colors.purple}20`, color: colors.purple };
      case "fork": return { bg: `${colors.warning}20`, color: colors.warning };
      case "merge":
      case "pr_merge": return { bg: `${colors.violet}20`, color: colors.violet };
      case "delete":
      case "repo_deleted": return { bg: `${colors.danger}20`, color: colors.danger };
      case "login": return { bg: `${colors.accent2}20`, color: colors.accent2 };
      case "logout": return { bg: `${colors.textMuted}20`, color: colors.textMuted };
      default: return { bg: `${colors.accent}20`, color: colors.accent2 };
    }
  };

  const mapActivityTag = (tag: string) => {
    const keys: Record<string, string> = {
      Коммит: "admin.activity.typeCommit",
      Commit: "admin.activity.typeCommit",
      "Pull Request": "admin.activity.typePr",
      PR: "admin.activity.typePr",
      Push: "admin.activity.typePush",
      Создание: "admin.activity.typeCreate",
      Created: "admin.activity.typeCreate",
      Форк: "admin.activity.typeFork",
      Fork: "admin.activity.typeFork",
      Merge: "admin.activity.typeMerge",
      Удаление: "admin.activity.typeDelete",
      Deleted: "admin.activity.typeDelete",
      Вход: "admin.activity.typeLogin",
      Login: "admin.activity.typeLogin",
      "Sign in": "admin.activity.typeLogin",
      Выход: "admin.activity.typeLogout",
      Logout: "admin.activity.typeLogout",
      "Sign out": "admin.activity.typeLogout",
    };
    const key = keys[tag];
    return key ? t(key) : tag;
  };

  const getTagStyle = (type: string) => {
    switch (type) {
      case "Коммит":
      case "Commit": return { background: `${colors.accent2}10`, color: colors.accent2 };
      case "Pull Request": return { background: `${colors.teal}10`, color: colors.teal };
      case "Push": return { background: `${colors.success}10`, color: colors.success };
      case "Создание":
      case "Created": return { background: `${colors.purple}10`, color: colors.purple };
      case "Форк":
      case "Fork": return { background: `${colors.warning}10`, color: colors.warning };
      case "Merge": return { background: `${colors.violet}10`, color: colors.violet };
      case "Удаление":
      case "Deleted": return { background: `${colors.danger}10`, color: colors.danger };
      case "Вход":
      case "Login":
      case "Sign in": return { background: `${colors.accent2}10`, color: colors.accent2 };
      case "Выход":
      case "Logout":
      case "Sign out": return { background: `${colors.textMuted}20`, color: colors.textMuted };
      default: return { background: `${colors.accent2}10`, color: colors.accent2 };
    }
  };

  return (
    <div style={{ backgroundColor: colors.pageBg, minHeight: "100vh", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: colors.textPrimary }}>{t("admin.activity.title")}</div>
          <div style={{ fontSize: "12px", color: colors.textSecondary, marginTop: "3px" }}>{t("admin.activity.subtitleFull")}</div>
        </div>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 500,
          padding: "7px 14px", borderRadius: "7px", border: `0.5px solid ${colors.border}`,
          background: colors.cardBg, color: colors.textPrimary, cursor: "pointer"
        }}>
          <Download size={14} /> {t("admin.activity.export")}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        {loading ? (
          <div style={{ gridColumn: "span 4", textAlign: "center", color: colors.textSecondary }}>{t("admin.activity.loading")}</div>
        ) : stats ? (
          <>
            {renderStatCard(t("admin.activity.statEventsToday"), stats.total_events, stats.total_events_delta)}
            {renderStatCard(t("admin.activity.statCommits"), stats.commits, stats.commits_delta)}
            {renderStatCard(t("admin.activity.statActiveUsers"), stats.active_users, stats.active_users_delta)}
            {renderStatCard(t("admin.activity.statNewRepos"), stats.new_repositories, stats.new_repositories_delta)}
          </>
        ) : (
          <div style={{ gridColumn: "span 4", textAlign: "center", color: colors.textSecondary }}>{t("admin.activity.loadError")}</div>
        )}
      </div>

      {/* Main Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px" }}>
        {/* Left - Feed */}
        <div>
          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", background: colors.cardBg,
            border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "10px"
          }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center", gap: "6px", background: colors.pageBg,
              border: `0.5px solid ${colors.border}`, borderRadius: "7px", padding: "5px 10px"
            }}>
              <Search size={13} color={colors.textMuted} />
              <input
                type="text"
                placeholder={t("admin.activity.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
                style={{
                  background: "transparent", border: "none", outline: "none", fontSize: "12px",
                  color: colors.textName, width: "100%", fontFamily: "inherit"
                }}
                className={isDarkTheme ? "placeholder-[#6e7681]" : "placeholder-slate-400"}
              />
            </div>
            <div style={{ width: "0.5px", height: "20px", background: colors.border }} />
            {/* WebSocket Status */}
            <div style={{
              display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px",
              background: wsConnected ? `${colors.success}20` : `${colors.danger}20`,
              borderRadius: "6px", fontSize: "11px", color: wsConnected ? colors.success : colors.danger
            }}>
              <Wifi size={12} />
              {wsConnected ? "Online" : "Offline"}
            </div>
            <div style={{ width: "0.5px", height: "20px", background: colors.border }} />
            <select
              value={eventTypeFilter}
              onChange={(e) => handleFilterChange(setEventTypeFilter, e.target.value)}
              className="admin-native-select"
              style={toolbarSelectStyle}
            >
              {eventTypes.map(type => (
                <option key={type.value} value={type.value} style={adminSelect.optionStyle}>{type.label}</option>
              ))}
            </select>
            <select
              value={userFilter || ""}
              onChange={(e) => handleFilterChange(setUserFilter, e.target.value || null)}
              className="admin-native-select"
              style={toolbarSelectStyle}
            >
              <option value="" style={adminSelect.optionStyle}>{t("admin.activity.filterAllUsers")}</option>
              {topUsers.map(user => (
                <option key={user.user_id} value={user.user_id} style={adminSelect.optionStyle}>{user.user_name}</option>
              ))}
            </select>
            <select
              value={dateRange}
              onChange={(e) => handleFilterChange(setDateRange, e.target.value)}
              className="admin-native-select"
              style={toolbarSelectStyle}
            >
              <option value="today" style={adminSelect.optionStyle}>{t("admin.activity.periodToday")}</option>
              <option value="week" style={adminSelect.optionStyle}>{t("admin.activity.periodWeek")}</option>
              <option value="month" style={adminSelect.optionStyle}>{t("admin.activity.periodMonth")}</option>
              <option value="all" style={adminSelect.optionStyle}>{t("admin.activity.periodAll")}</option>
            </select>
          </div>

          {/* Feed */}
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "8px 16px", background: colors.cardBg2, borderBottom: `0.5px solid ${colors.border}`,
              fontSize: "11px", fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em"
            }}>
              {tp("admin.activity.todayHeader", { date: new Date().toLocaleDateString(dateLocale) })}
            </div>

            {activities.map((activity: ActivityItem) => {
              const iconBg = getEventIconBg(activity.type);
              const tagStyle = getTagStyle(activity.tag);
              return (
                <div key={activity.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px",
                  borderBottom: `0.5px solid ${colors.border}`, cursor: "pointer"
                }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: "1px", background: iconBg.bg, color: iconBg.color
                  }}>
                    {EventIcons[activity.type as keyof typeof EventIcons]}
                  </div>
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "8px", fontWeight: 700, flexShrink: 0, marginTop: "1px", background: `${activity.color}20`, color: activity.color
                  }}>
                    {activity.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: colors.textPrimary, lineHeight: 1.5 }}>
                      <strong style={{ fontWeight: 600 }}>{activity.user}</strong>
                      {activity.type === "commit" && t("admin.activity.actionCommit")}
                      {(activity.type === "pr" || activity.type === "pull_request") && t("admin.activity.actionPr")}
                      {activity.type === "push" && t("admin.activity.actionPush")}
                      {(activity.type === "create" || activity.type === "repo_created") && t("admin.activity.actionCreate")}
                      {activity.type === "fork" && t("admin.activity.actionFork")}
                      {(activity.type === "merge" || activity.type === "pr_merge") && t("admin.activity.actionMerge")}
                      {(activity.type === "delete" || activity.type === "repo_deleted") && t("admin.activity.actionDelete")}
                      {activity.type === "login" && t("admin.activity.actionLogin")}
                      {activity.type === "logout" && t("admin.activity.actionLogout")}
                      {activity.repo ? (
                        <span style={{ color: colors.accent2, fontFamily: "monospace", fontSize: "11px" }}>{activity.repo}</span>
                      ) : null}
                      {activity.message &&
                        activity.type !== "push" &&
                        activity.type !== "delete" &&
                        activity.type !== "repo_deleted" &&
                        activity.type !== "login" &&
                        activity.type !== "logout" && (
                        <span style={{ color: colors.textSecondary, fontStyle: "italic", fontSize: "11px" }}> — «{activity.message}»</span>
                      )}
                      {activity.message && activity.type === "push" && (
                        <span style={{ color: colors.textSecondary, fontSize: "11px" }}> {activity.message}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                      <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "5px", fontWeight: 500, ...tagStyle }}>{mapActivityTag(activity.tag)}</span>
                      <span style={{ fontSize: "10px", color: colors.textMuted }}>{activity.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderTop: `0.5px solid ${colors.border}`, fontSize: "11px", color: colors.textSecondary
            }}>
              {/* Left: Count */}
              <span>{tp("admin.activity.shownOf", { shown: activities.length, total: totalActivities })}</span>
              
              {/* Center: Page buttons */}
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                {Math.floor(pageOffset / pageSize) > 0 && (
                  <button
                    onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))}
                    style={{
                      padding: "3px 8px", borderRadius: "6px", border: `0.5px solid ${colors.border}`,
                      fontSize: "11px", cursor: "pointer", color: colors.textSecondary, background: "transparent"
                    }}
                  >←</button>
                )}
                <span style={{
                  padding: "3px 10px", borderRadius: "6px", fontSize: "11px",
                  color: "#fff", background: colors.accent, fontWeight: 500
                }}>
                  {Math.floor(pageOffset / pageSize) + 1}
                </span>
                {Math.floor(pageOffset / pageSize) + 1 < Math.ceil(totalActivities / pageSize) && (
                  <button
                    onClick={() => setPageOffset(pageOffset + pageSize < totalActivities ? pageOffset + pageSize : pageOffset)}
                    style={{
                      padding: "3px 8px", borderRadius: "6px", border: `0.5px solid ${colors.border}`,
                      fontSize: "11px", cursor: "pointer", color: colors.textSecondary, background: "transparent"
                    }}
                  >→</button>
                )}
              </div>
              
              {/* Right: Page size selector */}
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <span>{t("admin.activity.perPage")}</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPageOffset(0); }}
                  className="admin-native-select"
                  style={pageSizeSelectStyle}
                >
                  <option value={10} style={adminSelect.optionStyle}>10</option>
                  <option value={25} style={adminSelect.optionStyle}>25</option>
                  <option value={50} style={adminSelect.optionStyle}>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Hour Activity */}
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "10px" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `0.5px solid ${colors.border}`, fontSize: "11px",
              fontWeight: 600, color: colors.textPrimary, display: "flex", alignItems: "center", justifyContent: "space-between",
              background: colors.cardBg2
            }}>
              {t("admin.activity.activityByHour")} <span style={{ fontSize: "10px", color: colors.textSecondary, fontWeight: 400 }}>{t("admin.activity.today")}</span>
            </div>
            <div style={{ padding: "12px 14px 6px", height: "120px", position: "relative" }}>
              {/* Tooltip */}
              {(() => {
                const [tooltip, setTooltip] = useState<{x: number, y: number, hour: number, count: number} | null>(null);
                const [hoveredHour, setHoveredHour] = useState<number | null>(null);
                const maxCount = Math.max(...hourlyActivity.map(h => h.count), 1);
                const peakHour = hourlyActivity.find(h => h.count === maxCount)?.hour;
                
                return (
                  <>
                    {/* Bars */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "90px", overflow: "hidden" }}>
                      {hourlyActivity.map((item) => {
                        // Peak takes ~85% of container height (80px), min 4px for visibility
                        const containerHeight = 90;
                        const maxBarHeight = containerHeight * 0.85; // ~76px for peak
                        const barHeight = item.count > 0 
                          ? Math.max((item.count / maxCount) * maxBarHeight, 4) 
                          : 4;
                        const isPeak = item.hour === peakHour && item.count > 0;
                        const isCurrent = item.is_current;
                        const isHovered = hoveredHour === item.hour;
                        
                        return (
                          <div key={item.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div
                              style={{
                                width: "100%",
                                background: isHovered
                                  ? "#fff"
                                  : isCurrent 
                                    ? colors.accent 
                                    : isPeak 
                                      ? `${colors.accent}80` 
                                      : `${colors.accent}30`,
                                borderRadius: "3px 3px 0 0",
                                height: `${barHeight}px`,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                boxShadow: isHovered 
                                  ? `0 0 12px #fff80` 
                                  : isPeak 
                                    ? `0 0 8px ${colors.accent}50` 
                                    : "none",
                              }}
                              onMouseEnter={(e) => {
                                setHoveredHour(item.hour);
                                const rect = e.currentTarget.getBoundingClientRect();
                                const parent = e.currentTarget.parentElement?.parentElement?.parentElement;
                                if (parent) {
                                  const parentRect = parent.getBoundingClientRect();
                                  setTooltip({
                                    x: rect.left - parentRect.left + rect.width / 2,
                                    y: rect.top - parentRect.top - 35,
                                    hour: item.hour,
                                    count: item.count
                                  });
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredHour(null);
                                setTooltip(null);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Time Labels */}
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      marginTop: "6px",
                      padding: "0 2px"
                    }}>
                      {["00:00", "06:00", "12:00", "18:00", "23:59"].map((time) => (
                        <span key={time} style={{ fontSize: "9px", color: colors.textSecondary }}>
                          {time}
                        </span>
                      ))}
                    </div>
                    
                    {/* Tooltip */}
                    {tooltip && (
                      <div style={{
                        position: "absolute",
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: "translateX(-50%)",
                        background: "rgba(0, 0, 0, 0.85)",
                        color: "#fff",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        zIndex: 1000,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                      }}>
                        <div style={{ fontWeight: 600 }}>{String(tooltip.hour).padStart(2, "0")}:00</div>
                        <div style={{ opacity: 0.8 }}>{tp("admin.activity.eventsCount", { n: tooltip.count })}</div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Top Users */}
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `0.5px solid ${colors.border}`, fontSize: "11px",
              fontWeight: 600, color: colors.textPrimary, display: "flex", alignItems: "center", justifyContent: "space-between",
              background: colors.cardBg2
            }}>
              {t("admin.activity.topUsers")} <span style={{ fontSize: "10px", color: colors.textSecondary, fontWeight: 400 }}>{t("admin.activity.byCommits")}</span>
            </div>
            {topUsers.map((user, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px",
                borderBottom: i < topUsers.length - 1 ? `0.5px solid ${colors.border}` : "none"
              }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "9px", fontWeight: 700, flexShrink: 0, background: `${user.color}20`, color: user.color
                }}>
                  {user.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: colors.textPrimary }}>{user.name}</span>
                    <span style={{ fontSize: "11px", color: colors.textSecondary }}>{user.count}</span>
                  </div>
                  <div style={{ height: "3px", background: colors.cardBg2, borderRadius: "2px", overflow: "hidden", marginTop: "3px" }}>
                    <div style={{ height: "100%", borderRadius: "2px", background: colors.accent, width: `${user.percent}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Hot Repos */}
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderBottom: `0.5px solid ${colors.border}`, fontSize: "11px",
              fontWeight: 600, color: colors.textPrimary, display: "flex", alignItems: "center", justifyContent: "space-between",
              background: colors.cardBg2
            }}>
              <span>{t("admin.activity.hotRepos")}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: colors.textSecondary, fontWeight: 400 }}>{t("admin.activity.byEvents")}</span>
                <div 
                  title={t("admin.activity.hotReposHint")}
                  style={{ cursor: "help", display: "flex", alignItems: "center" }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ stroke: colors.textMuted, strokeWidth: 1.5 }}>
                    <circle cx="8" cy="8" r="6"/>
                    <path d="M8 6.5V8M8 10.5h0" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>
            {hotRepos.length === 0 ? (
              <div style={{ padding: "16px 14px", fontSize: "12px", color: colors.textSecondary, textAlign: "center" }}>
                {t("admin.activity.quietToday")}
              </div>
            ) : (
              hotRepos.slice(0, 5).map((repo, i) => (
                <a 
                  key={i} 
                  href={repo.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    padding: "8px 14px",
                    borderBottom: i < Math.min(hotRepos.length, 5) - 1 ? `0.5px solid ${colors.border}` : "none", 
                    fontSize: "12px",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.cardBg2;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {repo.language ? (
                    <span 
                      title={repo.language}
                      style={{ 
                        fontSize: "10px", 
                        padding: "2px 5px", 
                        borderRadius: "3px", 
                        background: colors.accent + "20",
                        color: colors.accent,
                        fontWeight: 500,
                        flexShrink: 0
                      }}
                    >
                      {repo.language.slice(0, 3).toUpperCase()}
                    </span>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, stroke: colors.textMuted, strokeWidth: 1.2 }}>
                      <rect x="2" y="1" width="12" height="14" rx="2"/>
                      <path d="M5 5h6M5 8h6M5 11h3" strokeLinecap="round"/>
                    </svg>
                  )}
                  <span style={{ flex: 1, color: colors.textPrimary, fontFamily: "monospace", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repo.name}</span>
                  <span style={{ color: colors.textSecondary, fontSize: "11px", whiteSpace: "nowrap" }}>{tp("admin.activity.eventsCount", { n: repo.events })}</span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
