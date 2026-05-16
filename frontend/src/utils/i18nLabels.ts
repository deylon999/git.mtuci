import { translate, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";

export function tr(key: string, locale?: Locale): string {
  return translate(locale ?? getI18nLocale(), key);
}
