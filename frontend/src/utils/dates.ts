import type { Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

/** BCP 47 tag for the app language; use it instead of `undefined` so dates follow the UI language, not the browser. */
export function localeTag(locale: Locale): string {
  return locale === "en" ? "en-US" : "ru-RU";
}

/** Tag for the current UI language; components re-render on language change, so calls pick up the switch. */
export function currentLocaleTag(): string {
  return localeTag(getI18nLocale());
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
