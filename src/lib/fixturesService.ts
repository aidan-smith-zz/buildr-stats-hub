import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import {
  fetchTodayFixtures,
  getFixtureExternalId,
  getTeamExternalId,
  type RawFixture,
} from "@/lib/footballApi";
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

/** Start/end of the given date (YYYY-MM-DD) in UTC for DB queries */
function dayBoundsUtc(dateKey: string) {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  return { dayStart, dayEnd };
}

/** Current season year for API (e.g. 2024 for 2024-25). European season runs Aug–May. */
function getCurrentSeasonYear(now: Date = new Date()): number {
  const dateKey = getTodayDateKey(now);
  const year = parseInt(dateKey.slice(0, 4), 10);
  const month = parseInt(dateKey.slice(5, 7), 10);
  return month >= 8 ? year : year - 1;
}

/**
 * Remove fixtures and fetch logs that are not from today. Keeps the fixture list focused on today only.
 * PlayerSeasonStats are NOT pruned here so that cached stats stay in the DB and fixture stats load fast
 * when returning to the site (otherwise every visit would wipe stats and trigger slow API refetches).
 */
export async function pruneDataOlderThanToday(now: Date = new Date()): Promise<void> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, dayEnd } = dayBoundsUtc(dateKey);

  const [fixturesDeleted, logsDeleted] = await prisma.$transaction(async (tx) => {
    const fixturesResult = await tx.fixture.deleteMany({
      where: {
        OR: [{ date: { lt: dayStart } }, { date: { gt: dayEnd } }],
      },
    });
    const logsResult = await tx.apiFetchLog.deleteMany({
      where: { resource: { not: `fixtures:${dateKey}` } },
    });
    return [fixturesResult.count, logsResult.count];
  });

  if (fixturesDeleted > 0 || logsDeleted > 0) {
    console.log(`[fixturesService] Pruned: ${fixturesDeleted} old fixtures, ${logsDeleted} old fetch logs`);
  }
}

/**
 * Clear in-memory cache and delete today's fixtures and fetch log from the DB.
 * Next call to getOrRefreshTodayFixtures() will refetch from the API (with leagueId etc).
 */
export async function clearTodayFixturesCacheAndData(now: Date = new Date()): Promise<void> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, dayEnd } = dayBoundsUtc(dateKey);

  globalForFixtures.todayFixturesPromise = undefined;

  await prisma.$transaction([
    prisma.fixture.deleteMany({ where: { date: { gte: dayStart, lte: dayEnd } } }),
    prisma.apiFetchLog.deleteMany({ where: { resource: `fixtures:${dateKey}` } }),
  ]);

  console.log(`[fixturesService] Cleared cache and deleted fixtures + fetch log for ${dateKey}`);
}

/**
 * Fetch today's fixtures from DB or refresh from API if stale/missing.
 */
