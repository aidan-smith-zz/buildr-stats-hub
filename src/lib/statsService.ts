import { prisma } from "@/lib/prisma";
import {
  fetchPlayerSeasonStatsByTeam,
  getPlayerExternalId,
  getTeamExternalId,
  type RawPlayerSeasonStats,
} from "@/lib/footballApi";

export type FixtureSummary = {
  id: number;
  date: Date;
  status: string;
  league: string | null;
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
  console.log(`[statsService] Fetching player stats for team ${teamId} (apiId: ${teamApiId}), league: ${league} (no season filter - free plan limitation)`);
  
  try {
    const rawStats = await fetchPlayerSeasonStatsByTeam({
      teamExternalId: teamApiId,
      // Don't pass season - free plan doesn't support it
      leagueId: leagueId,
    });

    console.log(`[statsService] Received ${rawStats.length} player stats from API for team ${teamId}`);

    // Process and store each player's stats
    for (const raw of rawStats) {
      try {
        // Upsert player first
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

        // Upsert player season stats
        // Use season from fixture (not from API response) since we're not filtering by season
        const leagueName = raw.league || league || "Unknown";
        const seasonStr = String(season); // Use season from fixture parameter
        
        // Check if stats already exist
        const existing = await prisma.playerSeasonStats.findFirst({
          where: {
            playerId: player.id,
            teamId: teamId,
            season: seasonStr,
            league: leagueName,
          },
        });

        if (existing) {
          // Update existing stats
          await prisma.playerSeasonStats.update({
            where: { id: existing.id },
            data: {
              appearances: raw.stats.appearances ?? 0,
              minutes: raw.stats.minutes ?? 0,
              goals: raw.stats.goals ?? 0,
              assists: raw.stats.assists ?? 0,
              fouls: raw.stats.fouls ?? 0,
              shots: raw.stats.shots ?? 0,
              shotsOnTarget: raw.stats.shotsOnTarget ?? 0,
              yellowCards: raw.stats.yellowCards ?? 0,
              redCards: raw.stats.redCards ?? 0,
            },
          });
        } else {
          // Create new stats
          await prisma.playerSeasonStats.create({
            data: {
              playerId: player.id,
              teamId: teamId,
              season: seasonStr,
              league: leagueName,
              appearances: raw.stats.appearances ?? 0,
              minutes: raw.stats.minutes ?? 0,
              goals: raw.stats.goals ?? 0,
              assists: raw.stats.assists ?? 0,
              fouls: raw.stats.fouls ?? 0,
              shots: raw.stats.shots ?? 0,
              shotsOnTarget: raw.stats.shotsOnTarget ?? 0,
              yellowCards: raw.stats.yellowCards ?? 0,
              redCards: raw.stats.redCards ?? 0,
            },
          });
        }
      } catch (error) {
        console.error(`[statsService] Error storing player stats:`, error);
        // Continue with next player
      }
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

  const teamIds = [fixture.homeTeamId, fixture.awayTeamId];
  const leagueFilter = fixture.league ? { league: fixture.league } : {};

  // Check if player stats exist for both teams
  const existingStats = await prisma.playerSeasonStats.findMany({
    where: {
      teamId: { in: teamIds },
      season: fixture.season,
      ...leagueFilter,
    },
    select: { teamId: true },
    distinct: ["teamId"],
  });

  const teamsWithStats = new Set(existingStats.map(s => s.teamId));
  const teamsNeedingStats = teamIds.filter(id => !teamsWithStats.has(id));

  // Fetch and store stats for teams that don't have them yet
  if (teamsNeedingStats.length > 0) {
    console.log(`[statsService] Player stats missing for teams: ${teamsNeedingStats.join(", ")}. Fetching from API...`);
    
    // Try to get league ID from the league name (common leagues)
    // For La Liga, the league ID is typically 140
    const leagueIdMap: Record<string, number> = {
      "La Liga": 140,
      "Premier League": 39,
      "Serie A": 135,
      "Bundesliga": 78,
      "Ligue 1": 61,
    };
    const leagueId = fixture.league ? leagueIdMap[fixture.league] : undefined;

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
    orderBy: [{ teamId: "asc" }, { minutes: "desc" }], // Removed fouls sorting - requires upgraded API plan
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
    group.players.push({
      playerId: row.playerId,
      name: row.player.name,
      position: row.player.position ?? null,
      shirtNumber: row.player.shirtNumber ?? null,
      appearances: row.appearances,
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

  // If any team has no players, use mocked data so the UI can be previewed
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

  return {
    fixture: fixtureSummary,
    teams,
  };
}

