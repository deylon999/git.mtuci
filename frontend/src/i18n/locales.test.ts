import { describe, expect, it } from "vitest";
import { LOCALES, type TranslationTree } from "./index";

function flatten(tree: TranslationTree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      for (const [ck, cv] of flatten(v as TranslationTree, key)) out.set(ck, cv);
    } else if (typeof v === "string") {
      out.set(key, v);
    }
  }
  return out;
}

const ru = flatten(LOCALES.ru);
const en = flatten(LOCALES.en);

// Raw source of every app module (locales and tests excluded), keyed by path relative to this file.
const SOURCES = import.meta.glob<string>(["../**/*.{ts,tsx}", "!./locales/**", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  it("ru and en define the same keys", () => {
    expect([...ru.keys()].filter((k) => !en.has(k)), "missing in en").toEqual([]);
    expect([...en.keys()].filter((k) => !ru.has(k)), "missing in ru").toEqual([]);
  });

  it("ru and en use the same {placeholders}", () => {
    const mismatched = [...ru.keys()]
      .filter((k) => en.has(k) && placeholders(ru.get(k)!).join() !== placeholders(en.get(k)!).join())
      .map((k) => `${k}: ru {${placeholders(ru.get(k)!)}} / en {${placeholders(en.get(k)!)}}`);
    expect(mismatched).toEqual([]);
  });

  it("every literal key passed to t()/tp() exists", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    const missing: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of text.matchAll(/\btp?\(\s*["'`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)["'`]/g)) {
        if (!ru.has(m[1])) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
