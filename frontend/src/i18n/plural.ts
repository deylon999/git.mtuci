import { translate, type Locale } from "./index";

export type PluralForm = "one" | "few" | "many" | "other";

export function getPluralForm(locale: Locale, n: number): PluralForm {
  if (locale === "en") return n === 1 ? "one" : "other";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "few";
  return "many";
}

export function pluralWord(locale: Locale, keyPrefix: string, n: number): string {
  const form = getPluralForm(locale, n);
  return translate(locale, `${keyPrefix}.${form}`);
}
