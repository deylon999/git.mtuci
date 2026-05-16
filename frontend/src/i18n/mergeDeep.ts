export function mergeDeep<T extends Record<string, unknown>>(target: T, ...sources: Record<string, unknown>[]): T {
  const out = { ...target } as Record<string, unknown>;
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = out[key];
      if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
        out[key] = mergeDeep(tv as Record<string, unknown>, sv as Record<string, unknown>);
      } else {
        out[key] = sv;
      }
    }
  }
  return out as T;
}
