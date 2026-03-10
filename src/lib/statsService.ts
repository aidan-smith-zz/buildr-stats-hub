import { prisma } from "@/lib/prisma";
import {
  API_SEASON,
  fetchFixtureScoreWithTeams,
  fetchFixtureStatistics,
  fetchPlayerSeasonStatsByTeam,
  fetchTeamFixturesWithGoals,
  getPlayerExternalId,
  type RawPlayerSeasonStats,
} from "@/lib/footballApi";
import {
  getStatsLeagueForFixture,
  isTeamStatsOnlyLeague,
  SCOTTISH_CUP_LEAGUE_ID,
} from "@/lib/leagues";
import { ensureLineupIfWithinWindow, getLineupForFixture } from "@/lib/lineupService";

/** Prisma client with TeamFixtureCache (avoids TS errors when generated client is out of date). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { teamFixtureCache: any };

/** Fixture including leagueId (schema has it; Prisma payload may omit until client is regenerated) */
type FixtureWithLeagueId = { leagueId?: number | null; league?: string | null };

export type FixtureSummary = {
  id: number;
  date: Date;
  status: string;
  /** From LiveScoreCache when available; e.g. FT, AET, PEN. Used to hide "Live" badge when match has ended. */
  statusShort?: string;
  league: string | null;
  leagueId: number | null;
  season: string;
  homeTeam: { id: number; name: string; shortName: string | null; crestUrl: string | null };
  awayTeam: { id: number; name: string; shortName: string | null; crestUrl: string | null };
};

export type TeamStatsPer90 = {
  xgPer90: number | null;
  goalsPer90: number;
  concededPer90: number;
  cornersPer90: number;
  cardsPer90: number;
};

export type FixtureStatsResponse = {
  fixture: FixtureSummary;
  /** True when lineup exists in DB for this fixture (so lineupStatus on players is authoritative). */
  hasLineup: boolean;
  teams: {
    teamId: number;
    teamName: string;
    teamShortName: string | null;
    players: {
      playerId: number;
      name: string;
      position: string | null;
      shirtNumber: number | null;
      appearances: number;
      minutes: number;
      goals: number;
      assists: number;
      fouls: number;
      shots: number;
      shotsOnTarget: number;
      tackles: number;
      yellowCards: number;
      redCards: number;
      /** "starting" | "substitute" | null (null = not involved). Only set when lineup exists in DB. */
      lineupStatus: "starting" | "substitute" | null;
    }[];
  }[];
  teamStats?: {
    home: TeamStatsPer90;
    away: TeamStatsPer90;
  };
  /** Same shape as teamStats but from last 5 fixtures (average per match). No extra API. */
  teamStatsLast5?: {
    home: TeamStatsPer90;
    away: TeamStatsPer90;
  };
  /** Raw season totals used to compute teamStats (goalsFor / matches = goalsPer90). For debug/UI calculation display. */
  teamStatsTotals?: {
    home: { goalsFor: number; goalsAgainst: number; matches: number };
    away: { goalsFor: number; goalsAgainst: number; matches: number };
  };
  /** Last 5 fixtures per team with raw goal counts, used for bet-type form visualisation. */
  last5Goals?: {
    home: { goalsFor: number; goalsAgainst: number }[];
    away: { goalsFor: number; goalsAgainst: number }[];
  };
  /** Set when team stats exist in DB but are all zeros (e.g. API plan limit). UI can show an explanation. */
  teamStatsUnavailableReason?: string;
};

const MAX_FIXTURES_PER_SEASON = 38;

/** Extra delay between fixture-statistics API calls (optional). The main throttle is FOOTBALL_API_MIN_INTERVAL_MS in footballApi. Set FOOTBALL_API_DELAY_MS to 500+ if you still hit limits. */
const FIXTURE_STATS_DELAY_MS = Number(process.env.FOOTBALL_API_DELAY_MS) || 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Max fixture-statistics API calls per invocation so one request stays under ~60s (e.g. 20 * 1s delay + response time). */
const TEAM_STATS_CHUNK_SIZE = 20;
/** For League 1/2 combined teamstats (both teams in one request): 28 per team = 56 total, ~56s (fits in 60s). */
const TEAM_STATS_BOTH_CHUNK_PER_TEAM = 28;

export type EnsureTeamSeasonStatsResult = { done: boolean };

/**
 * Aggregate team stats for this season: goals/conceded from API fixture list,
 * corners/cards/xG from fixture statistics. Data is kept in DB (never cleared overnight).
 * Only fetches fixture statistics for fixtures not already in TeamFixtureCache (incremental).
 * When maxApiCallsPerInvocation is set, only does that many API calls per call and returns { done: false } until all are cached.
 */
