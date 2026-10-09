import { translate, translateWithParams, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";
import type { StudentActivityFeedItem } from "../api/studentDashboardApi";
import { formatRelativeTime } from "./formatRelativeTime";

const PARTS = ["text", "bold", "after", "badge"] as const;

/**
 * Feed rows come from the backend in Russian plus an optional `i18n_key`. Each part that has a template under
 * `studentFeed.<key>.*` is rendered in the UI language; parts without one (and rows without a key) keep the
 * server text. The time is always computed here from `created_at`, never the server's "5 мин назад".
 */
export function localizeFeedItem(item: StudentActivityFeedItem, locale: Locale = getI18nLocale()) {
  const out = {
    text: item.text,
    bold: item.bold,
    after: item.text_after,
    badge: item.badge,
    time: formatRelativeTime(item.created_at, new Date(), locale),
  };
  if (!item.i18n_key) return out;
  const base = `studentFeed.${item.i18n_key}`;
  for (const part of PARTS) {
    const key = `${base}.${part}`;
    if (translate(locale, key) === key) continue;
    out[part] = translateWithParams(locale, key, item.i18n_params ?? undefined);
  }
  return out;
}
