import { cache } from "react";
import { unstable_cache } from "next/cache";
import { REQUIRED_LEAGUE_IDS, isFixtureInRequiredLeagues } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import {
  API_SEASON,
  fetchTodayFixtures,
  getFixtureExternalId,
  getTeamExternalId,
  type RawFixture,
} from "@/lib/footballApi";
import { leagueToSlug, matchSlug, nextDateKeys, pastDateKeys, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import type { Fixture, Team } from "@prisma/client";

export { REQUIRED_LEAGUE_IDS };

/**
 * Global in-memory cache to prevent duplicate API calls per day
 */
const globalForFixtures = globalThis as unknown as {
  todayFixturesPromise?: { dateKey: string; promise: Promise<FixtureSummary[]> };
};

/** Timezone for "today" (FA Cup, Premier League etc. are UK-focused) */
const FIXTURES_TIMEZONE = "Europe/London";

/** Today's date (YYYY-MM-DD) in the fixtures timezone so we request the right calendar day */
function getTodayDateKey(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: FIXTURES_TIMEZONE });
}

/** Start/end of the given date (YYYY-MM-DD) in UTC for DB queries. Includes up to 00:59 next day UTC so "tonight" kickoffs dated as next day by the API still show. */
function dayBoundsUtc(dateKey: string) {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const nextDayStr = new Date(dayEnd.getTime() + 1).toISOString().slice(0, 10);
  const spilloverEnd = new Date(`${nextDayStr}T00:59:59.999Z`);
  return { dayStart, dayEnd, spilloverEnd };
}

const FIXTURES_TIMEZONE_PREVIEW = "Europe/London";

/**
 * Fetch fixtures for a given date from the API only (no DB). For use in SSG preview pages and generateStaticParams.
 * Filters to REQUIRED_LEAGUE_IDS.
 */
