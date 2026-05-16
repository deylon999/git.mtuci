import type { Locale } from "./index";

let currentLocale: Locale = "ru";

export function setI18nLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getI18nLocale(): Locale {
  return currentLocale;
}
