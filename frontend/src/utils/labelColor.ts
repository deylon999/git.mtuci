/** `#rrggbb` from `rrggbb`, `#rgb` or `#rrggbb`; anything else falls back to neutral gray. */
export function normalizeHexColor(color: string | null | undefined): string {
  let hex = (color ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : "#cccccc";
}

/**
 * Dark or white text for a label of this background color, by perceived brightness (WCAG relative luminance).
 * Comparing the raw hex number is wrong: #00ff00 is "below half" numerically yet one of the brightest colors.
 */
export function readableTextColor(background: string | null | undefined): "#111827" | "#ffffff" {
  const hex = normalizeHexColor(background).slice(1);
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Crossover where contrast with #111827 equals contrast with white.
  return luminance > 0.18 ? "#111827" : "#ffffff";
}
