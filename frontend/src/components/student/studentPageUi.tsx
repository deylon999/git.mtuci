import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { translate } from "../../i18n";
import { getI18nLocale } from "../../i18n/runtime";
import { getTheme, type ThemeColors } from "../../theme";

export function StudentPageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`w-full min-w-0 flex flex-col gap-5 ${className}`}>{children}</div>;
}

export function StudentPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  theme,
  accent = "accent",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  theme: ThemeColors;
  accent?: "accent" | "success" | "warning";
}) {
  const accentMap = {
    accent: { bg: `${theme.accent}22`, color: theme.accent2 },
    success: { bg: `${theme.success}18`, color: theme.success },
    warning: { bg: `${theme.warning}18`, color: theme.warning },
  };
  const a = accentMap[accent];

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: a.bg, color: a.color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: theme.text }}>
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm leading-relaxed" style={{ color: theme.text2 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function StudentToolbar({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: ThemeColors;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {children}
    </div>
  );
}

export function StudentSurface({
  children,
  theme,
  className = "",
  padding = true,
}: {
  children: React.ReactNode;
  theme: ThemeColors;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden ${padding ? "" : ""} ${className}`}
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {padding ? <div className="p-1">{children}</div> : children}
    </div>
  );
}

export function StudentStatGrid({
  items,
  theme,
}: {
  items: { label: string; value: string | number; sub?: string; color?: string }[];
  theme: ThemeColors;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {items.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border px-3.5 py-3"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <p className="text-xs" style={{ color: theme.text2 }}>
            {card.label}
          </p>
          <p
            className="mt-0.5 text-xl font-semibold tabular-nums"
            style={{ color: card.color ?? theme.text }}
          >
            {card.value}
          </p>
          {card.sub ? (
            <p className="mt-0.5 text-[10px] leading-snug" style={{ color: theme.text3 }}>
              {card.sub}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function StudentErrorBanner({ message, theme }: { message: string; theme: ThemeColors }) {
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm"
      style={{
        backgroundColor: `${theme.danger}12`,
        borderColor: `${theme.danger}40`,
        color: theme.danger,
      }}
    >
      {message}
    </div>
  );
}

export function StudentLoadingRow({
  theme,
  label,
}: {
  theme: ThemeColors;
  label?: string;
}) {
  const displayLabel = label ?? translate(getI18nLocale(), "common.loading");
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {displayLabel}
    </div>
  );
}

export function StudentEmptyState({
  theme,
  title,
  hint,
}: {
  theme: ThemeColors;
  title: string;
  hint?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl border py-14 px-6 text-center"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      <p className="text-sm font-medium" style={{ color: theme.text2 }}>
        {title}
      </p>
      {hint ? (
        <p className="text-xs max-w-md leading-relaxed" style={{ color: theme.text3 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function useStudentTheme(isDarkTheme?: boolean) {
  return getTheme(isDarkTheme ?? false);
}
