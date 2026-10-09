import type { Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

/**
 * The backend formats uptimes in Russian ("2 д 3 ч", "3 ч 12 мин", "45 мин"); in English show "2d 3h", "3h 12m", "45m".
 * Anything else (e.g. Gitea's own uptime text) is returned unchanged.
 */
export function localizeUptime(value: string, locale: Locale = getI18nLocale()): string {
  if (locale !== "en") return value;
  return value
    // `\b` is ASCII-only in JS even with /u, so it never matches after a Cyrillic letter; use a letter lookahead.
    .replace(/(\d+)\s*д(?!\p{L})/gu, "$1d")
    .replace(/(\d+)\s*ч(?!\p{L})/gu, "$1h")
    .replace(/(\d+)\s*мин(?!\p{L})/gu, "$1m");
}