async function ensureTeamSeasonStatsCornersAndCards(
  teamId: number,
  teamApiId: string,
  season: string,
  leagueKey: string,
  leagueId: number,
  options?: { maxApiCallsPerInvocation?: number; cacheLeagueKey?: string },
): Promise<EnsureTeamSeasonStatsResult> {
  const maxCalls = options?.maxApiCallsPerInvocation;
  /** Use canonical key (leagueId as string) for TeamFixtureCache so last-5 matches across "Championship" vs "EFL Championship" etc. */
  const cacheKey = options?.cacheLeagueKey ?? leagueKey;

  const resource = `teamSeasonCorners:${teamId}:${season}:${leagueKey}`;

  const { fixtureIds, goalsFor, goalsAgainst, played, fixtures: fixturesMeta } = await fetchTeamFixturesWithGoals(teamApiId, season, leagueId);
  const now = new Date();
  const pastFixtures = (fixturesMeta ?? []).filter((f) => f.date < now);
  const pastFixtureIds = pastFixtures.map((f) => f.apiFixtureId);
  const pastGoalsFor = pastFixtures.reduce((a, f) => a + f.goalsFor, 0);
  const pastGoalsAgainst = pastFixtures.reduce((a, f) => a + f.goalsAgainst, 0);
  const playedPast = pastFixtures.length;

  if (fixtureIds.length === 0) {
    console.warn("[statsService] fetchTeamFixturesWithGoals returned no fixtures (possible API plan limit)", {
      teamId,
      teamApiId,
      season,
      leagueKey,
      leagueId,
    });
  }
  /** Season per-match uses only past fixtures (match date in the past). */
  const minutesPlayed = playedPast * 90;

  const limit = Math.min(pastFixtureIds.length, MAX_FIXTURES_PER_SEASON);
  const fixtureIdsToProcess = pastFixtureIds.slice(0, limit);
  /** Map apiFixtureId -> isHome for home/away season splits (from API fixture list). */
  const isHomeByApiId = new Map(
    pastFixtures.slice(0, limit).map((f) => [String(f.apiFixtureId), f.isHome])
  );

  type CachedFixtureStats = {
    apiFixtureId: string;
    goalsFor: number;
    goalsAgainst: number;
    corners: number;
    yellowCards: number;
    redCards: number;
    xg: number | null;
  };
  const existingCache = await db.teamFixtureCache.findMany({
    where: {
      teamId,
      season,
      league: cacheKey,
      apiFixtureId: { in: fixtureIdsToProcess.map((id) => String(id)) },
    },
    select: {
      apiFixtureId: true,
      goalsFor: true,
      goalsAgainst: true,
      corners: true,
      yellowCards: true,
      redCards: true,
      xg: true,
    },
  });
  const cacheByApiFixtureId = new Map<string, CachedFixtureStats>(
    existingCache.map((r: CachedFixtureStats) => [r.apiFixtureId, r])
  );

  const apiFixtureIds = fixtureIdsToProcess.map((id) => String(id));

  type CacheRowForAggregate = {
    apiFixtureId: string;
    goalsFor: number;
    goalsAgainst: number;
    corners: number;
    yellowCards: number;
    redCards: number;
    xg: number | null;
  };

  /** Aggregate cache rows into combined + home/away buckets using isHomeByApiId (from API list). */
  function aggregateHomeAway(
    cacheRows: CacheRowForAggregate[],
    isHomeMap: Map<string, boolean>
  ): {
    corners: number;
    yellowCards: number;
    redCards: number;
    xgFor: number | null;
    homeGames: number;
    awayGames: number;
    homeGoalsFor: number;
    homeGoalsAgainst: number;
    homeCorners: number;
    homeYellowCards: number;
    homeRedCards: number;
    homeXgFor: number | null;
    awayGoalsFor: number;
    awayGoalsAgainst: number;
    awayCorners: number;
    awayYellowCards: number;
    awayRedCards: number;
    awayXgFor: number | null;
  } {
    let corners = 0;
    let yellowCards = 0;
    let redCards = 0;
    let xgSum = 0;
    let xgCount = 0;
    let homeGames = 0;
    let awayGames = 0;
    let homeGoalsFor = 0;
    let homeGoalsAgainst = 0;
    let homeCorners = 0;
    let homeYellowCards = 0;
    let homeRedCards = 0;
    let homeXgSum = 0;
    let homeXgCount = 0;
    let awayGoalsFor = 0;
    let awayGoalsAgainst = 0;
    let awayCorners = 0;
    let awayYellowCards = 0;
    let awayRedCards = 0;
    let awayXgSum = 0;
    let awayXgCount = 0;
    for (const r of cacheRows) {
      const isHome = isHomeMap.get(r.apiFixtureId) ?? false;
      corners += r.corners;
      yellowCards += r.yellowCards;
      redCards += r.redCards;
      if (r.xg != null) {
        xgSum += r.xg;
        xgCount++;
      }
      if (isHome) {
        homeGames += 1;
        homeGoalsFor += r.goalsFor;
        homeGoalsAgainst += r.goalsAgainst;
        homeCorners += r.corners;
        homeYellowCards += r.yellowCards;
        homeRedCards += r.redCards;
        if (r.xg != null) {
          homeXgSum += r.xg;
          homeXgCount++;
        }
      } else {
        awayGames += 1;
        awayGoalsFor += r.goalsFor;
        awayGoalsAgainst += r.goalsAgainst;
        awayCorners += r.corners;
        awayYellowCards += r.yellowCards;
        awayRedCards += r.redCards;
        if (r.xg != null) {
          awayXgSum += r.xg;
          awayXgCount++;
        }
      }
    }
    const xgFor = xgCount > 0 ? xgSum : null;
    const homeXgFor = homeXgCount > 0 ? homeXgSum : null;
    const awayXgFor = awayXgCount > 0 ? awayXgSum : null;
    return {
      corners,
      yellowCards,
      redCards,
      xgFor,
      homeGames,
      awayGames,
      homeGoalsFor,
      homeGoalsAgainst,
      homeCorners,
      homeYellowCards,
      homeRedCards,
      homeXgFor,
      awayGoalsFor,
      awayGoalsAgainst,
      awayCorners,
      awayYellowCards,
      awayRedCards,
      awayXgFor,
    };
  }

  /** Upsert TeamSeasonStats from current cache (and full goals/minutes). Populates home/away splits. */
  async function upsertTeamSeasonStatsFromCache(
    cacheRows: CacheRowForAggregate[],
    isHomeMap: Map<string, boolean>
  ) {
    const agg = aggregateHomeAway(cacheRows, isHomeMap);
    await prisma.teamSeasonStats.upsert({
      where: {
        teamId_season_league: { teamId, season, league: leagueKey },
      },
      create: {
        teamId,
        season,
        league: leagueKey,
        leagueId,
        minutesPlayed,
        goalsFor: pastGoalsFor,
        goalsAgainst: pastGoalsAgainst,
        xgFor: agg.xgFor,
        corners: agg.corners,
        yellowCards: agg.yellowCards,
        redCards: agg.redCards,
        homeGames: agg.homeGames,
        awayGames: agg.awayGames,
        homeGoalsFor: agg.homeGoalsFor,
        homeGoalsAgainst: agg.homeGoalsAgainst,
        homeCorners: agg.homeCorners,
        homeYellowCards: agg.homeYellowCards,
        homeRedCards: agg.homeRedCards,
        homeXgFor: agg.homeXgFor,
        awayGoalsFor: agg.awayGoalsFor,
        awayGoalsAgainst: agg.awayGoalsAgainst,
        awayCorners: agg.awayCorners,
        awayYellowCards: agg.awayYellowCards,
        awayRedCards: agg.awayRedCards,
        awayXgFor: agg.awayXgFor,
      },
      update: {
        minutesPlayed,
        goalsFor: pastGoalsFor,
        goalsAgainst: pastGoalsAgainst,
        xgFor: agg.xgFor,
        corners: agg.corners,
        yellowCards: agg.yellowCards,
        redCards: agg.redCards,
        homeGames: agg.homeGames,
        awayGames: agg.awayGames,
        homeGoalsFor: agg.homeGoalsFor,
        homeGoalsAgainst: agg.homeGoalsAgainst,
        homeCorners: agg.homeCorners,
        homeYellowCards: agg.homeYellowCards,
        homeRedCards: agg.homeRedCards,
        homeXgFor: agg.homeXgFor,
        awayGoalsFor: agg.awayGoalsFor,
        awayGoalsAgainst: agg.awayGoalsAgainst,
        awayCorners: agg.awayCorners,
        awayYellowCards: agg.awayYellowCards,
        awayRedCards: agg.awayRedCards,
        awayXgFor: agg.awayXgFor,
      },
    });
  }

  // When chunked: write a row immediately so warm-today stops re-adding this fixture even if we timeout before returning.
  if (maxCalls != null) {
    const partialCacheRows = await db.teamFixtureCache.findMany({
      where: {
        teamId,
        season,
        league: cacheKey,
        apiFixtureId: { in: apiFixtureIds },
      },
      select: { apiFixtureId: true, goalsFor: true, goalsAgainst: true, corners: true, yellowCards: true, redCards: true, xg: true },
    });
    await upsertTeamSeasonStatsFromCache(partialCacheRows as CacheRowForAggregate[], isHomeByApiId);
    console.log("[statsService] TeamSeasonStats upserted (chunked path)", {
      teamId,
      season,
      leagueKey,
      goalsFor: pastGoalsFor,
      goalsAgainst: pastGoalsAgainst,
      played: playedPast,
      cacheRowsUsed: partialCacheRows.length,
    });
  }

  let apiCallsThisInvocation = 0;

  for (let i = 0; i < limit; i++) {
    if (maxCalls != null && apiCallsThisInvocation >= maxCalls) {
      const partialCacheRows = await db.teamFixtureCache.findMany({
        where: {
          teamId,
          season,
          league: cacheKey,
          apiFixtureId: { in: apiFixtureIds },
        },
        select: { apiFixtureId: true, goalsFor: true, goalsAgainst: true, corners: true, yellowCards: true, redCards: true, xg: true },
      });
      await upsertTeamSeasonStatsFromCache(partialCacheRows as CacheRowForAggregate[], isHomeByApiId);
      return { done: false };
    }
    const apiFixtureId = String(fixtureIdsToProcess[i]);
    const meta = pastFixtures[i];
    const cached = cacheByApiFixtureId.get(apiFixtureId);

    const needsGoalsFallback =
      cached && cached.goalsFor === 0 && cached.goalsAgainst === 0;

    // List API is source of truth for goals: always use meta so we never overwrite correct 0-0 (or any score) with stale cache.
    if (meta) {
      let goalsFor = meta.goalsFor;
      let goalsAgainst = meta.goalsAgainst;
      let attemptedScoreFallback = false;

      if (goalsFor === 0 && goalsAgainst === 0) {
        if (maxCalls != null && apiCallsThisInvocation >= maxCalls) {
          // Skip this round so we retry next time
        } else {
          if (apiCallsThisInvocation > 0) await sleep(FIXTURE_STATS_DELAY_MS);
          apiCallsThisInvocation++;
          attemptedScoreFallback = true;
          const scoreWithTeams = await fetchFixtureScoreWithTeams(fixtureIdsToProcess[i]);
          if (scoreWithTeams) {
            const teamIdNum = Number(teamApiId);
            if (scoreWithTeams.homeTeamId === teamIdNum) {
              goalsFor = scoreWithTeams.homeGoals;
              goalsAgainst = scoreWithTeams.awayGoals;
            } else if (scoreWithTeams.awayTeamId === teamIdNum) {
              goalsFor = scoreWithTeams.awayGoals;
              goalsAgainst = scoreWithTeams.homeGoals;
            }
          }
        }
      }

      // Store any score we have, including legitimate 0-0. We only skip when we have no fixture meta.
      // Do not skip 0-0: the list or score-fallback can both provide a valid 0-0 to store.
      // Fetch fixture statistics when we have no cache, or when cached row is all zeros (so we can fill corners/cards).
      const shouldFetchStat = !cached || needsGoalsFallback;
      if (shouldFetchStat) {
        if (apiCallsThisInvocation > 0) await sleep(FIXTURE_STATS_DELAY_MS);
        apiCallsThisInvocation++;
      }
      const stat = shouldFetchStat ? await fetchFixtureStatistics(fixtureIdsToProcess[i], teamApiId) : null;
      const corners = stat?.corners ?? cached?.corners ?? 0;
      const yellowCards = stat?.yellowCards ?? cached?.yellowCards ?? 0;
      const redCards = stat?.redCards ?? cached?.redCards ?? 0;
      const xg = stat?.xg ?? cached?.xg ?? null;
      // Use list/fallback score when we have it (including 0-0). Only use statistics API goals when score wasn't confirmed.
      const scoreConfirmed = attemptedScoreFallback || goalsFor > 0 || goalsAgainst > 0;
      const finalGoalsFor = scoreConfirmed ? goalsFor : (stat?.goals != null ? stat.goals : 0);
      const finalGoalsAgainst = scoreConfirmed ? goalsAgainst : 0;

      const isHome = meta?.isHome ?? false;
      await db.teamFixtureCache.upsert({
        where: {
          teamId_season_league_apiFixtureId: {
            teamId,
            season,
            league: cacheKey,
            apiFixtureId,
          },
        },
        create: {
          teamId,
          season,
          league: cacheKey,
          apiFixtureId,
          fixtureDate: meta.date,
          isHome,
          goalsFor: finalGoalsFor,
          goalsAgainst: finalGoalsAgainst,
          xg,
          corners,
          yellowCards,
          redCards,
        },
        update: {
          fixtureDate: meta.date,
          isHome,
          goalsFor: finalGoalsFor,
          goalsAgainst: finalGoalsAgainst,
          xg,
          corners,
          yellowCards,
          redCards,
        },
      });
    }
  }

  // All fixtures processed (from cache or API). Aggregate from DB and write season row (combined + home/away).
  const cacheRows = await db.teamFixtureCache.findMany({
    where: {
      teamId,
      season,
      league: cacheKey,
      apiFixtureId: { in: fixtureIdsToProcess.map((id) => String(id)) },
    },
    select: { apiFixtureId: true, goalsFor: true, goalsAgainst: true, corners: true, yellowCards: true, redCards: true, xg: true },
  });
  const agg = aggregateHomeAway(cacheRows as CacheRowForAggregate[], isHomeByApiId);

  await prisma.teamSeasonStats.upsert({
    where: {
      teamId_season_league: { teamId, season, league: leagueKey },
    },
    create: {
      teamId,
      season,
      league: leagueKey,
      leagueId,
      minutesPlayed,
      goalsFor: pastGoalsFor,
      goalsAgainst: pastGoalsAgainst,
      xgFor: agg.xgFor,
      corners: agg.corners,
      yellowCards: agg.yellowCards,
      redCards: agg.redCards,
      homeGames: agg.homeGames,
      awayGames: agg.awayGames,
      homeGoalsFor: agg.homeGoalsFor,
      homeGoalsAgainst: agg.homeGoalsAgainst,
      homeCorners: agg.homeCorners,
      homeYellowCards: agg.homeYellowCards,
      homeRedCards: agg.homeRedCards,
      homeXgFor: agg.homeXgFor,
      awayGoalsFor: agg.awayGoalsFor,
      awayGoalsAgainst: agg.awayGoalsAgainst,
      awayCorners: agg.awayCorners,
      awayYellowCards: agg.awayYellowCards,
      awayRedCards: agg.awayRedCards,
      awayXgFor: agg.awayXgFor,
    },
    update: {
      minutesPlayed,
      goalsFor: pastGoalsFor,
      goalsAgainst: pastGoalsAgainst,
      xgFor: agg.xgFor,
      corners: agg.corners,
      yellowCards: agg.yellowCards,
      redCards: agg.redCards,
      homeGames: agg.homeGames,
      awayGames: agg.awayGames,
      homeGoalsFor: agg.homeGoalsFor,
      homeGoalsAgainst: agg.homeGoalsAgainst,
      homeCorners: agg.homeCorners,
      homeYellowCards: agg.homeYellowCards,
      homeRedCards: agg.homeRedCards,
      homeXgFor: agg.homeXgFor,
      awayGoalsFor: agg.awayGoalsFor,
      awayGoalsAgainst: agg.awayGoalsAgainst,
      awayCorners: agg.awayCorners,
      awayYellowCards: agg.awayYellowCards,
      awayRedCards: agg.awayRedCards,
      awayXgFor: agg.awayXgFor,
    },
  });

  await prisma.apiFetchLog.create({
    data: { resource, success: true },
  });
  return { done: true };
}

