import { prisma } from "@/lib/prisma";
import {
  fetchFixtureStatistics,
  fetchPlayerSeasonStatsByTeam,
  fetchTeamFixturesWithGoals,
  getPlayerExternalId,
  type RawPlayerSeasonStats,
} from "@/lib/footballApi";
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
};

const MAX_FIXTURES_PER_SEASON = 38;

/** Delay between fixture-statistics API calls. Lower = faster warmup but higher risk of rate limits. Set FOOTBALL_API_DELAY_MS to 2000+ if you hit limits. */
const FIXTURE_STATS_DELAY_MS = Number(process.env.FOOTBALL_API_DELAY_MS) || 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Max fixture-statistics API calls per invocation so one request stays under ~60s (e.g. 20 * 1s delay + response time). */
const TEAM_STATS_CHUNK_SIZE = 20;

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
  options?: { maxApiCallsPerInvocation?: number },
): Promise<EnsureTeamSeasonStatsResult> {
  const maxCalls = options?.maxApiCallsPerInvocation;

  const resource = `teamSeasonCorners:${teamId}:${season}:${leagueKey}`;

  const { fixtureIds, goalsFor, goalsAgainst, played, fixtures: fixturesMeta } = await fetchTeamFixturesWithGoals(teamApiId, season, leagueId);
  const minutesPlayed = played * 90;

  const limit = Math.min(fixtureIds.length, MAX_FIXTURES_PER_SEASON);
  const fixtureIdsToProcess = fixtureIds.slice(0, limit);

  type CachedFixtureStats = { corners: number; yellowCards: number; redCards: number; xg: number | null };
  const existingCache = await db.teamFixtureCache.findMany({
    where: {
      teamId,
      season,
      league: leagueKey,
      apiFixtureId: { in: fixtureIdsToProcess.map((id) => String(id)) },
    },
    select: { apiFixtureId: true, corners: true, yellowCards: true, redCards: true, xg: true },
  });
  const cacheByApiFixtureId = new Map<string, CachedFixtureStats>(
    existingCache.map((r: CachedFixtureStats & { apiFixtureId: string }) => [r.apiFixtureId, r])
  );

  let apiCallsThisInvocation = 0;

  for (let i = 0; i < limit; i++) {
    if (maxCalls != null && apiCallsThisInvocation >= maxCalls) {
      return { done: false };
    }
    const apiFixtureId = String(fixtureIds[i]);
    const meta = fixturesMeta[i];
    const cached = cacheByApiFixtureId.get(apiFixtureId);

    if (cached) {
      continue;
    }

    if (apiCallsThisInvocation > 0) await sleep(FIXTURE_STATS_DELAY_MS);
    apiCallsThisInvocation++;
    const stat = await fetchFixtureStatistics(fixtureIds[i], teamApiId);
    if (stat && meta) {
      await db.teamFixtureCache.upsert({
        where: {
          teamId_season_league_apiFixtureId: {
            teamId,
            season,
            league: leagueKey,
            apiFixtureId,
          },
        },
        create: {
          teamId,
          season,
          league: leagueKey,
          apiFixtureId,
          fixtureDate: meta.date,
          goalsFor: meta.goalsFor,
          goalsAgainst: meta.goalsAgainst,
          xg: stat.xg,
          corners: stat.corners,
          yellowCards: stat.yellowCards,
          redCards: stat.redCards,
        },
        update: {
          fixtureDate: meta.date,
          goalsFor: meta.goalsFor,
          goalsAgainst: meta.goalsAgainst,
          xg: stat.xg,
          corners: stat.corners,
          yellowCards: stat.yellowCards,
          redCards: stat.redCards,
        },
      });
    }
  }

  // All fixtures processed (from cache or API). Aggregate from DB and write season row.
  const apiFixtureIds = fixtureIdsToProcess.map((id) => String(id));
  const cacheRows = await db.teamFixtureCache.findMany({
    where: {
      teamId,
      season,
      league: leagueKey,
      apiFixtureId: { in: apiFixtureIds },
    },
    select: { corners: true, yellowCards: true, redCards: true, xg: true },
  });
  let corners = 0;
  let yellowCards = 0;
  let redCards = 0;
  let xgSum = 0;
  let xgCount = 0;
  for (const r of cacheRows) {
    corners += r.corners;
    yellowCards += r.yellowCards;
    redCards += r.redCards;
    if (r.xg != null) {
      xgSum += r.xg;
      xgCount++;
    }
  }
  const xgFor = xgCount > 0 ? xgSum : null;

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
      goalsFor,
      goalsAgainst,
      xgFor,
      corners,
      yellowCards,
      redCards,
    },
    update: {
      minutesPlayed,
      goalsFor,
      goalsAgainst,
      xgFor,
      corners,
      yellowCards,
      redCards,
    },
  });

  await prisma.apiFetchLog.create({
    data: { resource, success: true },
  });
  return { done: true };
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
};

