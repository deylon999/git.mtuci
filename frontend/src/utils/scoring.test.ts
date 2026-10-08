import { describe, expect, it } from "vitest";
import { formatGradeTotal, gradePercent } from "./gradeScoring";
import { buildDefaultPenaltyPeriods } from "./penaltyDefaults";
import { toSafeExternalUrl } from "./safeUrl";

describe("gradePercent / formatGradeTotal", () => {
  it("rounds to one decimal and guards a zero max", () => {
    expect(gradePercent(2, 3)).toBe(66.7);
    expect(gradePercent(5, 0)).toBeNull();
    expect(formatGradeTotal(8, 10, null)).toBe("8 / 10 (80%)");
    expect(formatGradeTotal(1, 0, null)).toBe("—");
  });
});

describe("buildDefaultPenaltyPeriods", () => {
  it("scales tiers to the course cap and never drops below 1", () => {
    expect(buildDefaultPenaltyPeriods(10)).toEqual([
      { weeks: 1, max_grade: 8 },
      { weeks: 2, max_grade: 5 },
      { weeks: 3, max_grade: 2 },
    ]);
    expect(buildDefaultPenaltyPeriods(1).every((p) => p.max_grade >= 1)).toBe(true);
  });
});

describe("toSafeExternalUrl", () => {
  it("allows only absolute http(s) links", () => {
    expect(toSafeExternalUrl("https://git.example.com/a")).toBe("https://git.example.com/a");
    expect(toSafeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(toSafeExternalUrl("/relative")).toBeUndefined();
    expect(toSafeExternalUrl(null)).toBeUndefined();
  });
});
