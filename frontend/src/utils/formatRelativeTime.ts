import { translate, translateWithParams, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

function localeTag(locale: Locale): string {
  return locale === "en" ? "en-US" : "ru-RU";
}

export function formatRelativeTime(iso: string, now = new Date(), locale = getI18nLocale()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return translate(locale, "time.justNow");
  if (diffMin < 60) return translateWithParams(locale, "time.minutesAgo", { n: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return translateWithParams(locale, "time.hoursAgo", { n: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return translate(locale, "time.yesterday");
  if (diffDays < 7) {
    const key = locale === "en" || diffDays >= 5 ? "time.daysAgo" : "time.daysAgoFew";
    return translateWithParams(locale, key, { n: diffDays });
  }
  return date.toLocaleDateString(localeTag(locale), { day: "numeric", month: "short" });
}
