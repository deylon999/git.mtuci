import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserPreferences } from "../../context/UserPreferencesContext";
import { getTheme, type ThemeColors } from "../../theme";
import {
  avatarColorsForName,
  courseBannerForId,
  courseEmojiForTitle,
  initialsFromName,
  type WaitingBadgeTone,
} from "./teacherUiConstants";

export function useTeacherTheme(isDarkTheme?: boolean) {
  return getTheme(isDarkTheme ?? false);
}

/** Compact page wrapper — tight vertical rhythm like teacher-app.html */
export function TeacherPageShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`w-full min-w-0 flex flex-col gap-3.5 ${className}`}>{children}</div>;
}

/** Plain page title row matching teacher-app.html `.ph` / `.pt` */
export function TeacherPageTitle({
  title,
  subtitle,
  actions,
  theme,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  theme: ThemeColors;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold leading-tight" style={{ color: theme.text }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-xs" style={{ color: theme.text2 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function TeacherPageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  theme,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  theme: ThemeColors;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.accent}18`, color: theme.accent2 }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight" style={{ color: theme.text }}>
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-snug" style={{ color: theme.text2 }}>
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {items.map((card) => (
        <div
          key={card.label}
          className="rounded-[10px] border px-4 py-4"
          style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
        >
          <p className="mb-1 text-[11px] leading-snug" style={{ color: theme.text2 }}>
            {card.label}
          </p>
          <p
            className="text-xl font-semibold tabular-nums leading-none"
            style={{ color: card.color ?? theme.text }}
          >
            {card.value}
          </p>
          {card.sub ? (
            <p className="mt-1 text-[10px]" style={{ color: theme.text3 }}>
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
  subtitle,
  action,
  className = "",
  bodyClassName = "",
  noPadding,
}: {
  children: ReactNode;
  theme: ThemeColors;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`rounded-[10px] border overflow-hidden ${className}`}
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {title ? (
        <div
          className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-b-[0.5px] text-[11px] font-semibold"
          style={{ borderColor: theme.border, backgroundColor: theme.bg2, color: theme.text }}
        >
          <span className="flex items-center gap-2 min-w-0">
            {title}
            {subtitle ? (
              <span className="font-normal text-[10px] truncate" style={{ color: theme.text2 }}>
                {subtitle}
              </span>
            ) : null}
          </span>
          {action}
        </div>
      ) : null}
      <div className={noPadding ? bodyClassName : ` ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function TeacherMainAside({
  main,
  aside,
  className = "",
}: {
  main: ReactNode;
  aside: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-[1fr_minmax(260px,300px)] gap-3.5 ${className}`}>
      <div className="flex flex-col gap-3.5 min-w-0">{main}</div>
      <div className="flex flex-col gap-3.5 min-w-0">{aside}</div>
    </div>
  );
}

export function TeacherBtn({
  children,
  theme,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  theme: ThemeColors;
  variant?: "default" | "primary" | "purple" | "success" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text },
    primary: { backgroundColor: theme.accent, borderColor: "transparent", color: "#fff" },
    purple: {
      backgroundColor: "rgba(124,58,237,0.15)",
      borderColor: "rgba(124,58,237,0.35)",
      color: "#a78bfa",
    },
    success: {
      backgroundColor: "rgba(76,175,80,0.12)",
      borderColor: "rgba(76,175,80,0.25)",
      color: theme.success,
    },
    danger: {
      backgroundColor: "rgba(226,75,74,0.1)",
      borderColor: "rgba(226,75,74,0.25)",
      color: theme.danger,
    },
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[11px] font-medium transition hover:opacity-90 disabled:opacity-50 ${className}`}
      style={styles[variant]}
      {...props}
    >
      {children}
    </button>
  );
}

export function TeacherLinkBtn({
  to,
  children,
  theme,
  variant = "primary",
  className = "",
}: {
  to: string;
  children: ReactNode;
  theme: ThemeColors;
  variant?: "primary" | "purple" | "success" | "default";
  className?: string;
}) {
  const variantClass =
    variant === "purple"
      ? "border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.15)] text-[#a78bfa]"
      : variant === "success"
        ? "border-[rgba(76,175,80,0.25)] bg-[rgba(76,175,80,0.12)]"
        : variant === "default"
          ? ""
          : "border-transparent text-white";
  const style: React.CSSProperties =
    variant === "primary"
      ? { backgroundColor: theme.accent, color: "#fff" }
      : variant === "success"
        ? { color: theme.success }
        : variant === "default"
          ? { backgroundColor: theme.bg3, borderColor: theme.border, color: theme.text }
          : {};
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[11px] font-medium ${variantClass} ${className}`}
      style={style}
    >
      {children}
    </Link>
  );
}

const BADGE_STYLES: Record<WaitingBadgeTone | "success" | "neutral" | "blue" | "purple", React.CSSProperties> = {
  danger: { backgroundColor: "rgba(226,75,74,0.12)", color: "#e24b4a" },
  warning: { backgroundColor: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  info: { backgroundColor: "rgba(37,99,235,0.12)", color: "#60a5fa" },
  muted: { backgroundColor: "rgba(255,255,255,0.06)", color: "#888", border: "0.5px solid #30363d" },
  success: { backgroundColor: "rgba(76,175,80,0.12)", color: "#4caf50" },
  neutral: { backgroundColor: "rgba(255,255,255,0.06)", color: "#888", border: "0.5px solid #30363d" },
  blue: { backgroundColor: "rgba(37,99,235,0.12)", color: "#60a5fa" },
  purple: { backgroundColor: "rgba(167,139,250,0.12)", color: "#a78bfa" },
};

export function TeacherBadge({
  children,
  tone = "neutral",
  size = "md",
}: {
  children: ReactNode;
  tone?: WaitingBadgeTone | "success" | "neutral" | "blue" | "purple";
  size?: "md" | "xs";
}) {
  const sizeClass =
    size === "xs" ? "rounded-md px-1.5 py-px text-[9px]" : "rounded-md px-[7px] py-[2px] text-[10px]";
  return (
    <span
      className={`inline-flex items-center font-medium whitespace-nowrap ${sizeClass}`}
      style={BADGE_STYLES[tone]}
    >
      {children}
    </span>
  );
}

export function TeacherAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const { bg, fg } = avatarColorsForName(name);
  const dim = size === "sm" ? "h-[26px] w-[26px] text-[9px]" : "h-9 w-9 text-[10px]";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {initialsFromName(name)}
    </div>
  );
}

export function TeacherToolbar({
  theme,
  children,
  className = "",
}: {
  theme: ThemeColors;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-[10px] border px-[14px] py-[10px] ${className}`}
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {children}
    </div>
  );
}

