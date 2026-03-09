import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";

// Top leagues: English Premier League (39), Championship (40), Scottish Premiership (179)
const TOP_LEAGUE_IDS = [39, 40, 179] as const;
const TOP_LEAGUE_KEYS = TOP_LEAGUE_IDS.map((id) => LEAGUE_DISPLAY_NAMES[id]);

type TeamSeasonRow = {
  teamId: number;
  season: string;
  league: string;
  minutesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  yellowCards: number;
  redCards: number;
};

export type TeamPagePer90 = {
  goalsPer90: number;
  concededPer90: number;
  cornersPer90: number;
  cardsPer90: number;
};

export type TeamPageFixtureSummary = {
  id: number;
  date: string;
  league: string | null;
  opponentName: string;
  isHome: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  statusShort: string | null;
};

export type TeamPagePlayerSummary = {
  id: number;
  name: string;
  position: string | null;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  yellowCards: number;
  redCards: number;
};

export type TeamPageData = {
  teamId: number;
  teamApiId: string | null;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  leagueName: string;
  season: string;
  per90: TeamPagePer90 | null;
  recentFixtures: TeamPageFixtureSummary[];
  keyPlayers: TeamPagePlayerSummary[];
};

function rowToPer90(row: TeamSeasonRow | null): TeamPagePer90 | null {
  if (!row) return null;
  const minutes = row.minutesPlayed ?? 0;
  const matches = minutes > 0 ? minutes / 90 : 0;
  if (matches <= 0) {
    return {
      goalsPer90: 0,
      concededPer90: 0,
      cornersPer90: 0,
      cardsPer90: 0,
    };
  }
  return {
    goalsPer90: row.goalsFor / matches,
    concededPer90: row.goalsAgainst / matches,
    cornersPer90: row.corners / matches,
    cardsPer90: (row.yellowCards + row.redCards) / matches,
  };
}

async function loadTeamPageData(teamId: number): Promise<TeamPageData | null> {
  if (!Number.isFinite(teamId) || teamId <= 0) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      apiId: true,
      name: true,
      shortName: true,
      crestUrl: true,
    },
  });
  if (!team) return null;

  // Find this team's season stats for the top leagues only.
  const seasonRows = await prisma.teamSeasonStats.findMany({
    where: {
      teamId,
      season: API_SEASON,
      league: { in: TOP_LEAGUE_KEYS },
    },
  });

  if (seasonRows.length === 0) {
    // Not a top-league team (for our purposes) – no dedicated page.
    return null;
  }

  // If a team somehow has multiple top-league rows, pick the one with the most minutes (primary league).
  const primarySeasonRow = seasonRows.reduce((best, row) =>
    !best || row.minutesPlayed > best.minutesPlayed ? row : best,
  ) as TeamSeasonRow;

  const leagueName = primarySeasonRow.league;

  // Recent fixtures in top leagues (last 10), from Fixture table.
  const recentFixturesRaw = await prisma.fixture.findMany({
    where: {
      season: API_SEASON,
      leagueId: { in: TOP_LEAGUE_IDS as unknown as number[] },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { date: "desc" },
    take: 10,
    include: {
      homeTeam: true,
      awayTeam: true,
      liveScoreCache: true,
    },
  });

  const recentFixtures: TeamPageFixtureSummary[] = recentFixturesRaw.map((f) => {
    const isHome = f.homeTeamId === teamId;
    const opponent = isHome ? f.awayTeam : f.homeTeam;
    const scoreSource = f.liveScoreCache;
    return {
      id: f.id,
      date: f.date instanceof Date ? f.date.toISOString() : new Date(f.date).toISOString(),
      league: f.league ?? null,
      opponentName: opponent.shortName ?? opponent.name,
      isHome,
      homeGoals: scoreSource ? scoreSource.homeGoals : null,
      awayGoals: scoreSource ? scoreSource.awayGoals : null,
      statusShort: scoreSource ? scoreSource.statusShort : null,
    };
  });

  // Key players for this team in the same league + season.
  const playerRows = await prisma.playerSeasonStats.findMany({
    where: {
      teamId,
      season: API_SEASON,
      league: leagueName,
      minutes: { gt: 0 },
    },
    include: {
      player: true,
    },
    orderBy: [{ minutes: "desc" }],
    take: 12,
  });

  const keyPlayers: TeamPagePlayerSummary[] = playerRows.map((row) => ({
    id: row.playerId,
    name: row.player.name,
    position: row.player.position ?? null,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    shots: row.shots,
    shotsOnTarget: row.shotsOnTarget,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
  }));

  return {
    teamId: team.id,
    teamApiId: team.apiId ?? null,
    name: team.name,
    shortName: team.shortName ?? null,
    crestUrl: team.crestUrl ?? null,
    leagueName,
    season: API_SEASON,
    per90: rowToPer90(primarySeasonRow),
    recentFixtures,
    keyPlayers,
  };
}

export const getTeamPageData = unstable_cache(
  async (teamId: number) => {
    return loadTeamPageData(teamId);
  },
  ["team-page-data"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