export async function getFixturesForDatePreview(dateKey: string): Promise<RawFixture[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  const results = await Promise.all(
    REQUIRED_LEAGUE_IDS.map((leagueId) =>
      fetchTodayFixtures({
        date: dateKey,
        leagueId,
        timezone: FIXTURES_TIMEZONE_PREVIEW,
      })
    )
  );
  const seen = new Set<string>();
  const flat = results.flat().filter((raw) => {
    const key = getFixtureExternalId(raw);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  flat.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return flat;
}

/**
 * Resolve a single fixture for preview by date, league slug, and match slug. Returns null if not found.
 * Tries UpcomingFixture table first (when dateKey >= today), then falls back to API.
 */
export async function getFixturePreview(
  dateKey: string,
  leagueSlug: string,
  matchSlugParam: string
): Promise<RawFixture | null> {
  const fromDb = await getFixturePreviewFromDb(dateKey, leagueSlug, matchSlugParam);
  if (fromDb) return fromDb;
  const fixtures = await getFixturesForDatePreview(dateKey);
  const fixture = fixtures.find((f) => {
    const slug = leagueToSlug(f.league ?? null);
    const home = f.homeTeam.shortName ?? f.homeTeam.name;
    const away = f.awayTeam.shortName ?? f.awayTeam.name;
    const m = matchSlug(home, away);
    return slug === leagueSlug && m === matchSlugParam;
  }) ?? null;
  if (!fixture) return null;
  const homeApiId = String(fixture.homeTeam.id);
  const awayApiId = String(fixture.awayTeam.id);
  const teams = await prisma.team.findMany({
    where: { apiId: { in: [homeApiId, awayApiId] } },
    select: { apiId: true, crestUrl: true },
  });
  const crestByApiId = new Map<string, string | null>();
  for (const t of teams) {
    if (t.apiId != null) crestByApiId.set(t.apiId, t.crestUrl);
  }
  return {
    ...fixture,
    homeTeam: { ...fixture.homeTeam, crestUrl: crestByApiId.get(homeApiId) ?? null },
    awayTeam: { ...fixture.awayTeam, crestUrl: crestByApiId.get(awayApiId) ?? null },
  };
}

/** Map UpcomingFixture row to RawFixture shape for preview pages. */
function upcomingRowToRaw(
  row: {
    apiFixtureId: string;
    kickoff: Date;
    league: string | null;
    leagueId: number | null;
    homeTeamName: string;
    homeTeamShortName: string | null;
    awayTeamName: string;
    awayTeamShortName: string | null;
  },
  crests?: { home: string | null; away: string | null },
): RawFixture {
  return {
    id: row.apiFixtureId,
    date: row.kickoff.toISOString(),
    league: row.league ?? undefined,
    leagueId: row.leagueId ?? undefined,
    homeTeam: {
      id: row.apiFixtureId,
      name: row.homeTeamName,
      shortName: row.homeTeamShortName ?? undefined,
      crestUrl: crests?.home ?? undefined,
    },
    awayTeam: {
      id: row.apiFixtureId,
      name: row.awayTeamName,
      shortName: row.awayTeamShortName ?? undefined,
      crestUrl: crests?.away ?? undefined,
    },
  };
}

/**
 * Find a single upcoming fixture by date and slug. Returns RawFixture shape with team crests or null.
 */
export async function getFixturePreviewFromDb(
  dateKey: string,
  leagueSlug: string,
  matchSlugParam: string
): Promise<RawFixture | null> {
  const rows = await prisma.upcomingFixture.findMany({
    where: { dateKey },
    orderBy: { kickoff: "asc" },
  });
  for (const row of rows) {
    const slug = leagueToSlug(row.league ?? null);
    const home = row.homeTeamShortName ?? row.homeTeamName;
    const away = row.awayTeamShortName ?? row.awayTeamName;
    const m = matchSlug(home, away);
    if (slug === leagueSlug && m === matchSlugParam) {
      const [homeTeam, awayTeam] = await Promise.all([
        prisma.team.findUnique({ where: { apiId: row.homeTeamApiId }, select: { crestUrl: true } }),
        prisma.team.findUnique({ where: { apiId: row.awayTeamApiId }, select: { crestUrl: true } }),
      ]);
      return upcomingRowToRaw(row, {
        home: homeTeam?.crestUrl ?? null,
        away: awayTeam?.crestUrl ?? null,
      });
    }
  }
  return null;
}

/** RawFixture with optional crestUrl on home/away for upcoming list display. */
export type UpcomingFixtureWithCrests = RawFixture & {
  homeTeam: RawFixture["homeTeam"] & { crestUrl?: string | null };
  awayTeam: RawFixture["awayTeam"] & { crestUrl?: string | null };
};

export type UpcomingFixtureByDate = { dateKey: string; fixtures: UpcomingFixtureWithCrests[] };

/**
 * Get upcoming fixtures from DB for roughly the next 14 days.
 *
 * If the UpcomingFixture table doesn't yet have rows covering the full 14‑day
 * horizon (for example, warm-today hasn't been run recently), this will first
 * refresh the table from the API and then re-read it. That way the Upcoming
 * page always tries to show a full 14‑day window.
 */
export async function getUpcomingFixturesFromDb(): Promise<UpcomingFixtureByDate[]> {
  const today = todayDateKey();

  let rows = await prisma.upcomingFixture.findMany({
    where: { dateKey: { gte: today } },
    orderBy: [{ dateKey: "asc" }, { kickoff: "asc" }],
  });

  // Ensure we have coverage up to ~14 days ahead. If our max dateKey is before
  // the target end date, refresh the UpcomingFixture table once and re-query.
  const targetEndKey = nextDateKeys(14).slice(-1)[0] ?? today;
  const maxExistingKey = rows.length > 0 ? rows[rows.length - 1]!.dateKey : null;
  if (!maxExistingKey || maxExistingKey < targetEndKey) {
    await refreshUpcomingFixturesTable(new Date());
    rows = await prisma.upcomingFixture.findMany({
      where: { dateKey: { gte: today } },
      orderBy: [{ dateKey: "asc" }, { kickoff: "asc" }],
    });
  }
  const apiIds = [...new Set(rows.flatMap((r) => [r.homeTeamApiId, r.awayTeamApiId]))];
  const teams = await prisma.team.findMany({
    where: { apiId: { in: apiIds } },
    select: { apiId: true, crestUrl: true },
  });
  const crestByApiId = new Map<string, string | null>();
  for (const t of teams) {
    if (t.apiId != null) crestByApiId.set(t.apiId, t.crestUrl);
  }
  const byDate = new Map<string, UpcomingFixtureWithCrests[]>();
  for (const row of rows) {
    const raw = upcomingRowToRaw(row);
    const fixture: UpcomingFixtureWithCrests = {
      ...raw,
      homeTeam: {
        ...raw.homeTeam,
        crestUrl: crestByApiId.get(row.homeTeamApiId) ?? null,
      },
      awayTeam: {
        ...raw.awayTeam,
        crestUrl: crestByApiId.get(row.awayTeamApiId) ?? null,
      },
    };
    const list = byDate.get(row.dateKey) ?? [];
    list.push(fixture);
    byDate.set(row.dateKey, list);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, fixtures]) => ({ dateKey, fixtures }));
}