export async function getOrRefreshTodayFixtures(now: Date = new Date()): Promise<FixtureSummary[]> {
  const dateKey = getTodayDateKey(now);
  const { dayStart, dayEnd } = dayBoundsUtc(dateKey);

  console.log(`[fixturesService] getOrRefreshTodayFixtures called for date: ${dateKey} (${FIXTURES_TIMEZONE})`);

  await pruneDataOlderThanToday(now);

  // 1️⃣ Check if fixtures exist in DB and last fetch was today
  const [existingFixtures, lastFetchLog] = await Promise.all([
    prisma.fixture.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      orderBy: { date: "asc" },
      include: { homeTeam: true, awayTeam: true },
    }),
    prisma.apiFetchLog.findFirst({
      where: { resource: `fixtures:${dateKey}`, success: true },
      orderBy: { fetchedAt: "desc" },
    }),
  ]);

  console.log(`[fixturesService] Found ${existingFixtures.length} existing fixtures in DB`);
  console.log(`[fixturesService] Last fetch log:`, lastFetchLog ? {
    fetchedAt: lastFetchLog.fetchedAt,
    dayStart: dayStart,
    isToday: lastFetchLog.fetchedAt >= dayStart,
  } : 'none');

  // When we have 0 fixtures, clear today's fetch log so we always refetch from API (avoids stale "success" state)
  if (existingFixtures.length === 0) {
    globalForFixtures.todayFixturesPromise = undefined;
    await prisma.apiFetchLog.deleteMany({ where: { resource: `fixtures:${dateKey}` } });
    console.log(`[fixturesService] No fixtures for today - cleared fetch log and in-memory cache, will fetch from API`);
  }

  // Only use cache if we have fixtures AND last fetch was today
  if (lastFetchLog && lastFetchLog.fetchedAt >= dayStart && existingFixtures.length > 0) {
    console.log(`[fixturesService] Returning cached fixtures (last fetch was today, ${existingFixtures.length} fixtures found)`);
    return existingFixtures.map(mapFixtureToSummary);
  }

  // If another refresh is in progress and we have fixtures, return the shared promise
  if (globalForFixtures.todayFixturesPromise?.dateKey === dateKey && existingFixtures.length > 0) {
    console.log(`[fixturesService] Returning existing refresh promise for ${dateKey}`);
    return globalForFixtures.todayFixturesPromise.promise;
  }

  // 3️⃣ Fetch fresh fixtures from API
  console.log(`[fixturesService] Creating new refresh promise for ${dateKey}`);
  const refreshPromise = (async (): Promise<FixtureSummary[]> => {
    console.log(`[fixturesService] Refresh promise EXECUTING - about to call API`);
    let rawFixtures: RawFixture[] = [];
    let message: string | undefined;

    try {
      // Fetch only the required leagues (one API call per league)
      console.log(`[fixturesService] Fetching fixtures for ${dateKey} for leagues: ${REQUIRED_LEAGUE_IDS.join(", ")}`);
      const season = getCurrentSeasonYear(now);
      console.log(`[fixturesService] Using season: ${season}`);
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
      console.log(`[fixturesService] Received ${rawFixtures.length} fixtures from API`);

      // Process fixtures in batches to avoid timeout and improve performance
      const BATCH_SIZE = 50;
      let processedCount = 0;
      let errorCount = 0;
      
      if (rawFixtures.length > 0) {
        const sample = rawFixtures[0];
        console.log(`[fixturesService] First raw fixture leagueId:`, sample.leagueId, "league:", sample.league);
      }

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
              
              processedCount++;
            } catch (fixtureError) {
              errorCount++;
              console.error(`[fixturesService] Error processing fixture:`, fixtureError);
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
      console.error("[getOrRefreshTodayFixtures] Error refreshing fixtures", err);
      message = err instanceof Error ? err.message : "Unknown error";

      try {
        await prisma.apiFetchLog.create({
          data: { resource: `fixtures:${dateKey}`, success: false, message },
        });
      } catch (logError) {
        console.error("[fixturesService] Failed to create error log:", logError);
      }
    }

    // Return whatever is in DB after refresh
    const refreshedFixtures = await prisma.fixture.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      orderBy: { date: "asc" },
      include: { homeTeam: true, awayTeam: true },
    });

    return refreshedFixtures.map(mapFixtureToSummary);
  })();

  globalForFixtures.todayFixturesPromise = { dateKey, promise: refreshPromise };
  console.log(`[fixturesService] Stored refresh promise in cache and returning it`);
  
  // Ensure the promise starts executing immediately
  refreshPromise.catch((error) => {
    console.error(`[fixturesService] Refresh promise error:`, error);
    // Clear the failed promise so it can be retried
    if (globalForFixtures.todayFixturesPromise?.dateKey === dateKey) {
      globalForFixtures.todayFixturesPromise = undefined;
    }
  });
  
  return refreshPromise;
}

type FixtureWithTeams = Fixture & { leagueId?: number | null; homeTeam: Team; awayTeam: Team };

function mapFixtureToSummary(f: FixtureWithTeams): FixtureSummary {
  return {
    id: f.id,
    date: f.date,
    status: f.status,
    league: f.league,
    leagueId: f.leagueId ?? null,
    season: f.season,
    homeTeam: {
      id: f.homeTeam.id,
      name: f.homeTeam.name,
      shortName: f.homeTeam.shortName,
    },
    awayTeam: {
      id: f.awayTeam.id,
      name: f.awayTeam.name,
      shortName: f.awayTeam.shortName,
    },
  };
}