export type WarmPartResult =
  | { ok: true; teamId: number }
  | { ok: true; done: boolean }
  | { ok: true };

/**
 * Warm one part of fixture stats (stays under 60s for Vercel Hobby).
 * - part=home|away: player season stats for that team.
 * - part=teamstats-home|teamstats-away: team season stats (chunked); returns { done } so caller can loop until done.
 * - part=lineup: ensure lineup if within window.
 */
export async function warmFixturePart(
  fixtureId: number,
  part: "home" | "away" | "teamstats-home" | "teamstats-away" | "lineup",
): Promise<WarmPartResult> {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!fixture) throw new Error("Fixture not found");
  const fixtureWithLeague = fixture as FixtureWithLeagueId;
  const leagueId =
    fixtureWithLeague.leagueId ??
    (fixture.league ? LEAGUE_ID_MAP[fixture.league] : undefined);
  const leagueKey = fixture.league ?? "Unknown";

  if (part === "teamstats-home" || part === "teamstats-away") {
    const team = part === "teamstats-home" ? fixture.homeTeam : fixture.awayTeam;
    const teamId = part === "teamstats-home" ? fixture.homeTeamId : fixture.awayTeamId;
    if (!team.apiId || leagueId == null) {
      return { ok: true, done: true };
    }
    const result = await ensureTeamSeasonStatsCornersAndCards(
      teamId,
      team.apiId,
      fixture.season,
      leagueKey,
      leagueId,
      { maxApiCallsPerInvocation: TEAM_STATS_CHUNK_SIZE },
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
      fixture.season,
      fixture.league,
      leagueId,
    );
  }
  return { ok: true, teamId };
}

