import { translate, type Locale } from "./index";

export function translateWithParams(
  locale: Locale,
  key: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  let text = translate(locale, key);
  if (!params) return text;
  for (const [name, value] of Object.entries(params)) {
    if (value == null) continue;
    text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }
  return text;
}
