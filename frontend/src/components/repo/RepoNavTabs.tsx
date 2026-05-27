import { Link } from "react-router-dom";
import {
  CircleDot,
  Code2,
  GitBranch,
  GitPullRequest,
  BookOpen,
  Settings,
} from "lucide-react";
import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";

export type RepoNavTabId = "code" | "branches" | "issues" | "pulls" | "wiki" | "settings";

interface RepoNavTabsProps {
  theme: ThemeColors;
  repoId: string;
  active: RepoNavTabId;
  openIssuesCount?: number | null;
  openPrCount?: number | null;
}

const TABS: {
  id: RepoNavTabId;
  labelKey?: string;
  label?: string;
  icon: typeof Code2;
  segment: string;
  countKey?: "issues" | "pulls";
}[] = [
  { id: "code", labelKey: "repo.tabs.code", icon: Code2, segment: "code" },
  { id: "branches", label: "Branches", icon: GitBranch, segment: "branches" },
  { id: "issues", label: "Issues", icon: CircleDot, segment: "issues", countKey: "issues" },
  { id: "pulls", label: "Pull requests", icon: GitPullRequest, segment: "pulls", countKey: "pulls" },
  { id: "wiki", label: "Wiki", icon: BookOpen, segment: "wiki" },
  { id: "settings", label: "Settings", icon: Settings, segment: "settings" },
];

export default function RepoNavTabs({
  theme,
  repoId,
  active,
  openIssuesCount,
  openPrCount,
}: RepoNavTabsProps) {
  const { t } = useUserPreferences();
  const counts: Record<string, number | null | undefined> = {
    issues: openIssuesCount,
    pulls: openPrCount,
  };

  return (
    <nav
      className="flex flex-wrap items-center gap-0 border-b overflow-x-auto"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      aria-label={t("repo.tabs.sectionsAria")}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        const count = tab.countKey ? counts[tab.countKey] : null;
        const badge =
          count != null && count > 0 ? (
            <span
              className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{
                backgroundColor: isActive ? `${theme.accent}30` : theme.bg4,
                color: isActive ? theme.accent2 : theme.text3,
              }}
            >
              {count}
            </span>
          ) : null;

        return (
          <Link
            key={tab.id}
            to={`/repositories/${repoId}/${tab.segment}`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors hover:opacity-90"
            style={{
              borderColor: isActive ? theme.accent2 : "transparent",
              color: isActive ? theme.text : theme.text2,
              backgroundColor: isActive ? `${theme.accent}10` : "transparent",
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tab.labelKey ? t(tab.labelKey) : tab.label}
            {badge}
          </Link>
        );
      })}
    </nav>
  );
}
