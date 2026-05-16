import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { getTheme } from "../theme";

interface FeaturePlaceholderProps {
  isDarkTheme?: boolean;
  title: string;
  description: string;
  hint?: string;
  icon?: ReactNode;
}

export default function FeaturePlaceholder({
  isDarkTheme = false,
  title,
  description,
  hint,
  icon,
}: FeaturePlaceholderProps) {
  const theme = getTheme(isDarkTheme);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: theme.border, backgroundColor: theme.bg3 }}
      >
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2}, ${theme.warning})`,
          }}
        />
        <div className="px-6 py-10 flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${theme.accent}18`, color: theme.accent2 }}
          >
            {icon ?? <Construction className="h-8 w-8" />}
          </div>
          <span
            className="mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${theme.warning}22`, color: theme.warning }}
          >
            Скоро
          </span>
          <h1 className="text-xl font-bold mb-2" style={{ color: theme.text }}>
            {title}
          </h1>
          <p className="text-sm leading-relaxed max-w-md" style={{ color: theme.text2 }}>
            {description}
          </p>
          {hint ? (
            <p className="text-xs mt-4 max-w-sm" style={{ color: theme.text3 }}>
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
