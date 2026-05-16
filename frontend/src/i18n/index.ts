import { mergeDeep } from "./mergeDeep";
import { coreEn } from "./locales/en/core";
import { authEn } from "./locales/en/auth";
import { studentEn } from "./locales/en/student";
import { teacherEn } from "./locales/en/teacher";
import { adminEn } from "./locales/en/admin";
import { repoEn } from "./locales/en/repo";
import { coreRu } from "./locales/ru/core";
import { authRu } from "./locales/ru/auth";
import { studentRu } from "./locales/ru/student";
import { teacherRu } from "./locales/ru/teacher";
import { adminRu } from "./locales/ru/admin";
import { repoRu } from "./locales/ru/repo";
import { adminPagesRu } from "./locales/ru/adminPages";
import { adminPagesEn } from "./locales/en/adminPages";
import { repoPagesRu } from "./locales/ru/repoPages";
import { repoPagesEn } from "./locales/en/repoPages";

export type TranslationTree = Record<string, unknown>;

const ru = mergeDeep(
  {},
  coreRu,
  authRu,
  { student: studentRu },
  { teacher: teacherRu },
  { admin: mergeDeep({}, adminRu, adminPagesRu) },
  { repo: mergeDeep({}, repoRu, repoPagesRu) },
) as TranslationTree;

const en = mergeDeep(
  {},
  coreEn,
  authEn,
  { student: studentEn },
  { teacher: teacherEn },
  { admin: mergeDeep({}, adminEn, adminPagesEn) },
  { repo: mergeDeep({}, repoEn, repoPagesEn) },
) as TranslationTree;

export type Locale = "ru" | "en";

const LOCALES: Record<Locale, TranslationTree> = { ru, en };

export { translateWithParams } from "./params";
export function isLocale(value: string): value is Locale {
  return value === "ru" || value === "en";
}

export function resolveLocale(value: string | null | undefined): Locale {
  if (value && isLocale(value)) return value;
  return "ru";
}

function getNested(tree: TranslationTree, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = tree;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(locale: Locale, key: string): string {
  return getNested(LOCALES[locale], key) ?? getNested(LOCALES.ru, key) ?? key;
}

export const LANGUAGE_STORAGE_KEY = "mtuci_language";
