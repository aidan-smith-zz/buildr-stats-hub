import { prisma } from "@/lib/prisma";
import { fetchAllLiveFixtures } from "@/lib/footballApi";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

const FIXTURES_TZ = "Europe/London";
// Include extra time + potential penalties (can run > 2 hours from kickoff).
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
/** If all in-window fixtures have cache this fresh, skip external API and serve from DB only (avoids holding connection). */
const LIVE_CACHE_FRESH_MS = 90 * 1000;

/** statusShort values that mean the match is finished (exclude from /live list). */
const LIVE_FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "ABD",
  "AWD",
  "WO",
  "CAN",
]);

export type LiveScoreEntry = {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  penaltyHome: number | null;
  penaltyAway: number | null;
  elapsedMinutes: number | null;
  statusShort: string;
};

/**
 * Get live scores for today's in-window fixtures: one external API call (fixtures?live=all),
 * map by apiId, update LiveScoreCache, return scores keyed by our fixture id.
 * Call this directly from the live page (no self-fetch) so it works in dev and prod.
 */
export async function getLiveScoresForToday(): Promise<{
  scores: LiveScoreEntry[];
  error?: string;
}> {
  const now = new Date();
  const dateKey = now.toLocaleDateString("en-CA", { timeZone: FIXTURES_TZ });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { scores: [] };
  }

  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const nextDayStr = new Date(dayEnd.getTime() + 1).toISOString().slice(0, 10);
  const spilloverEnd = new Date(`${nextDayStr}T00:59:59.999Z`);

  const fixtures = await prisma.fixture.findMany({
    where: {
      date: { gte: dayStart, lte: spilloverEnd },
      leagueId: { in: [...REQUIRED_LEAGUE_IDS] },
      apiId: { not: null },
    },
    select: { id: true, apiId: true, date: true },
  });

  const liveWindowFixtures = fixtures.filter((f) => {
    const kickoff = new Date(f.date);
    if (Number.isNaN(kickoff.getTime())) return false;
    return (
      kickoff.getTime() <= now.getTime() &&
      now.getTime() - kickoff.getTime() < THREE_HOURS_MS
    );
  });

  if (liveWindowFixtures.length === 0) {
    return { scores: [] };
  }

  const liveFixtureIds = liveWindowFixtures.map((f) => f.id);
  const cacheCutoff = new Date(now.getTime() - LIVE_CACHE_FRESH_MS);

  // If we already have fresh cache for every in-window fixture, serve from DB only (no external API).
  const existingCache = await prisma.liveScoreCache.findMany({
    where: { fixtureId: { in: liveFixtureIds } },
    select: {
      fixtureId: true,
      homeGoals: true,
      awayGoals: true,
      penaltyHome: true,
      penaltyAway: true,
      elapsedMinutes: true,
      statusShort: true,
      cachedAt: true,
    },
  });
  const cacheByFixtureId = new Map(existingCache.map((r) => [r.fixtureId, r]));
  const allHaveFreshCache =
    liveFixtureIds.length > 0 &&
    liveFixtureIds.every((id) => {
      const row = cacheByFixtureId.get(id);
      return row != null && row.cachedAt >= cacheCutoff;
    });

  if (allHaveFreshCache) {
    const scores: LiveScoreEntry[] = liveFixtureIds
      .map((fixtureId) => {
        const row = cacheByFixtureId.get(fixtureId);
        if (!row) return null;
        const statusUpper = (row.statusShort ?? "").toUpperCase();
        if (statusUpper.length > 0 && LIVE_FINISHED_STATUSES.has(statusUpper)) {
          return null;
        }
        return {
          fixtureId,
          homeGoals: row.homeGoals,
          awayGoals: row.awayGoals,
          penaltyHome: row.penaltyHome ?? null,
          penaltyAway: row.penaltyAway ?? null,
          elapsedMinutes: row.elapsedMinutes,
          statusShort: row.statusShort,
        };
      })
      .filter((s): s is LiveScoreEntry => s != null);
    return { scores };
  }

  let apiLive: Awaited<ReturnType<typeof fetchAllLiveFixtures>> = [];
  try {
    apiLive = await fetchAllLiveFixtures();
  } catch (err) {
    console.error("[liveScoresService] Failed to fetch all live fixtures", err);
    // On timeout or error, serve from cache if we have any (so page still renders).
    if (existingCache.length > 0) {
      const scores: LiveScoreEntry[] = existingCache.map((r) => ({
        fixtureId: r.fixtureId,
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        penaltyHome: r.penaltyHome ?? null,
        penaltyAway: r.penaltyAway ?? null,
        elapsedMinutes: r.elapsedMinutes,
        statusShort: r.statusShort,
      }));
      return { scores, error: "Live data temporarily unavailable; showing cached scores" };
    }
    return { scores: [], error: "Failed to fetch live data" };
  }

  const byApiId = new Map(
    apiLive.map((item) => [String(item.apiId), item]),
  );

  const scores: LiveScoreEntry[] = [];
  const nowDate = new Date();
  const toUpsert: { fixtureId: number; data: (typeof apiLive)[number] }[] = [];

  for (const f of liveWindowFixtures) {
    const apiId = f.apiId;
    if (apiId == null) continue;
    const data = byApiId.get(String(apiId));
    if (!data) continue;
    const statusUpper = (data.statusShort ?? "").toUpperCase();
    if (statusUpper.length > 0 && LIVE_FINISHED_STATUSES.has(statusUpper)) continue;
    toUpsert.push({ fixtureId: f.id, data });
    scores.push({
      fixtureId: f.id,
      homeGoals: data.homeGoals,
      awayGoals: data.awayGoals,
      penaltyHome: data.penaltyHome,
      penaltyAway: data.penaltyAway,
      elapsedMinutes: data.elapsedMinutes,
      statusShort: data.statusShort,
    });
  }

  const BATCH_SIZE = 5;
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ fixtureId, data }) =>
        prisma.liveScoreCache.upsert({
          where: { fixtureId },
          create: {
            fixtureId,
            homeGoals: data.homeGoals,
            awayGoals: data.awayGoals,
            penaltyHome: data.penaltyHome,
            penaltyAway: data.penaltyAway,
            elapsedMinutes: data.elapsedMinutes,
            statusShort: data.statusShort,
            cachedAt: nowDate,
          },
          update: {
            homeGoals: data.homeGoals,
            awayGoals: data.awayGoals,
            penaltyHome: data.penaltyHome,
            penaltyAway: data.penaltyAway,
            elapsedMinutes: data.elapsedMinutes,
            statusShort: data.statusShort,
            cachedAt: nowDate,
          },
        }),
      ),
    );
  }

  return { scores };
}