/**
 * Delete upcoming fixtures whose dateKey is before today (out of date).
 */
export async function clearOutdatedUpcomingFixtures(now: Date = new Date()): Promise<number> {
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: FIXTURES_TIMEZONE });
  const result = await prisma.upcomingFixture.deleteMany({
    where: { dateKey: { lt: todayKey } },
  });
  return result.count;
}

/**
 * Refresh the UpcomingFixture table: clear out-of-date rows, then fetch next 14 days from API and upsert.
 * Call from warm-today so the table stays populated and clean.
 */
export async function refreshUpcomingFixturesTable(now: Date = new Date()): Promise<void> {
  await clearOutdatedUpcomingFixtures(now);
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: FIXTURES_TIMEZONE });

  for (const dateKey of nextDateKeys(14)) {
    if (dateKey <= todayKey) continue;
    try {
      const fixtures = await getFixturesForDatePreview(dateKey);
      // Extra guard: only persist fixtures in required leagues (e.g. exclude National League 43).
      const filteredFixtures = fixtures.filter((raw) =>
        isFixtureInRequiredLeagues({ leagueId: raw.leagueId ?? null, league: raw.league ?? null })
      );
      const leagueCountry = null;
      for (const raw of filteredFixtures) {
        const homeCountry = raw.homeTeam.country ?? raw.leagueCountry ?? leagueCountry;
        const awayCountry = raw.awayTeam.country ?? raw.leagueCountry ?? leagueCountry;
        await Promise.all([
          prisma.team.upsert({
            where: { apiId: getTeamExternalId(raw.homeTeam) },
            update: {
              name: raw.homeTeam.name,
              shortName: raw.homeTeam.shortName ?? undefined,
              country: homeCountry,
            },
            create: {
              apiId: getTeamExternalId(raw.homeTeam),
              name: raw.homeTeam.name,
              shortName: raw.homeTeam.shortName ?? undefined,
              country: homeCountry,
            },
          }),
          prisma.team.upsert({
            where: { apiId: getTeamExternalId(raw.awayTeam) },
            update: {
              name: raw.awayTeam.name,
              shortName: raw.awayTeam.shortName ?? undefined,
              country: awayCountry,
            },
            create: {
              apiId: getTeamExternalId(raw.awayTeam),
              name: raw.awayTeam.name,
              shortName: raw.awayTeam.shortName ?? undefined,
              country: awayCountry,
            },
          }),
        ]);
        const apiId = String(getFixtureExternalId(raw));
        const homeTeamApiId = getTeamExternalId(raw.homeTeam);
        const awayTeamApiId = getTeamExternalId(raw.awayTeam);
        const kickoff = new Date(raw.date);
        await prisma.upcomingFixture.upsert({
          where: {
            dateKey_apiFixtureId: { dateKey, apiFixtureId: apiId },
          },
          update: {
            kickoff,
            league: raw.league ?? null,
            leagueId: raw.leagueId ?? null,
            homeTeamName: raw.homeTeam.name,
            homeTeamShortName: raw.homeTeam.shortName ?? null,
            awayTeamName: raw.awayTeam.name,
            awayTeamShortName: raw.awayTeam.shortName ?? null,
            homeTeamApiId,
            awayTeamApiId,
          },
          create: {
            dateKey,
            kickoff,
            league: raw.league ?? null,
            leagueId: raw.leagueId ?? null,
            homeTeamName: raw.homeTeam.name,
            homeTeamShortName: raw.homeTeam.shortName ?? null,
            awayTeamName: raw.awayTeam.name,
            awayTeamShortName: raw.awayTeam.shortName ?? null,
            homeTeamApiId,
            awayTeamApiId,
            apiFixtureId: apiId,
          },
        });
      }
    } catch {
      // Skip this date on API failure
    }
  }
}

