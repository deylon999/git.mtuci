import { useEffect, useState } from "react";
import { Activity, GitCommit, GitFork, Loader2 } from "lucide-react";
import { getTeacherActivity, type TeacherActivityItem } from "../../api/teacherDashboardApi";
import {
  TeacherPageHeader,
  TeacherPageShell,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface Props {
  isDarkTheme?: boolean;
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
  }, []);

  return (
    <TeacherPageShell>
      <TeacherPageHeader
        theme={theme}
        icon={Activity}
        title={t("teacher.activity.title")}
        subtitle={t("teacher.activity.subtitle")}
      />

      {loading ? (
        <div className="flex justify-center py-12 gap-2 text-sm" style={{ color: theme.text2 }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="text-sm" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : items.length === 0 ? (
        <p
          className="text-sm py-12 text-center rounded-xl border"
          style={{ color: theme.text2, borderColor: theme.border, backgroundColor: theme.bg3 }}
        >
          {t("teacher.activity.noEvents")}
        </p>
      ) : (
        <ul
          className="rounded-xl border overflow-hidden divide-y"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderColor: theme.border }}
            >
              {item.activity_type === "fork" ? (
                <GitFork className="h-4 w-4 mt-0.5 shrink-0" style={{ color: theme.accent2 }} />
              ) : (
                <GitCommit className="h-4 w-4 mt-0.5 shrink-0" style={{ color: theme.accent2 }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ color: theme.text }}>
                  <span className="font-medium">{item.student_name ?? t("teacher.activity.studentFallback")}</span>
                  <span style={{ color: theme.text2 }}>
                    {" "}
                    · {activityTypeLabel(item.activity_type)}
                  </span>
                  {item.repo_name ? (
                    <span className="font-mono text-xs" style={{ color: theme.text3 }}>
                      {" "}
                      {item.repo_name}
                    </span>
                  ) : null}
                </p>
                {item.message ? (
                  <p className="text-xs mt-0.5 truncate font-mono" style={{ color: theme.text3 }}>
                    {item.message}
                  </p>
                ) : null}
              </div>
              <span className="text-[10px] shrink-0" style={{ color: theme.text3 }}>
                {formatRelativeTime(new Date(item.created_at))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </TeacherPageShell>
  );
}
