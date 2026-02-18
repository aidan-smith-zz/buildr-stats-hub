/** Slug for URL: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen */
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function leagueToSlug(league: string | null): string {
  if (!league) return "league";
  return toSlug(league);
}

export function matchSlug(homeName: string, awayName: string): string {
  const home = toSlug(homeName);
  const away = toSlug(awayName);
  return `${home}-vs-${away}`;
}

/** Today's date as YYYY-MM-DD (Europe/London) for use in fixture URLs */
export function todayDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
