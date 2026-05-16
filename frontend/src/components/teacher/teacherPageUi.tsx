import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { getTheme, type ThemeColors } from "../../theme";

export function TeacherPageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`w-full min-w-0 flex flex-col gap-5 ${className}`}>{children}</div>;
}

export function TeacherPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  theme,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  theme: ThemeColors;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${theme.accent}22`, color: theme.accent2 }}
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

export function TeacherStatGrid({
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
            <p className="mt-0.5 text-[10px]" style={{ color: theme.text3 }}>
              {card.sub}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function TeacherSurface({
  children,
  theme,
  title,
  action,
  className = "",
}: {
  children: React.ReactNode;
  theme: ThemeColors;
  title?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {title ? (
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-b"
          style={{ borderColor: theme.border }}
        >
          <h2 className="text-sm font-semibold" style={{ color: theme.text }}>
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function TeacherLoadingRow({ theme, label }: { theme: ThemeColors; label?: string }) {
  const { t } = useUserPreferences();
  const text = label ?? t("common.loading");
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: theme.text2 }}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {text}
    </div>
  );
}

export function useTeacherTheme(isDarkTheme?: boolean) {
  return getTheme(isDarkTheme ?? false);
}
