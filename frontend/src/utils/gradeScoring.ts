import type { ThemeColors } from "../theme";

export function gradePercent(earned: number, max: number): number | null {
  if (max <= 0) return null;
  return Math.round((earned / max) * 1000) / 10;
}

export function gradeColorForPercent(percent: number | null, theme: ThemeColors): string {
  if (percent == null) return theme.text2;
  if (percent >= 85) return theme.success;
  if (percent >= 60) return theme.warning;
  return theme.danger;
}

export function formatGradeTotal(earned: number, max: number, percent: number | null): string {
  if (max <= 0) return "—";
  const pct = percent ?? gradePercent(earned, max);
  return pct != null ? `${earned} / ${max} (${pct}%)` : `${earned} / ${max}`;
}
