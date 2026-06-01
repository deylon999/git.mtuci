import { useEffect, useMemo, useState } from "react";
import { GitCommit, GitFork } from "lucide-react";
import { getTeacherActivity, type TeacherActivityItem } from "../../api/teacherDashboardApi";
import {
  TeacherActivityRow,
  TeacherAvatar,
  TeacherBadge,
  TeacherChartBars,
  TeacherEmptyState,
  TeacherLoadingBlock,
  TeacherMainAside,
  TeacherPageShell,
  TeacherPageTitle,
  TeacherStatGrid,
  TeacherSurface,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { avatarColorsForName, initialsFromName } from "../../components/teacher/teacherUiConstants";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface Props {
  isDarkTheme?: boolean;
}

const ACTIVITY_ICON_STYLES = [
  { bg: "rgba(37,99,235,0.12)", stroke: "#60a5fa" },
  { bg: "rgba(76,175,80,0.12)", stroke: "#4caf50" },
  { bg: "rgba(139,92,246,0.12)", stroke: "#a78bfa" },
  { bg: "rgba(245,158,11,0.12)", stroke: "#f59e0b" },
  { bg: "rgba(226,75,74,0.12)", stroke: "#e24b4a" },
];

function activityBadgeTone(type: string): "blue" | "warning" | "success" | "neutral" {
  if (type.includes("pr") || type.includes("submit")) return "warning";
  if (type.includes("fork") || type.includes("repo")) return "success";
  return "blue";
}

export default function TeacherActivityPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t } = useUserPreferences();

  function activityTypeLabel(type: string): string {
    const key = `teacher.activity.types.${type}` as const;
    const translated = t(key);
    return translated !== key ? translated : type;
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TeacherActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getTeacherActivity(100)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("teacher.errors.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayItems = items.filter((i) => new Date(i.created_at) >= today);
    const commits = todayItems.filter((i) => i.activity_type === "commit").length;
    const students = new Set(todayItems.map((i) => i.student_name).filter(Boolean));
    const prs = todayItems.filter(
      (i) => i.activity_type.includes("submit") || i.activity_type.includes("pr"),
    ).length;
    return {
      events: todayItems.length,
      commits,
      activeStudents: students.size,
      prs,
    };
  }, [items]);

  const topStudents = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.student_name || item.activity_type !== "commit") continue;
      counts.set(item.student_name, (counts.get(item.student_name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [items]);

  const hourBuckets = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, "0"), value: 0 }));
    for (const item of items) {
      if (item.activity_type !== "commit") continue;
      const h = new Date(item.created_at).getHours();
      buckets[h].value += 1;
    }
    return buckets;
  }, [items]);

  const maxTop = Math.max(1, ...topStudents.map(([, v]) => v));

  return (
    <TeacherPageShell className="gap-3.5 min-w-0">
      <TeacherPageTitle
        theme={theme}
        title={t("teacher.activity.title")}
        subtitle={t("teacher.activity.subtitle")}
      />

      {!loading && items.length > 0 ? (
        <TeacherStatGrid
          theme={theme}
          items={[
            { label: t("teacher.activity.statEventsToday"), value: stats.events },
            { label: t("teacher.activity.statCommits"), value: stats.commits },
            {
              label: t("teacher.activity.statActiveStudents"),
              value: stats.activeStudents,
              color: theme.success,
            },
            { label: t("teacher.activity.statNewPr"), value: stats.prs, color: theme.warning },
          ]}
        />
      ) : null}

      {loading ? (
        <TeacherLoadingBlock theme={theme} />
      ) : error ? (
        <p className="text-xs" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : (
        <TeacherMainAside
          main={
            <TeacherSurface theme={theme} title={t("teacher.activity.feedTitle")} noPadding>
              {items.length === 0 ? (
                <TeacherEmptyState theme={theme}>{t("teacher.activity.noEvents")}</TeacherEmptyState>
              ) : (
                items.map((item, i) => {
                  const style = ACTIVITY_ICON_STYLES[i % ACTIVITY_ICON_STYLES.length];
                  const isFork = item.activity_type === "fork";
                  return (
                    <TeacherActivityRow
                      key={item.id}
                      theme={theme}
                      icon={
                        isFork ? (
                          <GitFork className="h-3.5 w-3.5" style={{ color: style.stroke }} />
                        ) : (
                          <GitCommit className="h-3.5 w-3.5" style={{ color: style.stroke }} />
                        )
                      }
                      iconBg={style.bg}
                      text={
                        <>
                          <strong>{item.student_name ?? t("teacher.activity.studentFallback")}</strong>
                          {item.repo_name ? (
                            <span>
                              {" "}
                              → {item.repo_name}
                              {item.message ? (
                                <span style={{ color: theme.text2 }}>
                                  : «{item.message.length > 50 ? `${item.message.slice(0, 50)}…` : item.message}»
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </>
                      }
                      time={`${formatRelativeTime(new Date(item.created_at))}`}
                      badge={
                        <TeacherBadge tone={activityBadgeTone(item.activity_type)}>
                          {activityTypeLabel(item.activity_type)}
                        </TeacherBadge>
                      }
                    />
                  );
                })
              )}
            </TeacherSurface>
          }
          aside={
            <>
              <TeacherSurface theme={theme} title={t("teacher.activity.topStudentsTitle")} noPadding>
                <div className="px-3.5 py-2.5 flex flex-col gap-2">
                  {topStudents.length === 0 ? (
                    <TeacherEmptyState theme={theme} compact>
                      {t("teacher.activity.noEvents")}
                    </TeacherEmptyState>
                  ) : (
                    topStudents.map(([name, count]) => {
                      const { bg, fg } = avatarColorsForName(name);
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <div
                            className="h-[26px] w-[26px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: bg, color: fg }}
                          >
                            {initialsFromName(name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs">
                              <span style={{ color: theme.text }}>{name}</span>
                              <span style={{ color: theme.text2 }}>{count}</span>
                            </div>
                            <div
                              className="h-[3px] rounded-sm mt-1 overflow-hidden"
                              style={{ backgroundColor: theme.bg4 }}
                            >
                              <div
                                className="h-full rounded-sm"
                                style={{
                                  width: `${(count / maxTop) * 100}%`,
                                  backgroundColor: theme.accent,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TeacherSurface>
              <TeacherSurface
                theme={theme}
                title={t("teacher.activity.hourlyTitle")}
                subtitle={t("teacher.activity.hourlySubtitle")}
                noPadding
              >
                <TeacherChartBars theme={theme} items={hourBuckets.filter((_, i) => i % 3 === 0)} heightClass="h-[70px]" />
              </TeacherSurface>
            </>
          }
        />
      )}
    </TeacherPageShell>
  );
}
