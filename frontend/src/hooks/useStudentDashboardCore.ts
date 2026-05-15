import { useCallback, useEffect, useState } from "react";
import { getMe } from "../api/authApi";
import {
  getStudentActivityFeed,
  getStudentActivitySummary,
  getStudentDashboardStats,
  getStudentGroupRanking,
  getStudentRecentRepositories,
  type StudentActivityFeedItem,
  type StudentActivitySummary,
  type StudentDashboardCourse,
  type StudentGroupRanking,
  type StudentRecentRepository,
} from "../api/studentDashboardApi";
import { useStudentNavCountsOptional } from "../context/StudentNavCountsContext";
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
  items: Awaited<ReturnType<typeof getStudentDashboardStats>>["deadlines"],
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
      timeLabel: formatDeadlineLabel(deadline, now),
      urgency: dl.urgency,
    };
  });
}

function buildKpiView(stats: Awaited<ReturnType<typeof getStudentDashboardStats>>): StudentDashboardKpiView {
  const { kpi } = stats;
  const reposSub =
    kpi.repos_week_delta > 0
      ? `+${kpi.repos_week_delta} на этой неделе`
      : kpi.repos_total > 0
        ? "Без новых за неделю"
        : "Пока нет репозиториев";

  const commitsSub =
    kpi.commits_week_avg != null
      ? `Среднее: ${kpi.commits_week_avg.toFixed(1)}/день`
      : kpi.commits_week > 0
        ? "За последние 7 дней"
        : "Скоро";

  return {
    reposTotal: kpi.repos_total,
    reposWeekSub: reposSub,
    commitsWeek: kpi.commits_week,
    commitsWeekSub: commitsSub,
    coursesActive: kpi.courses_active,
    coursesSub: `${kpi.assignments_total} заданий всего`,
    deadlinesToday: kpi.deadlines_today,
    deadlinesTodaySub: kpi.deadlines_today_sub,
  };
}

export function useStudentDashboardCore(): StudentDashboardCore {
  const [state, setState] = useState<StudentDashboardCore>(initial);
  const [reloadToken, setReloadToken] = useState(0);
  const navCounts = useStudentNavCountsOptional();

  const refetch = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [me, stats, recentRepos, activitySummary, activityFeed, groupRanking] = await Promise.all([
          getMe({ force: true }),
          getStudentDashboardStats(),
          getStudentRecentRepositories(5),
          getStudentActivitySummary(),
          getStudentActivityFeed(12),
          getStudentGroupRanking(),
        ]);

        if (cancelled) return;

        navCounts?.setSidebarCounts(stats.sidebar);

        const now = new Date();
        const deadlines = mapDeadlines(stats.deadlines, now);

        setState({
          loading: false,
          error: null,
          firstName: firstNameFromFullName(me.full_name),
          groupName: me.group_name ?? null,
          deadlines,
          deadlinesToday: stats.kpi.deadlines_today,
          deadlinesTodaySub: stats.kpi.deadlines_today_sub,
          kpi: buildKpiView(stats),
          courses: stats.courses,
          recentRepos,
          activitySummary,
          activityFeed,
          groupRanking,
          refetch,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          ...initial,
          loading: false,
          error: e instanceof Error ? e.message : "Не удалось загрузить данные",
          refetch,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [navCounts?.setSidebarCounts, reloadToken, refetch]);

  return { ...state, refetch };
}