export async function warmTeamSeasonStatsForTeam(
  teamId: number,
  teamApiId: string,
  leagueKey: string,
  leagueId: number,
  options?: { maxApiCallsPerInvocation?: number; cacheLeagueKey?: string },
): Promise<EnsureTeamSeasonStatsResult> {
  return ensureTeamSeasonStatsCornersAndCards(
    teamId,
    teamApiId,
    API_SEASON,
    leagueKey,
    leagueId,
    options,
  );
}

/**
 * Top-up only: fetch fixture list (1 API call) and set isHome on existing TeamFixtureCache rows.
 * When leagueKeyForSeasonStats is provided, also backfills TeamSeasonStats home/away from cache
 * so team pages show home vs away (already-warmed teams had 0/0 before this).
 */
export async function topUpIsHomeForTeam(
  teamId: number,
  teamApiId: string,
  leagueId: number,
  options?: { cacheLeagueKey?: string; leagueKeyForSeasonStats?: string },
): Promise<{ updated: number }> {
  const cacheKey = options?.cacheLeagueKey ?? String(leagueId);
  const leagueKeyForSeasonStats = options?.leagueKeyForSeasonStats;
  const { fixtures } = await fetchTeamFixturesWithGoals(teamApiId, API_SEASON, leagueId);
  const isHomeByApiId = new Map(fixtures.map((f) => [String(f.apiFixtureId), f.isHome]));

  const rows = await db.teamFixtureCache.findMany({
    where: { teamId, season: API_SEASON, league: cacheKey },
    select: { apiFixtureId: true, isHome: true },
  });

  let updated = 0;
  for (const row of rows) {
    const want = isHomeByApiId.get(row.apiFixtureId);
    if (want === undefined || row.isHome === want) continue;
    await db.teamFixtureCache.update({
      where: {
        teamId_season_league_apiFixtureId: {
          teamId,
          season: API_SEASON,
          league: cacheKey,
          apiFixtureId: row.apiFixtureId,
        },
      },
      data: { isHome: want },
    });
    updated += 1;
  }

  // Backfill TeamSeasonStats home/away from cache so team page shows home vs away profile.
  if (leagueKeyForSeasonStats) {
    const cacheRows = await db.teamFixtureCache.findMany({
      where: { teamId, season: API_SEASON, league: cacheKey },
      select: {
        apiFixtureId: true,
        goalsFor: true,
        goalsAgainst: true,
        corners: true,
        yellowCards: true,
        redCards: true,
        xg: true,
        isHome: true,
      },
    });
    const isHomeMap = new Map(cacheRows.map((r) => [r.apiFixtureId, r.isHome]));
    let homeGames = 0;
    let awayGames = 0;
    let homeGoalsFor = 0;
    let homeGoalsAgainst = 0;
    let homeCorners = 0;
    let homeYellowCards = 0;
    let homeRedCards = 0;
    let homeXgSum = 0;
    let homeXgCount = 0;
    let awayGoalsFor = 0;
    let awayGoalsAgainst = 0;
    let awayCorners = 0;
    let awayYellowCards = 0;
    let awayRedCards = 0;
    let awayXgSum = 0;
    let awayXgCount = 0;
    for (const r of cacheRows) {
      const isHome = isHomeMap.get(r.apiFixtureId) ?? false;
      if (isHome) {
        homeGames += 1;
        homeGoalsFor += r.goalsFor;
        homeGoalsAgainst += r.goalsAgainst;
        homeCorners += r.corners;
        homeYellowCards += r.yellowCards;
        homeRedCards += r.redCards;
        if (r.xg != null) {
          homeXgSum += r.xg;
          homeXgCount++;
        }
      } else {
        awayGames += 1;
        awayGoalsFor += r.goalsFor;
        awayGoalsAgainst += r.goalsAgainst;
        awayCorners += r.corners;
        awayYellowCards += r.yellowCards;
        awayRedCards += r.redCards;
        if (r.xg != null) {
          awayXgSum += r.xg;
          awayXgCount++;
        }
      }
    }
    // Find by leagueId so we update the row the team page uses even when league string
    // differs (e.g. "EFL Championship" from fixture warm vs "Championship" from warm-league-stats).
    let rowsToUpdate = await prisma.teamSeasonStats.findMany({
      where: { teamId, season: API_SEASON, leagueId },
      select: { id: true },
    });
    if (rowsToUpdate.length === 0 && leagueKeyForSeasonStats) {
      const byLeague = await prisma.teamSeasonStats.findUnique({
        where: {
          teamId_season_league: { teamId, season: API_SEASON, league: leagueKeyForSeasonStats },
        },
        select: { id: true },
      });
      if (byLeague) rowsToUpdate = [byLeague];
    }
    for (const row of rowsToUpdate) {
      await prisma.teamSeasonStats.update({
        where: { id: row.id },
        data: {
          homeGames,
          awayGames,
          homeGoalsFor,
          homeGoalsAgainst,
          homeCorners,
          homeYellowCards,
          homeRedCards,
          homeXgFor: homeXgCount > 0 ? homeXgSum : null,
          awayGoalsFor,
          awayGoalsAgainst,
          awayCorners,
          awayYellowCards,
          awayRedCards,
          awayXgFor: awayXgCount > 0 ? awayXgSum : null,
        },
      });
    }
  }

  return { updated };
}