/** Number of days to keep past fixtures (fixture dashboard remains available for this window). */
const PAST_FIXTURES_RETENTION_DAYS = 14;

/**
 * Remove fixtures older than the retention window (14 days). Keeps recent fixtures so the "last 14 days"
 * page and fixture dashboards remain available with full stats. Tomorrow's fixtures are kept so
 * warm-tomorrow can warm them. ApiFetchLog: only today's is kept so we don't refetch past dates.
 */
export async function pruneDataOlderThanToday(now: Date = new Date()): Promise<void> {
  const dateKey = getTodayDateKey(now);
  const { dayStart } = dayBoundsUtc(dateKey);
  const pastKeys = pastDateKeys(PAST_FIXTURES_RETENTION_DAYS);
  const cutoffDateKey = pastKeys[pastKeys.length - 1];
  if (!cutoffDateKey) return;
  const { dayStart: cutoffDayStart } = dayBoundsUtc(cutoffDateKey);

  await prisma.$transaction(async (tx) => {
    const fixturesResult = await tx.fixture.deleteMany({
      where: { date: { lt: cutoffDayStart } },
    });
    const logsResult = await tx.apiFetchLog.deleteMany({
      where: { resource: { not: `fixtures:${dateKey}` } },
    });
    return [fixturesResult.count, logsResult.count];
  });
}

/**
 * Clear in-memory cache and delete today's fixtures and fetch log from the DB.
 * Next call to getOrRefreshTodayFixtures() will refetch from the API (with leagueId etc).
 */
export async function clearTodayFixturesCacheAndData(now: Date = new Date()): Promise<void> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);

  globalForFixtures.todayFixturesPromise = undefined;

  await prisma.$transaction([
    prisma.fixture.deleteMany({ where: { date: { gte: dayStart, lte: spilloverEnd } } }),
    prisma.apiFetchLog.deleteMany({ where: { resource: `fixtures:${dateKey}` } }),
  ]);

}

/**
 * Return today's fixtures from DB only (no API, no refresh). Use for resume so we don't refetch.
 */
export async function getTodayFixturesFromDbOnly(now: Date = new Date()): Promise<FixtureSummary[]> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);
  const rows = await prisma.fixture.findMany({
    where: { date: { gte: dayStart, lte: spilloverEnd } },
    orderBy: { date: "asc" },
    include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
  });
  return rows.map(mapFixtureToSummary);
}

/**
 * Return fixtures for a given date (YYYY-MM-DD) from DB only. Used to show full stats for
 * warmed upcoming fixtures (e.g. tomorrow after warm-tomorrow). No API calls, no materialization.
 * Cached 60s (stale-while-revalidate) to reduce DB load under traffic.
 */
export async function getFixturesForDateFromDbOnly(dateKey: string): Promise<FixtureSummary[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  return unstable_cache(
    async () => {
      const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);
      const rows = await prisma.fixture.findMany({
        where: { date: { gte: dayStart, lte: spilloverEnd } },
        orderBy: { date: "asc" },
        include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
      });
      return rows.map(mapFixtureToSummary);
    },
    ["fixtures-date", dateKey],
    { revalidate: 60 }
  )();
}