export function TeacherToolbarDivider({ theme }: { theme: ThemeColors }) {
  return <div className="h-5 w-px shrink-0" style={{ backgroundColor: theme.border }} />;
}

export function TeacherIconBtn({
  theme,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { theme: ThemeColors }) {
  return (
    <button
      type="button"
      className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border transition-colors hover:opacity-90 ${className}`}
      style={{
        borderColor: theme.border,
        backgroundColor: "transparent",
        color: theme.text2,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.bg4;
        e.currentTarget.style.color = theme.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = theme.text2;
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function TeacherSearchInput({
  value,
  onChange,
  placeholder,
  theme,
  className = "flex-1 min-w-[140px]",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  theme: ThemeColors;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-[7px] border px-2.5 py-[5px] ${className}`}
      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-[#444]"
        style={{ color: theme.text }}
      />
    </div>
  );
}

export function TeacherSelect({
  value,
  onChange,
  theme,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ThemeColors;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-[7px] border px-2 py-1.5 text-[11px] h-8 ${className}`}
      style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
    >
      {children}
    </select>
  );
}

export function TeacherTabs<T extends string>({
  tabs,
  active,
  onChange,
  theme,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  active: T;
  onChange: (key: T) => void;
  theme: ThemeColors;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-lg border p-1 w-fit max-w-full flex-wrap"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className="rounded-md px-3.5 py-1.5 text-xs transition-colors whitespace-nowrap"
          style={{
            backgroundColor: active === tab.key ? theme.bg4 : "transparent",
            color: active === tab.key ? theme.text : theme.text2,
            fontWeight: active === tab.key ? 500 : 400,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TeacherEmptyState({
  theme,
  children,
  compact,
}: {
  theme: ThemeColors;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <p
      className={`text-xs text-center ${compact ? "py-5" : "py-6"}`}
      style={{ color: theme.text2 }}
    >
      {children}
    </p>
  );
}

export function TeacherLoadingBlock({ theme, label }: { theme: ThemeColors; label?: string }) {
  const { t } = useUserPreferences();
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs" style={{ color: theme.text2 }}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? t("common.loading")}
    </div>
  );
}

export function TeacherAlertBanner({
  theme,
  children,
  to,
  tone = "danger",
  icon,
}: {
  theme: ThemeColors;
  children: ReactNode;
  to?: string;
  tone?: "danger" | "warning";
  icon?: ReactNode;
}) {
  const color = tone === "danger" ? theme.danger : theme.warning;
  const inner = (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2 text-xs"
      style={{
        backgroundColor: tone === "danger" ? "rgba(226,75,74,0.07)" : `${color}12`,
        borderColor: tone === "danger" ? "rgba(226,75,74,0.3)" : `${color}50`,
        color,
      }}
    >
      {icon}
      {children}
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block hover:opacity-95">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function TeacherPendingRow({
  theme,
  studentName,
  titleLine,
  subLine,
  waitingLabel,
  badgeTone,
  urgent,
  reviewHref,
  onGrade,
  gradeLabel,
}: {
  theme: ThemeColors;
  studentName: string;
  titleLine: string;
  subLine?: string;
  waitingLabel?: string;
  badgeTone?: WaitingBadgeTone;
  urgent?: boolean;
  reviewHref?: string;
  onGrade?: () => void;
  gradeLabel: string;
}) {
  return (
    <div
      className="flex items-center gap-3.5 py-3.5 px-5 border-b border-b-[0.5px] last:border-b-0 cursor-pointer transition-colors hover:bg-white/[0.02]"
      style={{
        borderColor: theme.border,
        borderLeftWidth: urgent ? 3 : undefined,
        borderLeftColor: urgent ? theme.danger : undefined,
        backgroundColor: "transparent",
      }}
      onClick={onGrade}
      onKeyDown={
        onGrade
          ? (e) => {
              if (e.key === "Enter") onGrade();
            }
          : undefined
      }
      role={onGrade ? "button" : undefined}
      tabIndex={onGrade ? 0 : undefined}
    >
      <TeacherAvatar name={studentName} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-normal" style={{ color: theme.text }}>
          {titleLine}
        </p>
        {subLine ? (
          <p className="text-[10px] mt-px truncate" style={{ color: theme.text2 }}>
            {subLine}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {waitingLabel ? <TeacherBadge tone={badgeTone ?? "muted"}>{waitingLabel}</TeacherBadge> : null}
        {reviewHref ? (
          <TeacherLinkBtn to={reviewHref} theme={theme} variant="primary">
            {gradeLabel}
          </TeacherLinkBtn>
        ) : onGrade ? (
          <TeacherBtn
            theme={theme}
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              onGrade();
            }}
          >
            {gradeLabel}
          </TeacherBtn>
        ) : null}
      </div>
    </div>
  );
}

export function TeacherActivityRow({
  theme,
  icon,
  iconBg,
  text,
  time,
  badge,
}: {
  theme: ThemeColors;
  icon: ReactNode;
  iconBg?: string;
  text: ReactNode;
  time: string;
  badge?: ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2.5 px-3.5 py-2.5 border-b last:border-b-0"
      style={{ borderColor: theme.border, backgroundColor: "transparent" }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]"
        style={{ backgroundColor: iconBg ?? `${theme.accent}18` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs leading-snug" style={{ color: theme.text }}>
          {text}
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: theme.text3 }}>
          {time}
        </p>
      </div>
      {badge ? <div className="ml-auto shrink-0 self-center">{badge}</div> : null}
    </div>
  );
}

export function TeacherCourseMiniRow({
  theme,
  courseId,
  title,
  meta,
  pendingCount,
  emoji,
  to,
}: {
  theme: ThemeColors;
  courseId: string;
  title: string;
  meta: string;
  pendingCount: number;
  emoji?: string;
  to: string;
}) {
  const icon = emoji ?? courseEmojiForTitle(title);
  const prTone = pendingCount >= 5 ? "danger" : pendingCount > 0 ? "warning" : "neutral";
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:opacity-90"
      style={{ backgroundColor: theme.bg2 }}
    >
      <span className="text-xl leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: theme.text }}>
          {title}
        </p>
        <p className="text-[10px] truncate" style={{ color: theme.text2 }}>
          {meta}
        </p>
      </div>
      <TeacherBadge tone={prTone}>
        {pendingCount} PR
      </TeacherBadge>
    </Link>
  );
}

export function TeacherDeadlineRow({
  theme,
  assignmentTitle,
  courseTitle,
  deadlineLabel,
  submittedLabel,
  urgencyColor,
}: {
  theme: ThemeColors;
  assignmentTitle: string;
  courseTitle: string;
  deadlineLabel: string;
  submittedLabel: string;
  urgencyColor?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3.5 py-2 border-b last:border-b-0"
      style={{ borderColor: theme.border }}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: theme.text }}>
          {assignmentTitle}
        </p>
        <p className="text-[10px] truncate" style={{ color: theme.text2 }}>
          {courseTitle}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] font-medium" style={{ color: urgencyColor ?? theme.text2 }}>
          {deadlineLabel}
        </p>
        <p className="text-[10px]" style={{ color: theme.text2 }}>
          {submittedLabel}
        </p>
      </div>
    </div>
  );
}

export function TeacherCourseCard({
  theme,
  courseId,
  title,
  studentsCount,
  assignmentsCount,
  pendingCount,
  submittedPercent,
  groupsLabel,
  footerHint,
  footerHintColor,
  to,
  onDelete,
  t,
  tp,
}: {
  theme: ThemeColors;
  courseId: string;
  title: string;
  studentsCount: number;
  assignmentsCount: number;
  pendingCount: number;
  submittedPercent?: number | null;
  groupsLabel?: string;
  footerHint?: string;
  footerHintColor?: string;
  to: string;
  onDelete?: () => void;
  t: (key: string) => string;
  tp: (key: string, params: Record<string, string | number>) => string;
}) {
  const emoji = courseEmojiForTitle(title);
  const banner = courseBannerForId(courseId);
  const pendingTone = pendingCount > 0 ? "danger" : pendingCount === 0 ? "neutral" : "warning";
  const pct = submittedPercent ?? 0;
  const pctColor =
    pct >= 75 ? theme.success : pct >= 45 ? theme.warning : theme.accent2;

  return (
    <article
      className="rounded-xl border overflow-hidden flex flex-col transition hover:border-[#a78bfa]/50"
      style={{ backgroundColor: theme.bg3, borderColor: theme.border }}
    >
      <div className="relative h-[76px] flex items-center justify-center" style={{ background: banner }}>
        <span className="text-3xl">{emoji}</span>
        <div className="absolute top-2 right-2">
          <TeacherBadge tone={pendingTone === "danger" ? "danger" : pendingTone === "warning" ? "warning" : "neutral"}>
            {pendingCount} PR
          </TeacherBadge>
        </div>
      </div>
      <div className="p-3.5 flex flex-col gap-2.5 flex-1 min-h-0">
        <div>
          <h2 className="text-sm font-semibold leading-snug" style={{ color: theme.text }}>
            {title}
          </h2>
          {groupsLabel ? (
            <p className="text-[11px] mt-0.5" style={{ color: theme.text2 }}>
              {groupsLabel}
            </p>
          ) : (
            <p className="text-[11px] mt-0.5" style={{ color: theme.text2 }}>
              {tp("teacher.courses.studentsCount", { count: studentsCount })}
              {" · "}
              {tp("teacher.courses.assignmentsCount", { count: assignmentsCount })}
            </p>
          )}
        </div>
        {submittedPercent != null ? (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span style={{ color: theme.text2 }}>{t("teacher.courseCard.submittedWorks")}</span>
              <span className="font-semibold" style={{ color: pctColor }}>
                {Math.round(pct)}%
              </span>
            </div>
            <div className="h-[5px] rounded-sm overflow-hidden" style={{ backgroundColor: theme.bg4 }}>
              <div
                className="h-full rounded-sm"
                style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pctColor }}
              />
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            [assignmentsCount, t("teacher.courseCard.statAssignments")],
            [pendingCount, t("teacher.courseCard.statReview")],
            [studentsCount, t("teacher.courseCard.statStudents")],
          ].map(([val, lbl]) => (
            <div
              key={String(lbl)}
              className="rounded-md px-2 py-2 text-center"
              style={{ backgroundColor: theme.bg2 }}
            >
              <div className="text-[15px] font-semibold tabular-nums" style={{ color: theme.text }}>
                {val}
              </div>
              <div className="mt-px text-[9px] leading-tight" style={{ color: theme.text2 }}>
                {lbl}
              </div>
            </div>
          ))}
        </div>
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t"
          style={{ borderColor: theme.border }}
        >
          {footerHint ? (
            <span className="text-[10px] truncate" style={{ color: footerHintColor ?? theme.text3 }}>
              {footerHint}
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-1">
            <TeacherLinkBtn to={to} theme={theme} variant="purple" className="!py-1 !px-2 !text-[10px]">
              {t("common.open")}
            </TeacherLinkBtn>
            {onDelete ? (
              <TeacherBtn theme={theme} variant="default" className="!py-1 !px-2 !text-[10px]" onClick={onDelete}>
                ✏️
              </TeacherBtn>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function TeacherDataTable({
  theme,
  children,
  minWidth = 720,
}: {
  theme: ThemeColors;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <TeacherSurface theme={theme} noPadding bodyClassName="overflow-x-auto">
      <table
        className="w-full text-xs border-collapse"
        style={{ minWidth, backgroundColor: theme.bg3, color: theme.text }}
      >
        {children}
      </table>
    </TeacherSurface>
  );
}

export function TeacherTableHead({ theme, children }: { theme: ThemeColors; children: ReactNode }) {
  return (
    <thead style={{ backgroundColor: theme.bg2 }}>
      <tr
        className="border-b text-left text-[10px] font-semibold uppercase tracking-wide"
        style={{ borderColor: theme.border, color: theme.text2 }}
      >
        {children}
      </tr>
    </thead>
  );
}

export function TeacherTableBody({
  theme,
  children,
}: {
  theme: ThemeColors;
  children: ReactNode;
}) {
  return (
    <tbody className="[&_tr:last-child_td]:border-b-0" style={{ backgroundColor: theme.bg3 }}>
      {children}
    </tbody>
  );
}

export function TeacherTh({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium whitespace-nowrap ${className}`}>{children}</th>;
}

export function TeacherTd({
  theme,
  children,
  className = "",
  style,
  colSpan,
}: {
  theme: ThemeColors;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2.5 align-middle whitespace-nowrap transition-colors group-hover:bg-white/[0.02] ${className}`}
      style={{
        borderBottom: `0.5px solid ${theme.border}`,
        color: theme.text,
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export function TeacherChartBars({
  theme,
  items,
  heightClass = "h-[70px]",
}: {
  theme: ThemeColors;
  items: { label: string; value: number }[];
  heightClass?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="w-full px-3.5 py-3 box-border">
      <div className={`flex w-full items-end gap-0.5 ${heightClass}`}>
        {items.map((item) => (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end">
            <div
              className="w-full rounded-t-sm min-h-[4px]"
              style={{
                height: `${Math.max(8, (item.value / max) * 100)}%`,
                backgroundColor: item.value === max ? theme.accent : `${theme.accent}40`,
              }}
              title={String(item.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex w-full justify-between mt-1 px-0 text-[10px]" style={{ color: theme.text3 }}>
        {items.map((item) => (
          <span key={item.label} className="flex-1 text-center truncate">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Re-export helpers
export { initialsFromName, courseEmojiForTitle, courseBannerForId, avatarColorsForName };
