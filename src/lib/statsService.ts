import { prisma } from "@/lib/prisma";
import {
  fetchPlayerSeasonStatsByTeam,
  getPlayerExternalId,
  type RawPlayerSeasonStats,
} from "@/lib/footballApi";

/** Fixture including leagueId (schema has it; Prisma payload may omit until client is regenerated) */
type FixtureWithLeagueId = { leagueId?: number | null; league?: string | null };

export type FixtureSummary = {
  id: number;
  date: Date;
  status: string;
  league: string | null;
  leagueId: number | null;
  season: string;
  homeTeam: { id: number; name: string; shortName: string | null };
  awayTeam: { id: number; name: string; shortName: string | null };
};

export type FixtureStatsResponse = {
  fixture: FixtureSummary;
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
      yellowCards: number;
      redCards: number;
    }[];
  }[];
};

/**
 * Fetch and store player season stats for a team from the API
 */
async function fetchAndStorePlayerStats(
  teamId: number,
  teamApiId: string,
  season: string,
  league: string | null,
  leagueId?: number,
): Promise<void> {
  console.log(`[statsService] Fetching player stats for team ${teamId} (apiId: ${teamApiId}), season: ${season}, league: ${league}`);
  
  try {
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
        (s.yellowCards ?? 0) > 0 ||
        (s.redCards ?? 0) > 0
      );
    });
    if (before > rawStats.length) {
      console.log(`[statsService] Skipped ${before - rawStats.length} players with zero stats for team ${teamId}`);
    }
    console.log(`[statsService] Storing ${rawStats.length} player stats for team ${teamId}`);

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
            console.error(`[statsService] Error storing player stats:`, err);
          })
        )
      );
    }

    console.log(`[statsService] Successfully stored player stats for team ${teamId}`);
  } catch (error) {
    console.error(`[statsService] Error fetching player stats for team ${teamId}:`, error);
    throw error;
  }
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

  // Require at least this many players per team; otherwise refetch (fixes partial data from pagination or errors)
  const MIN_PLAYERS_PER_TEAM = 11;
  const counts = await prisma.playerSeasonStats.groupBy({
    by: ["teamId"],
    where: {
      teamId: { in: teamIds },
      season: fixture.season,
      ...leagueFilter,
    },
    _count: { id: true },
  });
  const countByTeam = new Map(counts.map((c) => [c.teamId, c._count.id]));
  const teamsNeedingStats = teamIds.filter((tid) => (countByTeam.get(tid) ?? 0) < MIN_PLAYERS_PER_TEAM);

  if (teamsNeedingStats.length > 0) {
    console.log(
      `[statsService] Refetching player stats for teams: ${teamsNeedingStats.join(", ")} (counts: ${teamIds.map((t) => countByTeam.get(t) ?? 0).join(", ")})`
    );
    
    // Prefer fixture.leagueId from DB (set when we store fixtures). Fallback: league name -> id for API calls.
    const leagueIdMap: Record<string, number> = {
      "Premier League": 39,
      "UEFA Champions League": 2,
      "UEFA Europa League": 3,
      "Champions League": 2,
      "Europa League": 3,
      "Scottish Championship": 179,
      "Scottish Premiership": 179,
      "FA Cup": 45,
    };
    const leagueId =
      fixtureWithLeagueId.leagueId ??
      (fixture.league ? leagueIdMap[fixture.league] : undefined);

    // Fetch stats for each team that needs them
    await Promise.allSettled(
      teamsNeedingStats.map(async (teamId) => {
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
            console.error(`[statsService] Failed to fetch stats for team ${teamId}:`, error);
            // Continue even if one team fails
          }
        }
      })
    );
  }

  // Now fetch the stats (either existing or newly stored)
  const stats = await prisma.playerSeasonStats.findMany({
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
      yellowCards: row.yellowCards,
      redCards: row.redCards,
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
    },
    awayTeam: {
      id: fixture.awayTeam.id,
      name: fixture.awayTeam.name,
      shortName: fixture.awayTeam.shortName,
    },
  };

  let teams = Array.from(byTeam.values());

  // With free API plan the /players endpoint often returns empty; we can show mock data for UI preview.
  // Set USE_MOCK_PLAYERS_FALLBACK=false (or unset) after upgrading to use real player data only.
  const useMockFallback = process.env.USE_MOCK_PLAYERS_FALLBACK !== "false";

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
      { playerId: idOffset + 1, name: "Mock Player One", position: "Attacker", shirtNumber: 9, appearances: 12, minutes: 980, goals: 8, assists: 3, fouls: 4, shots: 42, shotsOnTarget: 22, yellowCards: 1, redCards: 0 },
      { playerId: idOffset + 2, name: "Mock Player Two", position: "Midfielder", shirtNumber: 10, appearances: 14, minutes: 1120, goals: 2, assists: 7, fouls: 2, shots: 18, shotsOnTarget: 9, yellowCards: 2, redCards: 0 },
      { playerId: idOffset + 3, name: "Mock Player Three", position: "Defender", shirtNumber: 4, appearances: 15, minutes: 1350, goals: 0, assists: 1, fouls: 12, shots: 5, shotsOnTarget: 2, yellowCards: 3, redCards: 0 },
      { playerId: idOffset + 4, name: "Mock Player Four", position: "Goalkeeper", shirtNumber: 1, appearances: 16, minutes: 1440, goals: 0, assists: 0, fouls: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0 },
      { playerId: idOffset + 5, name: "Mock Player Five", position: "Midfielder", shirtNumber: 8, appearances: 11, minutes: 720, goals: 1, assists: 4, fouls: 3, shots: 12, shotsOnTarget: 6, yellowCards: 1, redCards: 0 },
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
      homeTeamData ?? { teamId: fixture.homeTeamId, teamName: fixture.homeTeam.name, teamShortName: fixture.homeTeam.shortName, players: [] },
      awayTeamData ?? { teamId: fixture.awayTeamId, teamName: fixture.awayTeam.name, teamShortName: fixture.awayTeam.shortName, players: [] },
    ];
  }

  return {
    fixture: fixtureSummary,
    teams,
  };
}