export async function getFixtureStats(fixtureId: number): Promise<FixtureStatsResponse | null> {
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

  const fixtureWithLeagueId = fixture as FixtureWithLeagueId;
  const teamIds = [fixture.homeTeamId, fixture.awayTeamId];
  const leagueFilter = fixture.league ? { league: fixture.league } : {};
  const leagueKeyForTeamStats = fixture.league ?? "Unknown";
  const leagueIdForTeamStats =
    fixtureWithLeagueId.leagueId ??
    (fixture.league ? LEAGUE_ID_MAP[fixture.league] : undefined);

  const teamStatsWhere = (teamId: number) => ({
    teamId,
    season: fixture.season,
    ...(leagueIdForTeamStats != null
      ? { OR: [{ league: leagueKeyForTeamStats }, { leagueId: leagueIdForTeamStats }] }
      : { league: leagueKeyForTeamStats }),
  });

  const leagueFilterForTeamStats =
    fixtureWithLeagueId.leagueId != null
      ? { leagueId: fixtureWithLeagueId.leagueId }
      : fixture.league
        ? { league: fixture.league }
        : {};
  const leagueKeyForCache = fixture.league ?? "Unknown";

  // Run all independent DB checks in parallel to cut round-trips (warm path is much faster).
  const [counts, homeTeamStatsExisting, awayTeamStatsExisting, lineupCount, lineupByTeamInitial] =
    await Promise.all([
      prisma.playerSeasonStats.groupBy({
        by: ["teamId"],
        where: {
          teamId: { in: teamIds },
          season: fixture.season,
          ...leagueFilter,
        },
        _count: { id: true },
      }),
      prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.homeTeamId) }),
      prisma.teamSeasonStats.findFirst({ where: teamStatsWhere(fixture.awayTeamId) }),
      prisma.fixtureLineup.count({ where: { fixtureId: fixture.id } }),
      getLineupForFixture(fixture.id),
    ]);

  const MIN_PLAYERS_PER_TEAM = 11;
  const countByTeam = new Map(counts.map((c) => [c.teamId, c._count.id]));
  const teamsNeedingStats = teamIds.filter((tid) => (countByTeam.get(tid) ?? 0) < MIN_PLAYERS_PER_TEAM);

  if (teamsNeedingStats.length > 0) {
    const leagueId =
      fixtureWithLeagueId.leagueId ??
      (fixture.league ? LEAGUE_ID_MAP[fixture.league] : undefined);

    for (const teamId of teamsNeedingStats) {
      const team = teamId === fixture.homeTeamId ? fixture.homeTeam : fixture.awayTeam;
      if (team.apiId) {
        try {
          await fetchAndStorePlayerStats(
            teamId,
            team.apiId,
            fixture.season,
            fixture.league,
            leagueId,
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

  // Only ensure team season stats for teams that don't already have them (saves 2 queries per team when cached).
  if (leagueIdForTeamStats != null) {
    if (fixture.homeTeam.apiId && !homeTeamStatsExisting) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.homeTeamId,
        fixture.homeTeam.apiId,
        fixture.season,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
      );
      await sleep(FIXTURE_STATS_DELAY_MS);
    }
    if (fixture.awayTeam.apiId && !awayTeamStatsExisting) {
      await ensureTeamSeasonStatsCornersAndCards(
        fixture.awayTeamId,
        fixture.awayTeam.apiId,
        fixture.season,
        leagueKeyForTeamStats,
        leagueIdForTeamStats,
      );
    }
  }

  // Only ensure lineup when we don't have one; re-read lineup only if we might have just written it.
  const hadLineup = lineupCount > 0;
  if (!hadLineup) {
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
      season: fixture.season,
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
      season: fixture.season,
      ...leagueFilterForTeamStats,
    },
  });
  const last5HomeQuery = db.teamFixtureCache.findMany({
    where: { teamId: fixture.homeTeamId, season: fixture.season, league: leagueKeyForCache },
    orderBy: { fixtureDate: "desc" },
    take: 5,
  });
  const last5AwayQuery = db.teamFixtureCache.findMany({
    where: { teamId: fixture.awayTeamId, season: fixture.season, league: leagueKeyForCache },
    orderBy: { fixtureDate: "desc" },
    take: 5,
  });
  const lineupQuery = hadLineup ? Promise.resolve(lineupByTeamInitial) : getLineupForFixture(fixture.id);

  const [stats, teamSeasonRows, last5Home, last5Away, lineupByTeamRes] = await Promise.all([
    playerStatsQuery,
    teamSeasonRowsQuery,
    last5HomeQuery,
    last5AwayQuery,
    lineupQuery,
  ]);
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

  const fixtureSummary: FixtureSummary = {
    id: fixture.id,
    date: fixture.date,
    status: fixture.status,
    league: fixture.league,
    leagueId: fixtureWithLeagueId.leagueId ?? null,
    season: fixture.season,
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

  if (useMockFallback) {
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

  const homeRow = teamSeasonRows.find((r: { teamId: number }) => r.teamId === fixture.homeTeamId);
  const awayRow = teamSeasonRows.find((r: { teamId: number }) => r.teamId === fixture.awayTeamId);

  /** Season totals (this season only) -> average per match. */
  function rowToPerMatch(row: typeof homeRow): TeamStatsPer90 {
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

  const teamStats: FixtureStatsResponse["teamStats"] =
    homeRow || awayRow
      ? {
          home: rowToPerMatch(homeRow),
          away: rowToPerMatch(awayRow),
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

  const hasLineup = lineupByTeam.size > 0;

  return {
    fixture: fixtureSummary,
    hasLineup,
    teams,
    teamStats,
    teamStatsLast5,
  };
}

