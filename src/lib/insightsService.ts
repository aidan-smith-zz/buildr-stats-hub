import { prisma } from "@/lib/prisma";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { leagueToSlug, matchSlug } from "@/lib/slugs";

const db = prisma as typeof prisma & { teamFixtureCache: { findMany: (args: { where?: object; orderBy?: object }) => Promise<{ teamId: number; goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number }[]> } };

export type Insight = { text: string; type: "team_last5" | "team_season" | "player_season"; href?: string };

type FixtureWithTeams = { date: Date; league: string | null; homeTeam: { name: string; shortName: string | null }; awayTeam: { name: string; shortName: string | null } };

function fixtureToHref(fixture: FixtureWithTeams, dateKey: string): string {
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueToSlug(fixture.league)}/${matchSlug(home, away)}`;
}

/** Day bounds for a date string YYYY-MM-DD (UTC) for DB queries. */
function dayBoundsForDate(dateKey: string) {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const nextDayStr = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const spilloverEnd = new Date(`${nextDayStr}T00:59:59.999Z`);
  return { dayStart, spilloverEnd };
}

/**
 * Generate random AI-style insights from today's fixture data in the DB only.
 * No API calls. Uses TeamSeasonStats, TeamFixtureCache (last 5), PlayerSeasonStats.
 */
export async function generateInsights(dateKey: string): Promise<Insight[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);

  const fixtures = await prisma.fixture.findMany({
    where: {
      date: { gte: dayStart, lte: spilloverEnd },
      leagueId: { in: [...REQUIRED_LEAGUE_IDS] },
    },
    include: { homeTeam: true, awayTeam: true },
  });

  if (fixtures.length === 0) {
    return [];
  }

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
  );

  const [teamSeasonRows, teamCacheByTeam, playersWithStats] = await Promise.all([
    prisma.teamSeasonStats.findMany({
      where: { teamId: { in: teamIds } },
      include: { team: true },
    }),
    loadLast5ByTeam(teamIds),
    loadPlayersWithSeasonStats(teamIds),
  ]);

  const teamIdToFixture = new Map<number, (typeof fixtures)[0]>();
  for (const f of fixtures) {
    teamIdToFixture.set(f.homeTeamId, f);
    teamIdToFixture.set(f.awayTeamId, f);
  }

  const insights: Insight[] = [];

  // Team last 5 (from TeamFixtureCache)
  for (const [teamId, rows] of teamCacheByTeam.entries()) {
    if (rows.length < 3) continue;
    const team = fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).find((t) => t.id === teamId);
    const name = team?.shortName ?? team?.name ?? "They";
    const fixture = teamIdToFixture.get(teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const avgGoalsFor = rows.reduce((s, r) => s + r.goalsFor, 0) / rows.length;
    const avgGoalsAgainst = rows.reduce((s, r) => s + r.goalsAgainst, 0) / rows.length;
    const avgCorners = rows.reduce((s, r) => s + r.corners, 0) / rows.length;
    const avgCards = rows.reduce((s, r) => s + r.yellowCards + r.redCards, 0) / rows.length;

    if (avgGoalsFor >= 1.5) {
      insights.push({ type: "team_last5", text: `${name} have averaged over ${Math.floor(avgGoalsFor)} goal${Math.floor(avgGoalsFor) !== 1 ? "s" : ""} a game in their last ${rows.length} matches.`, href });
    }
    if (avgGoalsAgainst <= 1.2 && avgGoalsAgainst > 0) {
      insights.push({ type: "team_last5", text: `${name} have conceded under ${Math.ceil(avgGoalsAgainst * 10) / 10} goals per game in their last ${rows.length} matches.`, href });
    }
    if (avgCorners >= 4) {
      insights.push({ type: "team_last5", text: `${name} have averaged over ${Math.floor(avgCorners)} corners per game in their last ${rows.length} matches.`, href });
    }
    if (avgCards >= 2) {
      insights.push({ type: "team_last5", text: `${name} have averaged over ${Math.floor(avgCards)} cards per game in their last ${rows.length} matches.`, href });
    }
  }

  // Team season (from TeamSeasonStats)
  for (const row of teamSeasonRows) {
    const matches = row.minutesPlayed / 90;
    if (matches < 1) continue;
    const name = row.team.shortName ?? row.team.name;
    const fixture = teamIdToFixture.get(row.teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const goalsPerMatch = row.goalsFor / matches;
    const cornersPerMatch = row.corners / matches;
    const cardsPerMatch = (row.yellowCards + row.redCards) / matches;

    if (goalsPerMatch >= 1.5) {
      insights.push({ type: "team_season", text: `${name} average over ${Math.floor(goalsPerMatch)} goal${Math.floor(goalsPerMatch) !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (cornersPerMatch >= 5) {
      insights.push({ type: "team_season", text: `${name} average over ${Math.floor(cornersPerMatch)} corners per game this season.`, href });
    }
    if (cardsPerMatch >= 2) {
      insights.push({ type: "team_season", text: `${name} average over ${Math.floor(cardsPerMatch)} cards per game this season.`, href });
    }
  }

  // Player season (from PlayerSeasonStats) — full name and team so everyone knows who it is
  for (const p of playersWithStats) {
    const appearances = Math.max(1, p.stats.appearances || (p.stats.minutes > 0 ? 1 : 0));
    const goalsPerGame = (p.stats.goals ?? 0) / appearances;
    const assistsPerGame = (p.stats.assists ?? 0) / appearances;
    const foulsPerGame = (p.stats.fouls ?? 0) / appearances;
    const shotsPerGame = (p.stats.shots ?? 0) / appearances;
    const shotsOnTargetPerGame = (p.stats.shotsOnTarget ?? 0) / appearances;
    const tacklesPerGame = (p.stats.tackles ?? 0) / appearances;
    const cardsPerGame = ((p.stats.yellowCards ?? 0) + (p.stats.redCards ?? 0)) / appearances;

    const fullName = p.player.name;
    const teamLabel = p.teamName;
    const label = `${fullName} (${teamLabel})`;
    const fixture = teamIdToFixture.get(p.teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    if (goalsPerGame >= 0.3) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${goalsPerGame < 0.5 ? "0.5" : Math.floor(goalsPerGame)} goal${Math.floor(goalsPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (foulsPerGame >= 0.8) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(foulsPerGame)} foul${Math.floor(foulsPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (shotsPerGame > 0 && shotsPerGame <= 2.5) {
      insights.push({ type: "player_season", text: `${label} has averaged under ${Math.ceil(shotsPerGame * 2) / 2} shots per game this season.`, href });
    }
    if (shotsPerGame >= 2) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(shotsPerGame)} shots per game this season.`, href });
    }
    if (assistsPerGame >= 0.2) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${assistsPerGame < 0.5 ? "0.5" : Math.floor(assistsPerGame)} assist${Math.floor(assistsPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (tacklesPerGame >= 1.5) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(tacklesPerGame)} tackle${Math.floor(tacklesPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
  }

  // Shuffle and return up to 8
  shuffle(insights);
  return insights.slice(0, 8);
}

async function loadLast5ByTeam(
  teamIds: number[]
): Promise<Map<number, { goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number }[]>> {
  if (teamIds.length === 0) return new Map();
  const cache = await db.teamFixtureCache.findMany({
    where: { teamId: { in: teamIds } },
    orderBy: { fixtureDate: "desc" },
  });
  const byTeam = new Map<number, typeof cache>();
  for (const row of cache) {
    if (!byTeam.has(row.teamId)) byTeam.set(row.teamId, []);
    const arr = byTeam.get(row.teamId)!;
    if (arr.length < 5) arr.push(row);
  }
  return byTeam as Map<number, { goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number }[]>;
}

type PlayerWithStats = {
  player: { id: number; name: string };
  teamId: number;
  teamName: string;
  stats: PlayerSeasonStatsRow;
};
type PlayerSeasonStatsRow = {
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
};

async function loadPlayersWithSeasonStats(teamIds: number[]): Promise<PlayerWithStats[]> {
  if (teamIds.length === 0) return [];
  const rows = await prisma.playerSeasonStats.findMany({
    where: { teamId: { in: teamIds } },
    include: { player: true, team: true },
  });
  return rows.map((r) => ({
    player: r.player,
    teamId: r.teamId,
    teamName: r.team.shortName ?? r.team.name,
    stats: {
      appearances: r.appearances,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      fouls: r.fouls,
      shots: r.shots,
      shotsOnTarget: r.shotsOnTarget,
      tackles: r.tackles,
      yellowCards: r.yellowCards,
      redCards: r.redCards,
    },
  }));
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
