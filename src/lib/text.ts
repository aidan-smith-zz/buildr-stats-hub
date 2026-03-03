/**
 * Decode common HTML entities in strings (e.g. from APIs that return "O&apos;Brien").
 * Use when displaying or storing names so apostrophes and ampersands render correctly.
 */
export function decodeHtmlEntities(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
