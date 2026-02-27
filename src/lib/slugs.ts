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

const FIXTURES_TZ = "Europe/London";

/** Today's date as YYYY-MM-DD (Europe/London) for use in fixture URLs */
export function todayDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
}

/** Tomorrow's date as YYYY-MM-DD (Europe/London). */
export function tomorrowDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
}

/** Next N days (YYYY-MM-DD) from tomorrow, in Europe/London. */
export function nextDateKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    keys.push(d.toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ }));
  }
  return keys;
}
