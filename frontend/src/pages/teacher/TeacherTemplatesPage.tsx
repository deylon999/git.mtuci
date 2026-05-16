import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileCode, Loader2, Plus } from "lucide-react";
import { getTeacherTemplates, type TeacherTemplateRepo } from "../../api/teacherDashboardApi";
import {
  TeacherPageHeader,
  TeacherPageShell,
  TeacherSurface,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface Props {
  isDarkTheme?: boolean;
}

export default function TeacherTemplatesPage({ isDarkTheme = false }: Props) {
  const theme = useTeacherTheme(isDarkTheme);
  const { t, tp } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TeacherTemplateRepo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTeacherTemplates()
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
        icon={FileCode}
        title={t("teacher.templates.title")}
        subtitle={t("teacher.templates.subtitle")}
        actions={
          <Link
            to="/repositories/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: theme.success }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("teacher.templates.create")}
          </Link>
        }
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
        <TeacherSurface theme={theme} title={t("teacher.templates.emptyTitle")}>
          <p className="px-4 py-8 text-sm text-center" style={{ color: theme.text2 }}>
            {t("teacher.templates.emptyBody")}
          </p>
        </TeacherSurface>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((item) => (
            <article
              key={item.repo_name}
              className="rounded-xl border p-4 flex flex-col gap-2"
              style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
            >
              <h2 className="font-semibold font-mono text-sm" style={{ color: theme.text }}>
                {item.repo_name}
              </h2>
              {item.description ? (
                <p className="text-xs line-clamp-2" style={{ color: theme.text2 }}>
                  {item.description}
                </p>
              ) : null}
              <p className="text-xs" style={{ color: theme.text3 }}>
                {tp(
                  item.assignments_count === 1
                    ? "teacher.templates.usedInOne"
                    : "teacher.templates.usedInMany",
                  { count: item.assignments_count },
                )}
              </p>
              {item.courses.length > 0 ? (
                <p className="text-[10px]" style={{ color: theme.text3 }}>
                  {item.courses.join(", ")}
                </p>
              ) : null}
              {item.last_assignment_at ? (
                <p className="text-[10px]" style={{ color: theme.text3 }}>
                  {tp("teacher.templates.updated", {
                    time: formatRelativeTime(new Date(item.last_assignment_at)),
                  })}
                </p>
              ) : null}
              <div className="mt-auto pt-2 flex gap-2">
                <Link
                  to="/repositories"
                  className="inline-flex items-center gap-1 text-xs"
                  style={{ color: theme.accent2 }}
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("teacher.templates.repositoriesLink")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </TeacherPageShell>
  );
}
