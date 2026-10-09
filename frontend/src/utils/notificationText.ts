import { translate, translateWithParams, type Locale } from "../i18n";
import { getI18nLocale } from "../i18n/runtime";
import type { Notification } from "../api/types";

type LocalizableNotification = Pick<Notification, "title" | "message" | "i18n_key" | "i18n_params">;

/**
 * Title and message in the UI language. The server stores Russian text plus an optional `i18n_key`;
 * rows without a key (created before keys existed) or with a key this build doesn't know keep the stored text.
 */
export function localizeNotification(
  n: LocalizableNotification,
  locale: Locale = getI18nLocale(),
): { title: string; message: string } {
  const base = n.i18n_key ? `notificationText.${n.i18n_key}` : null;
  if (!base || translate(locale, `${base}.title`) === `${base}.title`) {
    return { title: n.title, message: n.message };
  }
  const params = n.i18n_params ?? undefined;
  return {
    title: translateWithParams(locale, `${base}.title`, params),
    message: translateWithParams(locale, `${base}.message`, params),
  };
}
