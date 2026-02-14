import { prisma } from "@/lib/prisma";
import {
  fetchTodayFixtures,
  getFixtureExternalId,
  getTeamExternalId,
  type RawFixture,
} from "@/lib/footballApi";
import type { FixtureSummary } from "@/lib/statsService";
import type { Fixture, Team } from "@prisma/client";

/**
 * Global in-memory cache to prevent duplicate API calls per day
 */
const globalForFixtures = globalThis as unknown as {
  todayFixturesPromise?: { dateKey: string; promise: Promise<FixtureSummary[]> };
};

/** Helpers to get start/end of day in UTC */
function startOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toDateOnlyIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Clear in-memory cache and delete today's fixtures and fetch log from the DB.
 * Next call to getOrRefreshTodayFixtures() will refetch from the API (with leagueId etc).
 */
export async function clearTodayFixturesCacheAndData(now: Date = new Date()): Promise<void> {
  const dayStart = startOfDayUtc(now);
  const dayEnd = endOfDayUtc(now);
  const dateKey = toDateOnlyIso(now);

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
  const dayStart = startOfDayUtc(now);
  const dayEnd = endOfDayUtc(now);
  const dateKey = toDateOnlyIso(now);

  console.log(`[fixturesService] getOrRefreshTodayFixtures called for date: ${dateKey}`);

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

  // Only use cache if we have fixtures AND last fetch was today
  // If we have 0 fixtures, refetch even if there's a fetch log (might have been an error or wrong filters)
  if (lastFetchLog && lastFetchLog.fetchedAt >= dayStart && existingFixtures.length > 0) {
    console.log(`[fixturesService] Returning cached fixtures (last fetch was today, ${existingFixtures.length} fixtures found)`);
    return existingFixtures.map(mapFixtureToSummary);
  }
  
  if (lastFetchLog && lastFetchLog.fetchedAt >= dayStart && existingFixtures.length === 0) {
    console.log(`[fixturesService] Cache exists but 0 fixtures found - forcing refetch for debugging`);
  } else {
    console.log(`[fixturesService] Cache expired or no fixtures, proceeding to fetch from API`);
  }

  // 2️⃣ If another refresh is in progress, return the shared promise
  // BUT: If we have 0 fixtures, clear the cache and force a new fetch
  if (globalForFixtures.todayFixturesPromise?.dateKey === dateKey) {
    if (existingFixtures.length === 0) {
      console.log(`[fixturesService] Clearing existing refresh promise cache (0 fixtures found)`);
      globalForFixtures.todayFixturesPromise = undefined;
    } else {
      console.log(`[fixturesService] Returning existing refresh promise for ${dateKey}`);
      return globalForFixtures.todayFixturesPromise.promise;
    }
  }

  // 3️⃣ Fetch fresh fixtures from API
  console.log(`[fixturesService] Creating new refresh promise for ${dateKey}`);
  const refreshPromise = (async (): Promise<FixtureSummary[]> => {
    console.log(`[fixturesService] Refresh promise EXECUTING - about to call API`);
    let rawFixtures: RawFixture[] = [];
    let message: string | undefined;

    try {
      // Fetch all fixtures for the date (no filters - gets all leagues and seasons)
      console.log(`[fixturesService] Fetching all fixtures for ${dateKey} (no filters)`);
      rawFixtures = await fetchTodayFixtures({
        date: dateKey,
        // No leagueId or season - gets all fixtures for the date
      });
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
