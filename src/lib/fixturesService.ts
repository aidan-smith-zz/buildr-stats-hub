import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import {
  fetchTodayFixtures,
  getFixtureExternalId,
  getTeamExternalId,
  type RawFixture,
} from "@/lib/footballApi";
import { leagueToSlug, matchSlug, nextDateKeys, todayDateKey } from "@/lib/slugs";
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

/** Current season year for API (e.g. 2024 for 2024-25). European season runs Aug–May. */
function getCurrentSeasonYear(now: Date = new Date()): number {
  const dateKey = getTodayDateKey(now);
  const year = parseInt(dateKey.slice(0, 4), 10);
  const month = parseInt(dateKey.slice(5, 7), 10);
  return month >= 8 ? year : year - 1;
}

/** Season year for a given date key (YYYY-MM-DD). Used for preview fetches. */
function getSeasonYearForDate(dateKey: string): number {
  const year = parseInt(dateKey.slice(0, 4), 10);
  const month = parseInt(dateKey.slice(5, 7), 10);
  return month >= 8 ? year : year - 1;
}

const FIXTURES_TIMEZONE_PREVIEW = "Europe/London";

/**
 * Fetch fixtures for a given date from the API only (no DB). For use in SSG preview pages and generateStaticParams.
 * Filters to REQUIRED_LEAGUE_IDS.
 */
export async function getFixturesForDatePreview(dateKey: string): Promise<RawFixture[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  const season = getSeasonYearForDate(dateKey);
  const results = await Promise.all(
    REQUIRED_LEAGUE_IDS.map((leagueId) =>
      fetchTodayFixtures({
        date: dateKey,
        leagueId,
        season,
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
  return (
    fixtures.find((f) => {
      const slug = leagueToSlug(f.league ?? null);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const m = matchSlug(home, away);
      return slug === leagueSlug && m === matchSlugParam;
    }) ?? null
  );
}

/** Map UpcomingFixture row to RawFixture shape for preview pages. */
function upcomingRowToRaw(row: {
  apiFixtureId: string;
  kickoff: Date;
  league: string | null;
  leagueId: number | null;
  homeTeamName: string;
  homeTeamShortName: string | null;
  awayTeamName: string;
  awayTeamShortName: string | null;
}): RawFixture {
  return {
    id: row.apiFixtureId,
    date: row.kickoff.toISOString(),
    league: row.league ?? undefined,
    leagueId: row.leagueId ?? undefined,
    homeTeam: {
      id: row.apiFixtureId,
      name: row.homeTeamName,
      shortName: row.homeTeamShortName ?? undefined,
    },
    awayTeam: {
      id: row.apiFixtureId,
      name: row.awayTeamName,
      shortName: row.awayTeamShortName ?? undefined,
    },
  };
}

/**
 * Find a single upcoming fixture by date and slug. Returns RawFixture shape or null.
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
      return upcomingRowToRaw(row);
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
 * Get upcoming fixtures from DB (next 14 days). Returns grouped by dateKey with team crest URLs. Empty if table not yet populated.
 */
export async function getUpcomingFixturesFromDb(): Promise<UpcomingFixtureByDate[]> {
  const today = todayDateKey();
  const rows = await prisma.upcomingFixture.findMany({
    where: { dateKey: { gte: today } },
    orderBy: [{ dateKey: "asc" }, { kickoff: "asc" }],
  });
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
      const leagueCountry = null;
      for (const raw of fixtures) {
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

/**
 * Remove fixtures and fetch logs that are not from today. Keeps the fixture list focused on today only.
 * PlayerSeasonStats are NOT pruned here so that cached stats stay in the DB and fixture stats load fast
 * when returning to the site (otherwise every visit would wipe stats and trigger slow API refetches).
 */
export async function pruneDataOlderThanToday(now: Date = new Date()): Promise<void> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);

  const [fixturesDeleted, logsDeleted] = await prisma.$transaction(async (tx) => {
    const fixturesResult = await tx.fixture.deleteMany({
      where: {
        OR: [{ date: { lt: dayStart } }, { date: { gt: spilloverEnd } }],
      },
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
 * Fetch today's fixtures from DB or refresh from API if stale/missing.
 */
export async function getOrRefreshTodayFixtures(now: Date = new Date()): Promise<FixtureSummary[]> {
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

  // Only use cache if we have fixtures AND last fetch was today
  if (lastFetchLog && lastFetchLog.fetchedAt >= dayStart && existingFixtures.length > 0) {
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
      const season = getCurrentSeasonYear(now);
      const results = await Promise.all(
        REQUIRED_LEAGUE_IDS.map((leagueId) =>
          fetchTodayFixtures({ date: dateKey, leagueId, season, timezone: FIXTURES_TIMEZONE })
        )
      );
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
                season: String(raw.season ?? ""),
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
    season: f.season,
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
