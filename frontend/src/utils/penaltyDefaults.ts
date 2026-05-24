export type PenaltyPeriod = { weeks: number; max_grade: number };

/** Default late-penalty tiers as fractions of the course grade cap (80% / 50% / 20%). */
export function buildDefaultPenaltyPeriods(gradeMax: number): PenaltyPeriod[] {
  const cap = Math.max(1, Math.round(gradeMax));
  return [
    { weeks: 1, max_grade: Math.max(1, Math.round(cap * 0.8)) },
    { weeks: 2, max_grade: Math.max(1, Math.round(cap * 0.5)) },
    { weeks: 3, max_grade: Math.max(1, Math.round(cap * 0.2)) },
  ];
}