/**
 * Request-scoped cache: within the same request (e.g. generateMetadata + page), only one execution per dateKey.
 * Use in pages that call today fixtures or date fixtures from both metadata and body to avoid duplicate work.
 */
export const getOrRefreshTodayFixturesRequestCached = cache((dateKey: string) =>
  getOrRefreshTodayFixtures(new Date(dateKey + "T12:00:00.000Z"))
);

export const getFixturesForDateRequestCached = cache((dateKey: string) =>
  getFixturesForDateFromDbOnly(dateKey)
);

/**
 * Request-scoped cache for resolving a single fixture by date + slugs.
 * When both generateMetadata and the page need the preview (fixture not in warmed list), only one execution per request.
 */
export const getFixturePreviewRequestCached = cache(
  (dateKey: string, leagueSlug: string, matchSlugParam: string) =>
    getFixturePreview(dateKey, leagueSlug, matchSlugParam)
);

export type PastFixturesByDate = { dateKey: string; fixtures: FixtureSummary[] }[];

/**
 * Return fixtures from the last 14 days (from Fixture table). Used for the "past fixtures" page.
 * Only includes dates that have at least one fixture. Most recent first (yesterday first).
 */
export async function getPast14DaysFixturesFromDb(): Promise<PastFixturesByDate> {
  const pastKeys = pastDateKeys(PAST_FIXTURES_RETENTION_DAYS);
  const byDate: PastFixturesByDate = [];
  for (const dateKey of pastKeys) {
    const fixtures = await getFixturesForDateFromDbOnly(dateKey);
    const filtered = fixtures.filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    );
    if (filtered.length > 0) {
      byDate.push({ dateKey, fixtures: filtered });
    }
  }
  return byDate;
}

/**
 * Materialize tomorrow's fixtures from UpcomingFixture into the Fixture table so they can be warmed (player/team stats).
 * Returns fixture summaries for the given dateKey (e.g. tomorrow). Used by warm-tomorrow only; site continues to show only today.
 */
export async function getTomorrowFixturesForWarming(tomorrowDateKey: string): Promise<FixtureSummary[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tomorrowDateKey)) return [];
  const rows = await prisma.upcomingFixture.findMany({
    where: { dateKey: tomorrowDateKey },
    orderBy: { kickoff: "asc" },
  });
  const filtered = rows.filter((r) =>
    isFixtureInRequiredLeagues({ leagueId: r.leagueId, league: r.league })
  );
  if (filtered.length === 0) return [];

  for (const row of filtered) {
    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.upsert({
        where: { apiId: row.homeTeamApiId },
        update: {
          name: row.homeTeamName,
          shortName: row.homeTeamShortName,
        },
        create: {
          apiId: row.homeTeamApiId,
          name: row.homeTeamName,
          shortName: row.homeTeamShortName,
        },
      }),
      prisma.team.upsert({
        where: { apiId: row.awayTeamApiId },
        update: {
          name: row.awayTeamName,
          shortName: row.awayTeamShortName,
        },
        create: {
          apiId: row.awayTeamApiId,
          name: row.awayTeamName,
          shortName: row.awayTeamShortName,
        },
      }),
    ]);
    await prisma.fixture.upsert({
      where: { apiId: row.apiFixtureId },
      update: {
        date: row.kickoff,
        league: row.league,
        leagueId: row.leagueId,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
      },
      create: {
        apiId: row.apiFixtureId,
        date: row.kickoff,
        season: API_SEASON,
        league: row.league,
        leagueId: row.leagueId,
        status: "NS",
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
      },
    });
  }

  const { dayStart, spilloverEnd } = dayBoundsUtc(tomorrowDateKey);
  const fixtures = await prisma.fixture.findMany({
    where: { date: { gte: dayStart, lte: spilloverEnd } },
    orderBy: { date: "asc" },
    include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
  });
  return fixtures.map(mapFixtureToSummary);
}

/**
 * Fetch today's fixtures from DB or refresh from API if stale/missing.
 * Cached 60s (stale-while-revalidate) to reduce DB/API load under traffic.
 */
