import type { ThemeColors } from "../../theme";

interface RepoStateTabsProps {
  theme: ThemeColors;
  value: string;
  onChange: (state: string) => void;
}

const OPTIONS = [
  { id: "open", label: "Открытые" },
  { id: "closed", label: "Закрытые" },
  { id: "all", label: "Все" },
];

export default function RepoStateTabs({ theme, value, onChange }: RepoStateTabsProps) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
      {OPTIONS.map((opt) => {
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
