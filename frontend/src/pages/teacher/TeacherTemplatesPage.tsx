import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getTeacherTemplates, type TeacherTemplateRepo } from "../../api/teacherDashboardApi";
import {
  TeacherBadge,
  TeacherBtn,
  TeacherEmptyState,
  TeacherLinkBtn,
  TeacherLoadingBlock,
  TeacherPageShell,
  TeacherPageTitle,
  TeacherSurface,
  useTeacherTheme,
} from "../../components/teacher/teacherPageUi";
import { avatarColorsForName, initialsFromName } from "../../components/teacher/teacherUiConstants";
import { useUserPreferences } from "../../context/UserPreferencesContext";

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
  }, [t]);

  return (
    <TeacherPageShell className="gap-3.5 min-w-0">
      <TeacherPageTitle
        theme={theme}
        title={t("teacher.templates.title")}
        subtitle={t("teacher.templates.subtitle")}
        actions={
          <TeacherLinkBtn to="/repositories/new" theme={theme} variant="purple">
            + {t("teacher.templates.create")}
          </TeacherLinkBtn>
        }
      />

      {loading ? (
        <TeacherLoadingBlock theme={theme} />
      ) : error ? (
        <p className="text-xs" style={{ color: theme.danger }}>
          {error}
        </p>
      ) : items.length === 0 ? (
        <TeacherSurface theme={theme} title={t("teacher.templates.emptyTitle")}>
          <TeacherEmptyState theme={theme}>{t("teacher.templates.emptyBody")}</TeacherEmptyState>
        </TeacherSurface>
      ) : (
        <TeacherSurface theme={theme} title={t("teacher.templates.listTitle")} noPadding>
          {items.map((item) => {
            const { bg, fg } = avatarColorsForName(item.repo_name);
            const abbr = initialsFromName(item.repo_name.replace(/[-_]/g, " "));
            const sub = [
              item.repo_name,
              item.description,
              tp(
                item.assignments_count === 1
                  ? "teacher.templates.usedInOne"
                  : "teacher.templates.usedInMany",
                { count: item.assignments_count },
              ),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={item.repo_name}
                className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors"
                style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.bg3;
                }}
              >
                <div
                  className="h-[30px] w-[30px] rounded-[7px] flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: bg, color: fg }}
                >
                  {abbr.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-medium" style={{ color: theme.text }}>
                    {item.repo_name}
                  </p>
                  <p className="text-[10px] mt-0.5 font-mono" style={{ color: theme.text2 }}>
                    {sub}
                  </p>
                </div>
                <TeacherBadge tone="blue">{t("teacher.templates.badgePublic")}</TeacherBadge>
                <div className="flex gap-1.5 shrink-0">
                  <TeacherBtn theme={theme} className="!py-1 !px-2.5 !text-[11px]">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {t("teacher.templates.openGitea")}
                  </TeacherBtn>
                </div>
              </div>
            );
          })}
        </TeacherSurface>
      )}
    </TeacherPageShell>
  );
}
