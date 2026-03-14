import { prisma } from "@/lib/prisma";
import { fetchAllLiveFixtures } from "@/lib/footballApi";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

const FIXTURES_TZ = "Europe/London";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export type LiveScoreEntry = {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
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
      now.getTime() - kickoff.getTime() < TWO_HOURS_MS
    );
  });

  if (liveWindowFixtures.length === 0) {
    return { scores: [] };
  }

  let apiLive: { apiId: number; homeGoals: number; awayGoals: number; elapsedMinutes: number | null; statusShort: string }[] = [];
  try {
    apiLive = await fetchAllLiveFixtures();
  } catch (err) {
    console.error("[liveScoresService] Failed to fetch all live fixtures", err);
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
    toUpsert.push({ fixtureId: f.id, data });
    scores.push({
      fixtureId: f.id,
      homeGoals: data.homeGoals,
      awayGoals: data.awayGoals,
      elapsedMinutes: data.elapsedMinutes,
      statusShort: data.statusShort,
    });
  }

  await Promise.all(
    toUpsert.map(({ fixtureId, data }) =>
      prisma.liveScoreCache.upsert({
        where: { fixtureId },
        create: {
          fixtureId,
          homeGoals: data.homeGoals,
          awayGoals: data.awayGoals,
          elapsedMinutes: data.elapsedMinutes,
          statusShort: data.statusShort,
          cachedAt: nowDate,
        },
        update: {
          homeGoals: data.homeGoals,
          awayGoals: data.awayGoals,
          elapsedMinutes: data.elapsedMinutes,
          statusShort: data.statusShort,
          cachedAt: nowDate,
        },
      }),
    ),
  );

  return { scores };
}
