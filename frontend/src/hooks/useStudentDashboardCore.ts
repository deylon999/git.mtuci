import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../context/AuthUserContext";
import type {
  StudentActivityFeedItem,
  StudentActivitySummary,
  StudentDashboardCourse,
  StudentGroupRanking,
  StudentRecentRepository,
} from "../api/studentDashboardApi";
import { getStudentDashboardBundleDeduped } from "../api/studentRequestDedup";
import { useStudentNavCountsOptional } from "../context/StudentNavCountsContext";
import { useUserPreferences } from "../context/UserPreferencesContext";
import { translate, translateWithParams } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";
import {
  firstNameFromFullName,
  formatDeadlineLabel,
  type StudentDeadlineItem,
} from "../utils/studentDeadlines";

export interface StudentDashboardKpiView {
  reposTotal: number;
  reposWeekSub: string;
  commitsWeek: number;
  commitsWeekSub: string;
  coursesActive: number;
  coursesSub: string;
  deadlinesToday: number;
  deadlinesTodaySub: string;
}

export interface StudentDashboardCore {
  loading: boolean;
  error: string | null;
  firstName: string;
  groupName: string | null;
  deadlines: StudentDeadlineItem[];
  deadlinesToday: number;
  deadlinesTodaySub: string;
  kpi: StudentDashboardKpiView | null;
  courses: StudentDashboardCourse[];
  recentRepos: StudentRecentRepository[];
  activitySummary: StudentActivitySummary | null;
  activityFeed: StudentActivityFeedItem[];
  groupRanking: StudentGroupRanking | null;
  refetch: () => void;
}

const initial: StudentDashboardCore = {
  loading: true,
  error: null,
  firstName: "",
  groupName: null,
  deadlines: [],
  deadlinesToday: 0,
  deadlinesTodaySub: "",
  kpi: null,
  courses: [],
  recentRepos: [],
  activitySummary: null,
  activityFeed: [],
  groupRanking: null,
  refetch: () => {},
};

function mapDeadlines(
  items: Awaited<ReturnType<typeof getStudentDashboardBundleDeduped>>["stats"]["deadlines"],
  now: Date,
): StudentDeadlineItem[] {
  return items.map((dl) => {
    const deadline = new Date(dl.deadline);
    return {
      id: dl.id,
      assignmentId: dl.assignment_id,
      courseId: dl.course_id,
      name: dl.name,
      course: dl.course,
      deadline,
      timeLabel: formatDeadlineLabel(deadline, now, getI18nLocale()),
      urgency: dl.urgency,
    };
  });
}

/** "A and B" for deadlines due today, otherwise the next one; built here because the server sends Russian text. */
function deadlinesTodaySubtitle(deadlines: StudentDeadlineItem[], now: Date): string {
  const locale = getI18nLocale();
  const today = deadlines.filter((d) => d.deadline.toDateString() === now.toDateString());
  if (today.length > 0) {
    const names = today.slice(0, 2).map((d) => d.name);
    return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  }
  const next = deadlines
    .filter((d) => d.deadline.getTime() > now.getTime())
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())[0];
  if (next) return translateWithParams(locale, "student.dashboard.kpiDeadlinesNext", { title: next.name });
  return translate(locale, "student.dashboard.kpiDeadlinesNone");
}

function buildKpiView(
  stats: Awaited<ReturnType<typeof getStudentDashboardBundleDeduped>>["stats"],
  deadlinesTodaySub: string,
): StudentDashboardKpiView {
  const locale = getI18nLocale();
  const { kpi } = stats;
  const reposSub =
    kpi.repos_week_delta > 0
      ? translateWithParams(locale, "student.dashboard.kpiReposWeek", { n: kpi.repos_week_delta })
      : kpi.repos_total > 0
        ? translate(locale, "student.dashboard.kpiReposNoNew")
        : translate(locale, "student.dashboard.kpiReposNone");

  const commitsSub =
    kpi.commits_week_avg != null
      ? translateWithParams(locale, "student.dashboard.kpiCommitsAvg", { avg: kpi.commits_week_avg.toFixed(1) })
      : kpi.commits_week > 0
        ? translate(locale, "student.dashboard.kpiCommitsWeek")
        : translate(locale, "student.dashboard.kpiCommitsNoneWeek");

  return {
    reposTotal: kpi.repos_total,
    reposWeekSub: reposSub,
    commitsWeek: kpi.commits_week,
    commitsWeekSub: commitsSub,
    coursesActive: kpi.courses_active,
    coursesSub: translateWithParams(locale, "student.dashboard.kpiAssignmentsTotal", { n: kpi.assignments_total }),
    deadlinesToday: kpi.deadlines_today,
    deadlinesTodaySub,
  };
}

export function useStudentDashboardCore(): StudentDashboardCore {
  const [state, setState] = useState<StudentDashboardCore>(initial);
  const [reloadToken, setReloadToken] = useState(0);
  const setSidebarCounts = useStudentNavCountsOptional()?.setSidebarCounts;
  const { user } = useAuthUser();
  const { language } = useUserPreferences();
  // The session check replaces the user object on navigation; only reload when something we show changes.
  const userId = user?.id;
  const userFullName = user?.full_name;
  const userGroup = user?.group_name ?? null;

  const refetch = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        if (!userId) {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: translate(getI18nLocale(), "auth.loginRequired"),
            }));
          }
          return;
        }
        const bundle = await getStudentDashboardBundleDeduped(5, 12);

        if (cancelled) return;

        setSidebarCounts?.(bundle.stats.sidebar);

        const now = new Date();
        const deadlines = mapDeadlines(bundle.stats.deadlines, now);
        const todaySub = deadlinesTodaySubtitle(deadlines, now);
        setState({
          loading: false,
          error: null,
          firstName: firstNameFromFullName(userFullName ?? "", getI18nLocale()),
          groupName: userGroup,
          deadlines,
          deadlinesToday: bundle.stats.kpi.deadlines_today,
          deadlinesTodaySub: todaySub,
          kpi: buildKpiView(bundle.stats, todaySub),
          courses: bundle.stats.courses,
          recentRepos: bundle.recent_repositories,
          activitySummary: bundle.activity_summary,
          activityFeed: bundle.activity_feed,
          groupRanking: bundle.group_ranking,
          refetch,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          ...initial,
          loading: false,
          error: e instanceof Error ? e.message : translate(getI18nLocale(), "student.errors.loadDashboard"),
          refetch,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [setSidebarCounts, reloadToken, refetch, userId, userFullName, userGroup, language]);

  return { ...state, refetch };
}
