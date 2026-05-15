import { Link } from "react-router-dom";
import {
  CircleDot,
  Code2,
  GitPullRequest,
  BookOpen,
  Settings,
} from "lucide-react";
import type { StudentRepoSummary } from "../../api/studentDashboardApi";
import type { ThemeColors } from "../../theme";

export type RepoNavTabId = "code" | "issues" | "pulls" | "wiki" | "settings";

interface RepoNavTabsProps {
  theme: ThemeColors;
  repoId: string;
  active: RepoNavTabId;
  giteaLinks?: StudentRepoSummary["gitea_links"] | null;
  openIssuesCount?: number | null;
  openPrCount?: number | null;
}

const TABS: {
  id: RepoNavTabId;
  label: string;
  icon: typeof Code2;
  giteaKey: keyof NonNullable<StudentRepoSummary["gitea_links"]>;
  countKey?: "issues" | "pulls";
}[] = [
  { id: "code", label: "Код", icon: Code2, giteaKey: "code" },
  { id: "issues", label: "Issues", icon: CircleDot, giteaKey: "issues", countKey: "issues" },
  { id: "pulls", label: "Pull requests", icon: GitPullRequest, giteaKey: "pulls", countKey: "pulls" },
  { id: "wiki", label: "Wiki", icon: BookOpen, giteaKey: "wiki" },
  { id: "settings", label: "Settings", icon: Settings, giteaKey: "settings" },
];

export default function RepoNavTabs({
  theme,
  repoId,
  active,
  giteaLinks,
  openIssuesCount,
  openPrCount,
}: RepoNavTabsProps) {
  const counts: Record<string, number | null | undefined> = {
    issues: openIssuesCount,
    pulls: openPrCount,
  };

  return (
    <nav
      className="flex flex-wrap items-center gap-0 border-b overflow-x-auto"
      style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      aria-label="Разделы репозитория"
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

        const className =
          "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors";
        const style = {
          borderColor: isActive ? theme.accent2 : "transparent",
          color: isActive ? theme.text : theme.text2,
          backgroundColor: isActive ? `${theme.accent}10` : "transparent",
        };

        if (tab.id === "code") {
          return (
            <Link key={tab.id} to={`/repositories/${repoId}/code`} className={className} style={style}>
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </Link>
          );
        }

        const href = giteaLinks?.[tab.giteaKey];
        if (!href) {
          return (
            <span
              key={tab.id}
              className={`${className} opacity-40 cursor-not-allowed`}
              style={{ ...style, borderColor: "transparent" }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
              {badge}
            </span>
          );
        }

        return (
          <a
            key={tab.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${className} hover:opacity-90`}
            style={style}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {tab.label}
            {badge}
          </a>
        );
      })}
    </nav>
  );
}
