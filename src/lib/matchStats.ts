import type { FixtureTeamStats } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchFixtureStatistics, type RawFixtureTeamStats } from "@/lib/footballApi";

const STAT_DELAY_MS = Number(process.env.FOOTBALL_API_DELAY_MS) || 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serializable match snapshot (API + UI). */
export type MatchStatsSnapshot = {
  goals: number;
  xg: number | null;
  corners: number;
  yellowCards: number;
  redCards: number;
  fouls: number;
  shots: number;
  shotsOnTarget: number;
  possessionPct: number | null;
};

export function fixtureTeamStatsRowToSnapshot(row: FixtureTeamStats): MatchStatsSnapshot {
  return {
    goals: row.goals,
    xg: row.xg,
    corners: row.corners,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    fouls: row.fouls,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget,
    possessionPct: row.possessionPct,
  };
}

export function pairFromFixtureTeamStatsRows(
  rows: FixtureTeamStats[],
  homeTeamId: number,
  awayTeamId: number,
): { home: MatchStatsSnapshot; away: MatchStatsSnapshot } | null {
  const home = rows.find((r) => r.teamId === homeTeamId);
  const away = rows.find((r) => r.teamId === awayTeamId);
  if (!home || !away) return null;
  return { home: fixtureTeamStatsRowToSnapshot(home), away: fixtureTeamStatsRowToSnapshot(away) };
}

export async function loadMatchStatsPairFromDb(
  fixtureId: number,
  homeTeamId: number,
  awayTeamId: number,
): Promise<{ home: MatchStatsSnapshot; away: MatchStatsSnapshot } | null> {
  const rows = await prisma.fixtureTeamStats.findMany({
    where: { fixtureId, teamId: { in: [homeTeamId, awayTeamId] } },
  });
  return pairFromFixtureTeamStatsRows(rows, homeTeamId, awayTeamId);
}

function rawToUpsertData(raw: RawFixtureTeamStats) {
  return {
    goals: raw.goals,
    xg: raw.xg,
    corners: raw.corners,
    yellowCards: raw.yellowCards,
    redCards: raw.redCards,
    fouls: raw.fouls,
    shots: raw.shots,
    shotsOnTarget: raw.shotsOnTarget,
    possessionPct: raw.possessionPct,
  };
}

export async function upsertFixtureMatchStatsFromApi(params: {
  fixtureId: number;
  fixtureApiId: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamApiId: string | null;
  awayTeamApiId: string | null;
}): Promise<void> {
  const { fixtureId, fixtureApiId, homeTeamId, awayTeamId, homeTeamApiId, awayTeamApiId } = params;
  if (!homeTeamApiId || !awayTeamApiId) return;

  const homeRaw = await fetchFixtureStatistics(fixtureApiId, homeTeamApiId);
  if (STAT_DELAY_MS > 0) await sleep(STAT_DELAY_MS);
  const awayRaw = await fetchFixtureStatistics(fixtureApiId, awayTeamApiId);

  if (homeRaw) {
    await prisma.fixtureTeamStats.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: homeTeamId } },
      create: { fixtureId, teamId: homeTeamId, ...rawToUpsertData(homeRaw) },
      update: rawToUpsertData(homeRaw),
    });
  }
  if (awayRaw) {
    await prisma.fixtureTeamStats.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: awayTeamId } },
      create: { fixtureId, teamId: awayTeamId, ...rawToUpsertData(awayRaw) },
      update: rawToUpsertData(awayRaw),
    });
  }
}

type FixtureIdsForMatchStats = {
  id: number;
  apiId: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamApiId: string | null;
  awayTeamApiId: string | null;
};

/**
 * Load cached per-team stats, or fetch from API when missing / when refreshFromApi.
 * Aligns with live score refresh: pass refreshFromApi=true after a fresh fixtures?id= call.
 */
export async function resolveMatchStatsForFixture(
  fixture: FixtureIdsForMatchStats,
  options: { refreshFromApi: boolean },
): Promise<{ home: MatchStatsSnapshot; away: MatchStatsSnapshot } | null> {
  const { id, apiId, homeTeamId, awayTeamId, homeTeamApiId, awayTeamApiId } = fixture;
  if (!apiId || !homeTeamApiId || !awayTeamApiId) return null;

  if (!options.refreshFromApi) {
    const cached = await loadMatchStatsPairFromDb(id, homeTeamId, awayTeamId);
    if (cached) return cached;
  }

  await upsertFixtureMatchStatsFromApi({
    fixtureId: id,
    fixtureApiId: apiId,
    homeTeamId,
    awayTeamId,
    homeTeamApiId,
    awayTeamApiId,
  });
  return loadMatchStatsPairFromDb(id, homeTeamId, awayTeamId);
}
