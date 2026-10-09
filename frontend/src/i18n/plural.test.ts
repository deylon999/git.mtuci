import { describe, expect, it } from "vitest";
import { getPluralForm, pluralWord } from "./plural";
import { applyParams, translateWithParams } from "./params";

describe("getPluralForm", () => {
  it.each([
    [0, "many"],
    [1, "one"],
    [2, "few"],
    [4, "few"],
    [5, "many"],
    [11, "many"],
    [12, "many"],
    [14, "many"],
    [21, "one"],
    [22, "few"],
    [25, "many"],
    [111, "many"],
    [112, "many"],
    [121, "one"],
  ] as const)("ru %i -> %s", (n, form) => {
    expect(getPluralForm("ru", n)).toBe(form);
  });

  it("en uses one/other only", () => {
    expect(getPluralForm("en", 1)).toBe("one");
    expect(getPluralForm("en", 0)).toBe("other");
    expect(getPluralForm("en", 2)).toBe("other");
    expect(getPluralForm("en", 21)).toBe("other");
  });
});

describe("pluralWord", () => {
  it("picks the Russian word form", () => {
    expect(pluralWord("ru", "student.plural.days", 1)).toBe("день");
    expect(pluralWord("ru", "student.plural.days", 3)).toBe("дня");
    expect(pluralWord("ru", "student.plural.days", 11)).toBe("дней");
  });
});

describe("translateWithParams", () => {
  it("substitutes every occurrence and skips nullish params", () => {
    expect(translateWithParams("en", "time.minutesAgo", { n: 5 })).toBe("5 min ago");
    expect(translateWithParams("en", "time.minutesAgo", { n: null })).toBe("{n} min ago");
  });

  it("falls back to the key for unknown keys", () => {
    expect(translateWithParams("en", "no.such.key")).toBe("no.such.key");
  });
});

describe("applyParams plural forms", () => {
  it.each([
    [1, "1 коммит"],
    [3, "3 коммита"],
    [5, "5 коммитов"],
    [11, "11 коммитов"],
    [21, "21 коммит"],
    [0, "0 коммитов"],
  ] as const)("ru %i", (n, expected) => {
    expect(applyParams("ru", "{n} {n|коммит|коммита|коммитов}", { n })).toBe(expected);
  });

  it("uses one/other in English", () => {
    expect(applyParams("en", "{n} {n|commit|commits}", { n: 1 })).toBe("1 commit");
    expect(applyParams("en", "{n} {n|commit|commits}", { n: 2 })).toBe("2 commits");
    expect(applyParams("en", "{n} {n|commit|commits}", { n: 0 })).toBe("0 commits");
  });

  it("leaves the marker when the count is missing", () => {
    expect(applyParams("en", "{n|commit|commits}", { m: 1 })).toBe("{n|commit|commits}");
  });
});