export async function getOrRefreshTodayFixtures(now: Date = new Date()): Promise<FixtureSummary[]> {
  const dateKey = getTodayDateKey(now);
  return unstable_cache(
    () => getOrRefreshTodayFixturesUncached(now),
    ["today-fixtures", dateKey],
    { revalidate: 60 }
  )();
}

async function getOrRefreshTodayFixturesUncached(now: Date): Promise<FixtureSummary[]> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);

  await pruneDataOlderThanToday(now);

  // 1️⃣ Check if fixtures exist in DB and last fetch was today
  const [existingFixtures, lastFetchLog] = await Promise.all([
    prisma.fixture.findMany({
      where: { date: { gte: dayStart, lte: spilloverEnd } },
      orderBy: { date: "asc" },
      include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
    }),
    prisma.apiFetchLog.findFirst({
      where: { resource: `fixtures:${dateKey}`, success: true },
      orderBy: { fetchedAt: "desc" },
    }),
  ]);

  // When we have 0 fixtures, clear today's fetch log so we always refetch from API (avoids stale "success" state)
  if (existingFixtures.length === 0) {
    globalForFixtures.todayFixturesPromise = undefined;
    await prisma.apiFetchLog.deleteMany({ where: { resource: `fixtures:${dateKey}` } });
  }

  // Use cache when we have fixtures and a successful fetch for today (no API calls)
  if (lastFetchLog && lastFetchLog.fetchedAt >= dayStart && existingFixtures.length > 0) {
    return existingFixtures.map(mapFixtureToSummary);
  }

  // After midnight: use warmed fixtures already in DB for this date (from warm-tomorrow) as today's list
  if (existingFixtures.length > 0) {
    return existingFixtures.map(mapFixtureToSummary);
  }

  // If another refresh is in progress and we have fixtures, return the shared promise
  if (globalForFixtures.todayFixturesPromise?.dateKey === dateKey && existingFixtures.length > 0) {
    return globalForFixtures.todayFixturesPromise.promise;
  }

  const refreshPromise = (async (): Promise<FixtureSummary[]> => {
    let rawFixtures: RawFixture[] = [];
    let message: string | undefined;

    try {
      // Fetch leagues sequentially to avoid rate-limit burst (parallel requests can all fire after 1s wait and get 429/empty).
      const results: RawFixture[][] = [];
      const FIXTURE_FETCH_DELAY_MS = Number(process.env.FOOTBALL_API_MIN_INTERVAL_MS) || 1200;
      for (let i = 0; i < REQUIRED_LEAGUE_IDS.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, FIXTURE_FETCH_DELAY_MS));
        const leagueId = REQUIRED_LEAGUE_IDS[i];
        const list = await fetchTodayFixtures({ date: dateKey, leagueId, timezone: FIXTURES_TIMEZONE });
        results.push(list);
        if (list.length > 0) {
          console.log("[fixturesService] date=" + dateKey + " league=" + leagueId + " -> " + list.length + " fixtures");
        }
      }
      const countsPerLeague = results.map((r, i) => ({ leagueId: REQUIRED_LEAGUE_IDS[i], count: r.length }));
      if (results.every((r) => r.length === 0)) {
        console.warn("[fixturesService] API returned 0 fixtures for date", dateKey, "(Europe/London). Counts per league:", countsPerLeague.map((c) => `${c.leagueId}:${c.count}`).join(", "), "- check API plan/rate limit or server logs for [footballApi].");
      }
      const seen = new Set<string>();
      rawFixtures = results.flat().filter((raw) => {
        const key = getFixtureExternalId(raw);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      rawFixtures.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Process fixtures in batches to avoid timeout and improve performance
      const BATCH_SIZE = 50;

      for (let batchStart = 0; batchStart < rawFixtures.length; batchStart += BATCH_SIZE) {
        const batch = rawFixtures.slice(batchStart, batchStart + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.allSettled(
          batch.map(async (raw) => {
            try {
              // Upsert teams first (these are independent operations)
              // Use team country when present, otherwise league country (same for both teams in a fixture)
              const homeCountry = raw.homeTeam.country ?? raw.leagueCountry ?? null;
              const awayCountry = raw.awayTeam.country ?? raw.leagueCountry ?? null;

              const [homeTeam, awayTeam] = await Promise.all([
                prisma.team.upsert({
                  where: { apiId: getTeamExternalId(raw.homeTeam) },
                  update: {
                    name: raw.homeTeam.name,
                    shortName: raw.homeTeam.shortName,
                    country: homeCountry,
                  },
                  create: {
                    apiId: getTeamExternalId(raw.homeTeam),
                    name: raw.homeTeam.name,
                    shortName: raw.homeTeam.shortName,
                    country: homeCountry,
                  },
                }),
                prisma.team.upsert({
                  where: { apiId: getTeamExternalId(raw.awayTeam) },
                  update: {
                    name: raw.awayTeam.name,
                    shortName: raw.awayTeam.shortName,
                    country: awayCountry,
                  },
                  create: {
                    apiId: getTeamExternalId(raw.awayTeam),
                    name: raw.awayTeam.name,
                    shortName: raw.awayTeam.shortName,
                    country: awayCountry,
                  },
                }),
              ]);
              
              // Then upsert fixture
              const fixtureData = {
                date: new Date(raw.date),
                season: API_SEASON,
                league: raw.league ?? null,
                leagueId: raw.leagueId ?? null,
                status: raw.status ?? "UNKNOWN",
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
              };
              await prisma.fixture.upsert({
                where: { apiId: getFixtureExternalId(raw) },
                update: fixtureData,
                create: {
                  apiId: getFixtureExternalId(raw),
                  ...fixtureData,
                },
              });
            } catch {
              // Continue with other fixtures
            }
          })
        );
      }
      
      // Create success log
      await prisma.apiFetchLog.create({
        data: {
          resource: `fixtures:${dateKey}`,
          success: true,
          message: `Fetched ${rawFixtures.length} fixtures`,
        },
      });
    } catch (err) {
      message = err instanceof Error ? err.message : "Unknown error";

      try {
        await prisma.apiFetchLog.create({
          data: { resource: `fixtures:${dateKey}`, success: false, message },
        });
      } catch {
        // Ignore log write failure
      }
    }

    // Return whatever is in DB after refresh (include spillover for "tonight" games)
    const refreshedFixtures = await prisma.fixture.findMany({
      where: { date: { gte: dayStart, lte: spilloverEnd } },
      orderBy: { date: "asc" },
      include: { homeTeam: true, awayTeam: true, liveScoreCache: true },
    });

    return refreshedFixtures.map(mapFixtureToSummary);
  })();

  globalForFixtures.todayFixturesPromise = { dateKey, promise: refreshPromise };

  refreshPromise.catch(() => {
    // Clear the failed promise so it can be retried
    if (globalForFixtures.todayFixturesPromise?.dateKey === dateKey) {
      globalForFixtures.todayFixturesPromise = undefined;
    }
  });
  
  return refreshPromise;
}

type FixtureWithTeams = Fixture & {
  leagueId?: number | null;
  homeTeam: Team;
  awayTeam: Team;
  liveScoreCache?: { statusShort: string } | null;
};

function mapFixtureToSummary(f: FixtureWithTeams): FixtureSummary {
  return {
    id: f.id,
    date: f.date,
    status: f.status,
    statusShort: f.liveScoreCache?.statusShort,
    league: f.league,
    leagueId: f.leagueId ?? null,
    season: API_SEASON,
    homeTeam: {
      id: f.homeTeam.id,
      name: f.homeTeam.name,
      shortName: f.homeTeam.shortName,
      crestUrl: (f.homeTeam as { crestUrl?: string | null }).crestUrl ?? null,
    },
    awayTeam: {
      id: f.awayTeam.id,
      name: f.awayTeam.name,
      shortName: f.awayTeam.shortName,
      crestUrl: (f.awayTeam as { crestUrl?: string | null }).crestUrl ?? null,
    },
  };
}