/** Skip refetching player stats for a team if we already updated within this many ms. */
const PLAYER_STATS_REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Fetch and store player season stats for a team from the API.
 * Skips the API call if this team/season/league was already refreshed recently (incremental).
 */
async function fetchAndStorePlayerStats(
  teamId: number,
  teamApiId: string,
  season: string,
  league: string | null,
  leagueId?: number,
): Promise<void> {
  try {
    const leagueKey = league || "Unknown";
    const recent = await prisma.playerSeasonStats.findFirst({
      where: { teamId, season, league: leagueKey },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    const skipThreshold = new Date(Date.now() - PLAYER_STATS_REFRESH_COOLDOWN_MS);
    if (recent && recent.updatedAt >= skipThreshold) {
      return; // Already refreshed recently; use DB data
    }

    let rawStats = await fetchPlayerSeasonStatsByTeam({
      teamExternalId: teamApiId,
      season,
      leagueId: leagueId,
    });

    const before = rawStats.length;
    rawStats = rawStats.filter((raw) => {
      const s = raw.stats;
      return (
        (s.appearances ?? 0) > 0 ||
        (s.minutes ?? 0) > 0 ||
        (s.goals ?? 0) > 0 ||
        (s.assists ?? 0) > 0 ||
        (s.fouls ?? 0) > 0 ||
        (s.shots ?? 0) > 0 ||
        (s.shotsOnTarget ?? 0) > 0 ||
        (s.tackles ?? 0) > 0 ||
        (s.yellowCards ?? 0) > 0 ||
        (s.redCards ?? 0) > 0
      );
    });
    const leagueNameBase = league || "Unknown";
    const BATCH_SIZE = 10;

    async function storeOne(raw: RawPlayerSeasonStats): Promise<void> {
      const player = await prisma.player.upsert({
        where: { apiId: getPlayerExternalId(raw.player) },
        update: {
          name: raw.player.name,
          position: raw.player.position ?? null,
          shirtNumber: raw.player.shirtNumber ?? null,
        },
        create: {
          apiId: getPlayerExternalId(raw.player),
          name: raw.player.name,
          position: raw.player.position ?? null,
          shirtNumber: raw.player.shirtNumber ?? null,
          teamId: teamId,
        },
      });
      const leagueName = leagueNameBase || raw.league || "Unknown";
      const seasonStr = String(season);
      const existing = await prisma.playerSeasonStats.findFirst({
        where: {
          playerId: player.id,
          teamId: teamId,
          season: seasonStr,
          league: leagueName,
        },
      });
      const data = {
        appearances: raw.stats.appearances ?? 0,
        minutes: raw.stats.minutes ?? 0,
        goals: raw.stats.goals ?? 0,
        assists: raw.stats.assists ?? 0,
        fouls: raw.stats.fouls ?? 0,
        shots: raw.stats.shots ?? 0,
        shotsOnTarget: raw.stats.shotsOnTarget ?? 0,
        tackles: raw.stats.tackles ?? 0,
        yellowCards: raw.stats.yellowCards ?? 0,
        redCards: raw.stats.redCards ?? 0,
      };
      if (existing) {
        await prisma.playerSeasonStats.update({ where: { id: existing.id }, data });
      } else {
        await prisma.playerSeasonStats.create({
          data: {
            playerId: player.id,
            teamId: teamId,
            season: seasonStr,
            league: leagueName,
            ...data,
          },
        });
      }
    }

    for (let i = 0; i < rawStats.length; i += BATCH_SIZE) {
      const batch = rawStats.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map((raw) =>
          storeOne(raw).catch((err) => {
            console.error("[statsService] Error storing player stats");
          })
        )
      );
    }

  } catch (error) {
    console.error("[statsService] Error fetching player stats");
    throw error;
  }
}

const LEAGUE_ID_MAP: Record<string, number> = {
  "Premier League": 39,
  "Championship": 40,
  "English League Championship": 40,
  "EFL Championship": 40,
  "The Championship": 40,
  "English Championship": 40,
  "UEFA Champions League": 2,
  "UEFA Europa League": 3,
  "Champions League": 2,
  "Europa League": 3,
  "Scottish Championship": 179,
  "Scottish Premiership": 179,
  "FA Cup": 45,
  "League 41": 41,
  "League 1": 41,
  "League One": 41,
  "English League One": 41,
  "EFL League One": 41,
  "League 42": 42,
  "League 2": 42,
  "League Two": 42,
  "English League Two": 42,
  "EFL League Two": 42,
  "Scottish Cup": 181,
};

export type WarmPartResult =
  | { ok: true; teamId: number }
  | { ok: true; done: boolean }
  | { ok: true };

/**
 * Warm one part of fixture stats (stays under 60s for Vercel Hobby).
 * - part=home|away: player season stats for that team.
 * - part=teamstats: League 1/2 only; both teams in one request (fewer round-trips).
 * - part=teamstats-home|teamstats-away: team season stats (chunked); returns { done } so caller can loop until done.
 * - part=lineup: ensure lineup if within window.
 */
export async function warmFixturePart(
  fixtureId: number,
  part: "home" | "away" | "teamstats" | "teamstats-home" | "teamstats-away" | "lineup",
): Promise<WarmPartResult> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!fixture) throw new Error("Fixture not found");
  const fixtureWithLeague = fixture as FixtureWithLeagueId;
  const { leagueId, leagueKey } = getStatsLeagueForFixture(fixtureWithLeague);

  const teamStatsOnly = isTeamStatsOnlyLeague(fixtureWithLeague.leagueId);

  if (part === "teamstats") {
    if (!teamStatsOnly) return { ok: true, done: true };
    if (leagueId == null) return { ok: true, done: true };
    const homeOk = fixture.homeTeam.apiId;
    const awayOk = fixture.awayTeam.apiId;
    let homeDone = !homeOk;
    let awayDone = !awayOk;
    if (homeOk) {
      const r = await ensureTeamSeasonStatsCornersAndCards(
        fixture.homeTeamId,
        fixture.homeTeam.apiId!,
        API_SEASON,
        leagueKey,
        leagueId,
        { maxApiCallsPerInvocation: TEAM_STATS_BOTH_CHUNK_PER_TEAM, cacheLeagueKey: String(leagueId) },
      );
      homeDone = r.done;
    }
    if (awayOk) {
      const r = await ensureTeamSeasonStatsCornersAndCards(
        fixture.awayTeamId,
        fixture.awayTeam.apiId!,
        API_SEASON,
        leagueKey,
        leagueId,
        { maxApiCallsPerInvocation: TEAM_STATS_BOTH_CHUNK_PER_TEAM, cacheLeagueKey: String(leagueId) },
      );
      awayDone = r.done;
    }
    return { ok: true, done: homeDone && awayDone };
  }

  if (part === "home" || part === "away" || part === "lineup") {
    if (teamStatsOnly) {
      if (part === "home" || part === "away") return { ok: true, teamId: part === "home" ? fixture.homeTeamId : fixture.awayTeamId };
      return { ok: true };
    }
  }

  if (part === "teamstats-home" || part === "teamstats-away") {
    const team = part === "teamstats-home" ? fixture.homeTeam : fixture.awayTeam;
    const teamId = part === "teamstats-home" ? fixture.homeTeamId : fixture.awayTeamId;
    if (!team.apiId || leagueId == null) {
      return { ok: true, done: true };
    }
    const result = await ensureTeamSeasonStatsCornersAndCards(
      teamId,
      team.apiId,
      API_SEASON,
      leagueKey,
      leagueId,
      { maxApiCallsPerInvocation: TEAM_STATS_CHUNK_SIZE, cacheLeagueKey: String(leagueId) },
    );
    return { ok: true, done: result.done };
  }

  if (part === "lineup") {
    await ensureLineupIfWithinWindow(
      fixture.id,
      fixture.date,
      fixture.apiId,
      fixture.homeTeamId,
      fixture.awayTeamId,
      fixture.homeTeam.apiId,
      fixture.awayTeam.apiId,
    );
    return { ok: true };
  }

  const team = part === "home" ? fixture.homeTeam : fixture.awayTeam;
  const teamId = part === "home" ? fixture.homeTeamId : fixture.awayTeamId;
  if (team.apiId) {
    await fetchAndStorePlayerStats(
      teamId,
      team.apiId,
      API_SEASON,
      leagueKey,
      leagueId,
    );
  }
  return { ok: true, teamId };
}

