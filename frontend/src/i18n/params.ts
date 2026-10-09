import { translate, type Locale } from "./index";
import { getPluralForm, type PluralForm } from "./plural";

const FORM_INDEX: Record<Locale, Partial<Record<PluralForm, number>>> = {
  en: { one: 0, other: 1 },
  ru: { one: 0, few: 1, many: 2 },
};

/**
 * Substitutes `{name}` with the param value and `{name|form|form…}` with the word form that agrees with it:
 * en `{n|commit|commits}` (one|other), ru `{n|коммит|коммита|коммитов}` (one|few|many).
 */
export function applyParams(
  locale: Locale,
  text: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  if (!params) return text;
  let out = text.replace(/\{(\w+)\|([^{}]*)\}/g, (match, name: string, formsRaw: string) => {
    const value = Number(params[name]);
    if (params[name] == null || !Number.isFinite(value)) return match;
    const forms = formsRaw.split("|");
    const index = FORM_INDEX[locale][getPluralForm(locale, Math.abs(Math.trunc(value)))] ?? forms.length - 1;
    return forms[Math.min(index, forms.length - 1)];
  });
  for (const [name, value] of Object.entries(params)) {
    if (value == null) continue;
    out = out.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }
  return out;
}

export function translateWithParams(
  locale: Locale,
  key: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  return applyParams(locale, translate(locale, key), params);
}
