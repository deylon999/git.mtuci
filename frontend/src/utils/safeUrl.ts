/**
 * Returns the URL only if it is an absolute http(s) link, otherwise undefined.
 * Use for any user- or server-supplied value that ends up in an href, so values
 * like "javascript:..." can never run on click (React 18 does not block them).
 */
export function toSafeExternalUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
