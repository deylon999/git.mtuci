import { describe, expect, it } from "vitest";
import { getPluralForm, pluralWord } from "./plural";
import { translateWithParams } from "./params";

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
