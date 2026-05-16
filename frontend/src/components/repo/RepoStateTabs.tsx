import type { ThemeColors } from "../../theme";
import { useUserPreferences } from "../../context/UserPreferencesContext";

interface RepoStateTabsProps {
  theme: ThemeColors;
  value: string;
  onChange: (state: string) => void;
}

export default function RepoStateTabs({ theme, value, onChange }: RepoStateTabsProps) {
  const { t } = useUserPreferences();
  const options = [
    { id: "open", label: t("repo.tabs.open") },
    { id: "closed", label: t("repo.tabs.closed") },
    { id: "all", label: t("repo.tabs.all") },
  ];

  return (
    <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? theme.bg3 : "transparent",
              color: active ? theme.text : theme.text3,
              boxShadow: active ? theme.shadowSm : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
