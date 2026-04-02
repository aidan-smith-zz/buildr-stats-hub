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

/** Date key (YYYY-MM-DD) in Europe/London for a given date. Use to match fixture date to todayKey. */
export function fixtureDateKey(fixtureDate: Date | string): string {
  return new Date(fixtureDate).toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
}

/** Tomorrow's date as YYYY-MM-DD (Europe/London). */
export function tomorrowDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
}

/**
 * `/fixtures/[date]` and `/fixtures/[date]/ai-insights` only serve today and tomorrow (Europe/London).
 * Accepts aliases `today` / `tomorrow` (case-insensitive) or YYYY-MM-DD when it matches those keys.
 */
export function resolveTodayTomorrowDateParam(param: string | undefined): string | null {
  if (param == null || param === "") return null;
  const today = todayDateKey();
  const tomorrow = tomorrowDateKey();
  const lower = param.toLowerCase();
  if (lower === "today") return today;
  if (lower === "tomorrow") return tomorrow;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const d = new Date(`${param}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (param !== today && param !== tomorrow) return null;
  return param;
}

/** Nav target for `/fixtures/[date]` from a calendar context: that day if in window, else today's hub. */
export function fixturesDateHubHref(contextDateKey: string): string {
  const r = resolveTodayTomorrowDateParam(contextDateKey);
  return `/fixtures/${r ?? todayDateKey()}`;
}

/** Nav target for "AI insights" from a fixture-date context: that day if in window, else today's hub. */
export function aiInsightsListHref(contextDateKey: string): string {
  const r = resolveTodayTomorrowDateParam(contextDateKey);
  return `/fixtures/${r ?? todayDateKey()}/ai-insights`;
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

/** Past N days (YYYY-MM-DD): yesterday, day before, ... in Europe/London. Most recent first (yesterday first). */
export function pastDateKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ }));
  }
  return keys;
}