export type GetFixtureStatsOptions = { dbOnly?: boolean; /** When true, run DB queries one-by-one to avoid pool exhaustion (e.g. connection_limit=1). */ sequential?: boolean };

const DEBUG_FIXTURE = process.env.DEBUG_FIXTURE === "1" || process.env.DEBUG_FIXTURE === "true";

export async function getFixtureStats(
  fixtureId: number,
  options?: GetFixtureStatsOptions,
): Promise<FixtureStatsResponse | null> {
  const dbOnly = options?.dbOnly === true;
  const sequential = options?.sequential === true;

  if (DEBUG_FIXTURE) {
    console.log("[fixture-debug] getFixtureStats start", { fixtureId, dbOnly, sequential });
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (!fixture) {
    return null;
  }

  /** Only include played fixtures in last-5 (exclude upcoming/future). */
  const now = new Date();

  const fixtureWithLeagueId = fixture as FixtureWithLeagueId;
  const teamIds = [fixture.homeTeamId, fixture.awayTeamId];
  const { leagueId: leagueIdForTeamStats, leagueKey: leagueKeyForTeamStats } =
    getStatsLeagueForFixture(fixtureWithLeagueId);
  const leagueFilter =
    leagueKeyForTeamStats !== "Unknown" ? { league: leagueKeyForTeamStats } : {};
  /** Canonical key for TeamFixtureCache (leagueId as string) so last-5 matches across API name variants. */
  const canonicalLeagueKey =
    leagueIdForTeamStats != null ? String(leagueIdForTeamStats) : leagueKeyForTeamStats;

  const teamStatsWhere = (teamId: number) => ({
    teamId,
    season: API_SEASON,
    ...(leagueIdForTeamStats != null
      ? { OR: [{ league: leagueKeyForTeamStats }, { leagueId: leagueIdForTeamStats }] }
      : { league: leagueKeyForTeamStats }),
  });

  // Run independent DB checks (parallel when possible; sequential when connection_limit=1).
  const groupByQuery = () =>
    prisma.playerSeasonStats.groupBy({
      by: ["teamId"],
      where: {
        teamId: { in: teamIds },
        season: API_SEASON,
        ...leagueFilter,
      },
      _count: { id: true },
    });
  let counts: Awaited<ReturnType<typeof groupByQuery>>;
  let homeTeamStatsExisting: Awaited<ReturnType<typeof prisma.teamSeasonStats.findFirst>>;
  let awayTeamStatsExisting: Awaited<ReturnType<typeof prisma.teamSeasonStats.findFirst>>;
  let lineupCount: number;
  let lineupByTeamInitial: Awaited<ReturnType<typeof getLineupForFixture>>;
  if (sequential) {
    counts = await groupByQuery();
    homeTeamStatsExisting = await prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.homeTeamId) });
    awayTeamStatsExisting = await prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.awayTeamId) });
    lineupCount = await prisma.fixtureLineup.count({ where: { fixtureId: fixture.id } });
    lineupByTeamInitial = await getLineupForFixture(fixture.id);
  } else {
    [counts, homeTeamStatsExisting, awayTeamStatsExisting, lineupCount, lineupByTeamInitial] =
      await Promise.all([
        groupByQuery(),
        prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.homeTeamId) }),
        prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.awayTeamId) }),
        prisma.fixtureLineup.count({ where: { fixtureId: fixture.id } }),
        getLineupForFixture(fixture.id),
      ]);
  }

  const MIN_PLAYERS_PER_TEAM = 11;
  const countByTeam = new Map(counts.map((c) => [c.teamId, c._count.id]));
  const teamStatsOnly = isTeamStatsOnlyLeague(fixtureWithLeagueId.leagueId);
  const teamsNeedingStats = teamStatsOnly
    ? []
    : teamIds.filter((tid) => (countByTeam.get(tid) ?? 0) < MIN_PLAYERS_PER_TEAM);

  /** When true, skip all API calls (fixture already warmed, or caller passed dbOnly). Reduces load from crawlers and repeat visits. */
  const bothTeamsHaveStats = homeTeamStatsExisting != null && awayTeamStatsExisting != null;
  /** Scottish Cup: we only warm the team(s) in our supported leagues (e.g. Aberdeen); the other (e.g. Dunfermline) is not. Treat as warmed when at least one side has stats so we serve from DB only. */
  const scottishCupPartiallyWarmed =
    fixtureWithLeagueId.leagueId === SCOTTISH_CUP_LEAGUE_ID &&
    (homeTeamStatsExisting != null || awayTeamStatsExisting != null);
  const effectiveDbOnly =
    dbOnly ||
    lineupCount > 0 ||
    bothTeamsHaveStats ||
    scottishCupPartiallyWarmed;

  if (DEBUG_FIXTURE) {
    const reason = dbOnly
      ? "caller passed dbOnly"
      : lineupCount > 0
        ? "lineupCount=" + lineupCount
        : bothTeamsHaveStats
          ? "both team stats exist"
          : scottishCupPartiallyWarmed
            ? "Scottish Cup: one team warmed (serve from DB)"
            : "not warmed";
    console.log("[fixture-debug] getFixtureStats effectiveDbOnly=" + effectiveDbOnly, {
      lineupCount,
      hasHomeTeamStats: homeTeamStatsExisting != null,
      hasAwayTeamStats: awayTeamStatsExisting != null,
      reason,
    });
    if (effectiveDbOnly) {
      console.log("[fixture-debug] getFixtureStats using DB only (no API calls)");
    }
  }

  if (!effectiveDbOnly && teamsNeedingStats.length > 0) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] getFixtureStats API branch: fetching player stats for teams", teamsNeedingStats);
    for (const teamId of teamsNeedingStats) {
      const team = teamId === fixture.homeTeamId ? fixture.homeTeam : fixture.awayTeam;
      if (team.apiId) {
        try {
          await fetchAndStorePlayerStats(
            teamId,
            team.apiId,
            API_SEASON,
            leagueKeyForTeamStats,
            leagueIdForTeamStats,
          );
        } catch (error) {
          console.error("[statsService] Failed to fetch stats for team");
        }
      }
      if (teamsNeedingStats.indexOf(teamId) < teamsNeedingStats.length - 1) {
        await sleep(FIXTURE_STATS_DELAY_MS);
      }
    }
  }

  // Ensure team season stats (and TeamFixtureCache) for form table and match page. Run for all leagues including League 1/2 so form table can include them.
  if (!effectiveDbOnly && leagueIdForTeamStats != null) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] getFixtureStats API branch: ensureTeamSeasonStats (corners/cards)");
    if (fixture.homeTeam.apiId && !homeTeamStatsExisting) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.homeTeamId,
        fixture.homeTeam.apiId,
        API_SEASON,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
        { cacheLeagueKey: canonicalLeagueKey },
      );
      await sleep(FIXTURE_STATS_DELAY_MS);
    }
    if (fixture.awayTeam.apiId && !awayTeamStatsExisting) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.awayTeamId,
        fixture.awayTeam.apiId,
        API_SEASON,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
        { cacheLeagueKey: canonicalLeagueKey },
      );
    }
  }

  // When we don't have a lineup and we're within the fetch window (e.g. 30 min before kickoff), fetch and store so the response includes lineup.
  // Run even when effectiveDbOnly (warmed): otherwise warmed fixtures never get lineups as kickoff approaches.
  const hadLineup = lineupCount > 0;
  if (!hadLineup && !teamStatsOnly) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] getFixtureStats: ensureLineupIfWithinWindow (within window = fetch)");
    await ensureLineupIfWithinWindow(
      fixture.id,
      fixture.date,
      fixture.apiId,
      fixture.homeTeamId,
      fixture.awayTeamId,
      fixture.homeTeam.apiId,
      fixture.awayTeam.apiId,
    );
  }

  // Single parallel read: player stats, team season rows, last-5 cache, and lineup (if needed). Keeps cached path fast.
  const playerStatsQuery = prisma.playerSeasonStats.findMany({
    where: {
      teamId: { in: teamIds },
      season: API_SEASON,
      ...leagueFilter,
    },
    include: {
      player: true,
      team: true,
    },
    orderBy: [{ teamId: "asc" }, { minutes: "desc" }],
  });
  const teamSeasonRowsQuery = prisma.teamSeasonStats.findMany({
    where: {
      teamId: { in: [fixture.homeTeamId, fixture.awayTeamId] },
      season: API_SEASON,
    },
  });
  const last5HomeQuery = db.teamFixtureCache.findMany({
    where: {
      teamId: fixture.homeTeamId,
      season: API_SEASON,
      league: canonicalLeagueKey,
      fixtureDate: { lte: now },
    },
    orderBy: { fixtureDate: "desc" },
    take: 5,
  });
  const last5AwayQuery = db.teamFixtureCache.findMany({
    where: {
      teamId: fixture.awayTeamId,
      season: API_SEASON,
      league: canonicalLeagueKey,
      fixtureDate: { lte: now },
    },
    orderBy: { fixtureDate: "desc" },
    take: 5,
  });
  /** Season stats: only past fixtures (exclude future cache rows). */
  const pastSeasonHomeQuery = db.teamFixtureCache.findMany({
    where: {
      teamId: fixture.homeTeamId,
      season: API_SEASON,
      league: canonicalLeagueKey,
      fixtureDate: { lt: now },
    },
    select: { goalsFor: true, goalsAgainst: true, corners: true, yellowCards: true, redCards: true, xg: true },
  });
  const pastSeasonAwayQuery = db.teamFixtureCache.findMany({
    where: {
      teamId: fixture.awayTeamId,
      season: API_SEASON,
      league: canonicalLeagueKey,
      fixtureDate: { lt: now },
    },
    select: { goalsFor: true, goalsAgainst: true, corners: true, yellowCards: true, redCards: true, xg: true },
  });
  const lineupQuery = hadLineup ? Promise.resolve(lineupByTeamInitial) : getLineupForFixture(fixture.id);

  let stats: Awaited<typeof playerStatsQuery>;
  let teamSeasonRows: Awaited<typeof teamSeasonRowsQuery>;
  let last5Home: Awaited<typeof last5HomeQuery>;
  let last5Away: Awaited<typeof last5AwayQuery>;
  let pastSeasonHome: Awaited<typeof pastSeasonHomeQuery>;
  let pastSeasonAway: Awaited<typeof pastSeasonAwayQuery>;
  let lineupByTeamRes: Awaited<typeof lineupQuery>;
  if (sequential) {
    // Slight parallelism even in sequential mode: heavy stats + team-season rows together, rest sequential.
    [stats, teamSeasonRows] = await Promise.all([playerStatsQuery, teamSeasonRowsQuery]);
    last5Home = await last5HomeQuery;
    last5Away = await last5AwayQuery;
    pastSeasonHome = await pastSeasonHomeQuery;
    pastSeasonAway = await pastSeasonAwayQuery;
    lineupByTeamRes = await lineupQuery;
  } else {
    [stats, teamSeasonRows, last5Home, last5Away, pastSeasonHome, pastSeasonAway, lineupByTeamRes] = await Promise.all([
      playerStatsQuery,
      teamSeasonRowsQuery,
      last5HomeQuery,
      last5AwayQuery,
      pastSeasonHomeQuery,
      pastSeasonAwayQuery,
      lineupQuery,
    ]);
  }

  // Backfill TeamFixtureCache when we have leagueId but last-5 is empty (e.g. first time or cache was never filled).
  if (!effectiveDbOnly && leagueIdForTeamStats != null && (last5Home.length === 0 || last5Away.length === 0)) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] getFixtureStats API branch: backfill last-5 TeamFixtureCache", { last5Home: last5Home.length, last5Away: last5Away.length });
    if (last5Home.length === 0 && fixture.homeTeam.apiId) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.homeTeamId,
        fixture.homeTeam.apiId,
        API_SEASON,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
        { cacheLeagueKey: canonicalLeagueKey },
      );
      last5Home = await db.teamFixtureCache.findMany({
        where: { teamId: fixture.homeTeamId, season: API_SEASON, league: canonicalLeagueKey, fixtureDate: { lte: now } },
        orderBy: { fixtureDate: "desc" },
        take: 5,
      });
      if (last5Away.length === 0 && fixture.awayTeam.apiId) await sleep(FIXTURE_STATS_DELAY_MS);
    }
    if (last5Away.length === 0 && fixture.awayTeam.apiId) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.awayTeamId,
        fixture.awayTeam.apiId,
        API_SEASON,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
        { cacheLeagueKey: canonicalLeagueKey },
      );
      last5Away = await db.teamFixtureCache.findMany({
        where: { teamId: fixture.awayTeamId, season: API_SEASON, league: canonicalLeagueKey, fixtureDate: { lte: now } },
        orderBy: { fixtureDate: "desc" },
        take: 5,
      });
    }
  }

  // One row per team: prefer the one we use for stats (e.g. Scottish Premiership for Scottish Cup), then fixture league.
  const pickBestForTeam = (teamId: number) => {
    const rows = teamSeasonRows.filter((r) => r.teamId === teamId);
    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0];
    const matchStatsLeague = rows.find(
      (r) =>
        (leagueIdForTeamStats != null && r.leagueId === leagueIdForTeamStats) ||
        (leagueKeyForTeamStats !== "Unknown" && r.league === leagueKeyForTeamStats)
    );
    if (matchStatsLeague) return matchStatsLeague;
    const fixtureLeagueId = fixtureWithLeagueId.leagueId ?? (fixture.league ? LEAGUE_ID_MAP[fixture.league] : null);
    const fixtureLeague = fixture.league ?? null;
    const matchFixtureLeague = rows.find(
      (r) =>
        (fixtureLeagueId != null && r.leagueId === fixtureLeagueId) ||
        (fixtureLeague != null && r.league === fixtureLeague)
    );
    return matchFixtureLeague ?? rows[0];
  };
  const homeRow = pickBestForTeam(fixture.homeTeamId);
  const awayRow = pickBestForTeam(fixture.awayTeamId);

  /** Build season row from cache (past fixtures only). Used so display never includes future cache rows. */
  type CacheSeasonRow = { minutesPlayed: number; goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number; xgFor: number | null };
  const fromPastCacheToSeasonRow = (
    rows: { goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number; xg: number | null }[]
  ): CacheSeasonRow | null => {
    if (rows.length === 0) return null;
    const xgVals = rows.filter((r) => r.xg != null).map((r) => r.xg!);
    return {
      minutesPlayed: rows.length * 90,
      goalsFor: rows.reduce((a, r) => a + r.goalsFor, 0),
      goalsAgainst: rows.reduce((a, r) => a + r.goalsAgainst, 0),
      corners: rows.reduce((a, r) => a + r.corners, 0),
      yellowCards: rows.reduce((a, r) => a + r.yellowCards, 0),
      redCards: rows.reduce((a, r) => a + r.redCards, 0),
      xgFor: xgVals.length > 0 ? xgVals.reduce((a, b) => a + b, 0) : null,
    };
  };
  const homeSeasonRow: CacheSeasonRow | (typeof homeRow) = fromPastCacheToSeasonRow(pastSeasonHome) ?? homeRow;
  const awaySeasonRow: CacheSeasonRow | (typeof awayRow) = fromPastCacheToSeasonRow(pastSeasonAway) ?? awayRow;

  const lineupByTeam = lineupByTeamRes;

  const byTeam = new Map<
    number,
    {
      teamId: number;
      teamName: string;
      teamShortName: string | null;
      players: FixtureStatsResponse["teams"][number]["players"];
    }
  >();

  for (const row of stats) {
    if (!byTeam.has(row.teamId)) {
      byTeam.set(row.teamId, {
        teamId: row.teamId,
        teamName: row.team.name,
        teamShortName: row.team.shortName,
        players: [],
      });
    }

    const group = byTeam.get(row.teamId)!;
    // If API stored 0 appearances but player has minutes, show at least 1
    const appearances =
      row.appearances > 0 ? row.appearances : row.minutes > 0 ? 1 : 0;
    const teamLineup = lineupByTeam.get(row.teamId);
    const lineupStatus = teamLineup?.get(row.playerId) ?? null;
    group.players.push({
      playerId: row.playerId,
      name: row.player.name,
      position: row.player.position ?? null,
      shirtNumber: row.player.shirtNumber ?? null,
      appearances,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      fouls: row.fouls,
      shots: row.shots,
      shotsOnTarget: row.shotsOnTarget,
      tackles: (row as { tackles?: number }).tackles ?? 0,
      yellowCards: row.yellowCards,
      redCards: row.redCards,
      lineupStatus,
    });
  }

  // Include players who are in the lineup but have no season stats (so Starting XI can show 11).
  const lineupOnlyPlayerIds: number[] = [];
  for (const [_teamId, group] of byTeam) {
    const existingIds = new Set(group.players.map((p) => p.playerId));
    const teamLineup = lineupByTeam.get(_teamId);
    if (!teamLineup) continue;
    for (const playerId of teamLineup.keys()) {
      if (!existingIds.has(playerId)) lineupOnlyPlayerIds.push(playerId);
    }
  }
  if (lineupOnlyPlayerIds.length > 0) {
    const lineupOnlyPlayers = await prisma.player.findMany({
      where: { id: { in: lineupOnlyPlayerIds } },
      select: { id: true, name: true, position: true, shirtNumber: true },
    });
    const playerById = new Map(lineupOnlyPlayers.map((p) => [p.id, p]));
    for (const [teamId, group] of byTeam) {
      const teamLineup = lineupByTeam.get(teamId);
      if (!teamLineup) continue;
      const existingIds = new Set(group.players.map((p) => p.playerId));
      for (const [playerId, status] of teamLineup) {
        if (existingIds.has(playerId)) continue;
        const p = playerById.get(playerId);
        if (!p) continue;
        group.players.push({
          playerId: p.id,
          name: p.name,
          position: p.position ?? null,
          shirtNumber: p.shirtNumber ?? null,
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          fouls: 0,
          shots: 0,
          shotsOnTarget: 0,
          tackles: 0,
          yellowCards: 0,
          redCards: 0,
          lineupStatus: status,
        });
        existingIds.add(playerId);
      }
    }
  }

  const fixtureSummary: FixtureSummary = {
    id: fixture.id,
    date: fixture.date,
    status: fixture.status,
    league: fixture.league,
    leagueId: fixtureWithLeagueId.leagueId ?? null,
    season: API_SEASON,
    homeTeam: {
      id: fixture.homeTeam.id,
      name: fixture.homeTeam.name,
      shortName: fixture.homeTeam.shortName,
      crestUrl: (fixture.homeTeam as { crestUrl?: string | null }).crestUrl ?? null,
    },
    awayTeam: {
      id: fixture.awayTeam.id,
      name: fixture.awayTeam.name,
      shortName: fixture.awayTeam.shortName,
      crestUrl: (fixture.awayTeam as { crestUrl?: string | null }).crestUrl ?? null,
    },
  };

  let teams = Array.from(byTeam.values());

  // With free API plan the /players endpoint often returns empty; we can show mock data for UI preview.
  // Set USE_MOCK_PLAYERS_FALLBACK=false (or unset) after upgrading to use real player data only.
  const useMockFallback = process.env.USE_MOCK_PLAYERS_FALLBACK !== "false";

  const mockPlayer = (
    playerId: number,
    name: string,
    position: string,
    shirtNumber: number,
    rest: Omit<FixtureStatsResponse["teams"][number]["players"][number], "playerId" | "name" | "position" | "shirtNumber" | "lineupStatus">,
    lineupStatus: "starting" | "substitute" | null = null,
  ) => ({ playerId, name, position, shirtNumber, ...rest, lineupStatus });

  const mockPlayersForTeam = (
    teamId: number,
    teamName: string,
    teamShortName: string | null,
    idOffset: number
  ): FixtureStatsResponse["teams"][number] => ({
    teamId,
    teamName,
    teamShortName,
    players: [
      mockPlayer(idOffset + 1, "Mock Player One", "Attacker", 9, { appearances: 12, minutes: 980, goals: 8, assists: 3, fouls: 4, shots: 42, shotsOnTarget: 22, tackles: 2, yellowCards: 1, redCards: 0 }),
      mockPlayer(idOffset + 2, "Mock Player Two", "Midfielder", 10, { appearances: 14, minutes: 1120, goals: 2, assists: 7, fouls: 2, shots: 18, shotsOnTarget: 9, tackles: 15, yellowCards: 2, redCards: 0 }),
      mockPlayer(idOffset + 3, "Mock Player Three", "Defender", 4, { appearances: 15, minutes: 1350, goals: 0, assists: 1, fouls: 12, shots: 5, shotsOnTarget: 2, tackles: 28, yellowCards: 3, redCards: 0 }),
      mockPlayer(idOffset + 4, "Mock Player Four", "Goalkeeper", 1, { appearances: 16, minutes: 1440, goals: 0, assists: 0, fouls: 0, shots: 0, shotsOnTarget: 0, tackles: 0, yellowCards: 0, redCards: 0 }),
      mockPlayer(idOffset + 5, "Mock Player Five", "Midfielder", 8, { appearances: 11, minutes: 720, goals: 1, assists: 4, fouls: 3, shots: 12, shotsOnTarget: 6, tackles: 8, yellowCards: 1, redCards: 0 }),
    ],
  });

  const homeTeamData = teams.find((t) => t.teamId === fixture.homeTeamId);
  const awayTeamData = teams.find((t) => t.teamId === fixture.awayTeamId);

  if (teamStatsOnly) {
    teams = [
      { teamId: fixture.homeTeamId, teamName: fixture.homeTeam.name, teamShortName: fixture.homeTeam.shortName, players: [] as FixtureStatsResponse["teams"][number]["players"] },
      { teamId: fixture.awayTeamId, teamName: fixture.awayTeam.name, teamShortName: fixture.awayTeam.shortName, players: [] as FixtureStatsResponse["teams"][number]["players"] },
    ];
  } else if (useMockFallback) {
    if (!homeTeamData?.players.length && !awayTeamData?.players.length) {
      teams = [
        mockPlayersForTeam(fixture.homeTeamId, fixture.homeTeam.name, fixture.homeTeam.shortName, 9000),
        mockPlayersForTeam(fixture.awayTeamId, fixture.awayTeam.name, fixture.awayTeam.shortName, 9100),
      ];
    } else {
      let offset = 9200;
      teams = [
        homeTeamData && homeTeamData.players.length > 0
          ? homeTeamData
          : mockPlayersForTeam(fixture.homeTeamId, fixture.homeTeam.name, fixture.homeTeam.shortName, (offset += 100)),
        awayTeamData && awayTeamData.players.length > 0
          ? awayTeamData
          : mockPlayersForTeam(fixture.awayTeamId, fixture.awayTeam.name, fixture.awayTeam.shortName, (offset += 100)),
      ];
    }
  } else {
    // Real data only: show only teams that have players from the API (no mock fallback)
    teams = [
      homeTeamData ?? { teamId: fixture.homeTeamId, teamName: fixture.homeTeam.name, teamShortName: fixture.homeTeam.shortName, players: [] as FixtureStatsResponse["teams"][number]["players"] },
      awayTeamData ?? { teamId: fixture.awayTeamId, teamName: fixture.awayTeam.name, teamShortName: fixture.awayTeam.shortName, players: [] as FixtureStatsResponse["teams"][number]["players"] },
    ];
  }

  /** Season totals (this season only) -> average per match. Uses past-only cache when available so future fixtures are never included. */
  function rowToPerMatch(row: typeof homeSeasonRow): TeamStatsPer90 {
    if (!row) {
      return { xgPer90: null, goalsPer90: 0, concededPer90: 0, cornersPer90: 0, cardsPer90: 0 };
    }
    const matches = row.minutesPlayed > 0 ? row.minutesPlayed / 90 : 0;
    if (matches <= 0) {
      return { xgPer90: null, goalsPer90: 0, concededPer90: 0, cornersPer90: 0, cardsPer90: 0 };
    }
    return {
      xgPer90: row.xgFor != null ? row.xgFor / matches : null,
      goalsPer90: row.goalsFor / matches,
      concededPer90: row.goalsAgainst / matches,
      cornersPer90: row.corners / matches,
      cardsPer90: (row.yellowCards + row.redCards) / matches,
    };
  }

  const homePerMatch = rowToPerMatch(homeSeasonRow);
  const awayPerMatch = rowToPerMatch(awaySeasonRow);
  const hasMeaningfulStats = (t: TeamStatsPer90) =>
    t.goalsPer90 > 0 || t.concededPer90 > 0 || t.cornersPer90 > 0 || t.cardsPer90 > 0 || t.xgPer90 != null;
  // Don't show team stats when both sides are all zeros (e.g. API plan limit returned no fixture/statistics data).
  const teamStats: FixtureStatsResponse["teamStats"] =
    (homeSeasonRow || awaySeasonRow) && (hasMeaningfulStats(homePerMatch) || hasMeaningfulStats(awayPerMatch))
      ? { home: homePerMatch, away: awayPerMatch }
      : undefined;

  const teamStatsTotals: FixtureStatsResponse["teamStatsTotals"] =
    teamStats && homeSeasonRow && awaySeasonRow
      ? {
          home: {
            goalsFor: homeSeasonRow.goalsFor,
            goalsAgainst: homeSeasonRow.goalsAgainst,
            matches: homeSeasonRow.minutesPlayed > 0 ? homeSeasonRow.minutesPlayed / 90 : 0,
          },
          away: {
            goalsFor: awaySeasonRow.goalsFor,
            goalsAgainst: awaySeasonRow.goalsAgainst,
            matches: awaySeasonRow.minutesPlayed > 0 ? awaySeasonRow.minutesPlayed / 90 : 0,
          },
        }
      : undefined;

  function last5ToPerMatch(rows: { goalsFor: number; goalsAgainst: number; xg: number | null; corners: number; yellowCards: number; redCards: number }[]): TeamStatsPer90 {
    if (rows.length === 0) return { xgPer90: null, goalsPer90: 0, concededPer90: 0, cornersPer90: 0, cardsPer90: 0 };
    const n = rows.length;
    const goalsFor = rows.reduce((a, r) => a + r.goalsFor, 0) / n;
    const goalsAgainst = rows.reduce((a, r) => a + r.goalsAgainst, 0) / n;
    const corners = rows.reduce((a, r) => a + r.corners, 0) / n;
    const cards = rows.reduce((a, r) => a + r.yellowCards + r.redCards, 0) / n;
    const xgSum = rows.reduce((a, r) => a + (r.xg ?? 0), 0);
    const xgCount = rows.filter((r) => r.xg != null).length;
    return {
      xgPer90: xgCount > 0 ? xgSum / xgCount : null,
      goalsPer90: goalsFor,
      concededPer90: goalsAgainst,
      cornersPer90: corners,
      cardsPer90: cards,
    };
  }

  const teamStatsLast5: FixtureStatsResponse["teamStatsLast5"] =
    last5Home.length > 0 || last5Away.length > 0
      ? { home: last5ToPerMatch(last5Home), away: last5ToPerMatch(last5Away) }
      : undefined;

  const last5Goals: FixtureStatsResponse["last5Goals"] =
    last5Home.length > 0 || last5Away.length > 0
      ? {
          home: last5Home.map((m: { goalsFor: number; goalsAgainst: number }) => ({ goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst })),
          away: last5Away.map((m: { goalsFor: number; goalsAgainst: number }) => ({ goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst })),
        }
      : undefined;

  const hasLineup = lineupByTeam.size > 0;

  const teamStatsUnavailableReason =
    (homeSeasonRow || awaySeasonRow) && !teamStats
      ? "Season stats are not available for this competition yet."
      : undefined;

  return {
    fixture: fixtureSummary,
    hasLineup,
    teams,
    teamStats,
    teamStatsLast5,
    teamStatsTotals,
    last5Goals,
    teamStatsUnavailableReason,
  };
}

