import { API_SEASON } from "@/lib/footballApi";
import { prisma } from "@/lib/prisma";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { leagueToSlug, matchSlug } from "@/lib/slugs";

const db = prisma as typeof prisma & {
  teamFixtureCache: {
    findMany: (args: { where?: object; orderBy?: object }) => Promise<
      { teamId: number; league: string; fixtureDate: Date; goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number }[]
    >;
  };
};

export type Insight = { text: string; type: "team_last5" | "team_last10" | "team_season" | "player_season"; href?: string };

/** Per-team last-5 summary for the AI page "Last 5 form" section. */
export type Last5TeamSummary = {
  teamName: string;
  teamId: number;
  gamesPlayed: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgCorners: number;
  avgCards: number;
  href?: string;
};

/** Fixture row for Form Edge: used with Last5TeamSummary to compute edge = homeRating - awayRating. */
export type FormEdgeFixture = {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  href: string;
  leagueId: number | null;
  league: string | null;
};

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

/** League names that map to EFL League One (41) / League Two (42) when leagueId is missing in DB. */
const LEAGUE_ONE_TWO_NAMES = [
  "League 41",
  "League 42",
  "League One",
  "English League One",
  "EFL League One",
  "League 1",
  "League1",
  "League Two",
  "English League Two",
  "EFL League Two",
  "League 2",
  "League2",
];

/** Where clause for fixtures on a given date in required leagues (including League 1/2 by name if leagueId is null). */
function fixturesOnDateInRequiredLeagues(dayStart: Date, spilloverEnd: Date) {
  return {
    date: { gte: dayStart, lte: spilloverEnd },
    OR: [
      { leagueId: { in: [...REQUIRED_LEAGUE_IDS] } },
      { leagueId: null, league: { in: LEAGUE_ONE_TWO_NAMES } },
      { leagueId: null, league: { contains: "League One", mode: "insensitive" as const } },
      { leagueId: null, league: { contains: "League Two", mode: "insensitive" as const } },
    ],
  };
}

/**
 * Generate random AI-style insights from today's fixture data in the DB only.
 * No API calls. Uses TeamSeasonStats, TeamFixtureCache (last 5), PlayerSeasonStats.
 */
export async function generateInsights(dateKey: string): Promise<Insight[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);

  const fixtures = await prisma.fixture.findMany({
    where: fixturesOnDateInRequiredLeagues(dayStart, spilloverEnd),
    include: { homeTeam: true, awayTeam: true },
  });

  if (fixtures.length === 0) {
    return [];
  }

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
  );
  const teamIdToLeague = teamIdToLeagueFromFixtures(fixtures);

  const [teamSeasonRows, teamCacheByTeam, teamCacheLast10, playersWithStats] = await Promise.all([
    prisma.teamSeasonStats.findMany({
      where: { teamId: { in: teamIds }, season: API_SEASON },
      include: { team: true },
    }),
    loadLast5ByTeam(teamIds, teamIdToLeague),
    loadLastNByTeam(teamIds, 10, teamIdToLeague),
    loadPlayersWithSeasonStats(teamIds),
  ]);

  const teamIdToFixture = new Map<number, (typeof fixtures)[0]>();
  for (const f of fixtures) {
    teamIdToFixture.set(f.homeTeamId, f);
    teamIdToFixture.set(f.awayTeamId, f);
  }

  const insights: Insight[] = [];

  // Team last 5 (from TeamFixtureCache) — club-focused facts
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

    // Consecutive games without scoring (from most recent)
    let goallessRun = 0;
    for (const r of rows) {
      if (r.goalsFor === 0) goallessRun++;
      else break;
    }
    if (goallessRun >= 2) {
      insights.push({ type: "team_last5", text: `${name} haven't scored in their last ${goallessRun} game${goallessRun !== 1 ? "s" : ""}.`, href });
    }
    if (avgGoalsFor >= 1.5) {
      insights.push({ type: "team_last5", text: `${name} have averaged over ${Math.floor(avgGoalsFor)} goal${Math.floor(avgGoalsFor) !== 1 ? "s" : ""} a game in their last ${rows.length} matches.`, href });
    }
    if (avgGoalsAgainst <= 1.2 && avgGoalsAgainst > 0) {
      insights.push({ type: "team_last5", text: `${name} have conceded under ${Math.ceil(avgGoalsAgainst * 10) / 10} goals per game in their last ${rows.length} matches.`, href });
    }
    if (avgCorners >= 4) {
      insights.push({ type: "team_last5", text: `${name} are averaging ${Math.floor(avgCorners)} corners per match in their last ${rows.length} games.`, href });
    }
    if (avgCards >= 2) {
      insights.push({ type: "team_last5", text: `${name} have averaged over ${Math.floor(avgCards)} cards per game in their last ${rows.length} matches.`, href });
    }
  }

  // Team last 10 (from TeamFixtureCache) — e.g. "X are averaging N corners in the last 10 games"
  for (const [teamId, rows] of teamCacheLast10.entries()) {
    if (rows.length < 6) continue;
    const team = fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).find((t) => t.id === teamId);
    const name = team?.shortName ?? team?.name ?? "They";
    const fixture = teamIdToFixture.get(teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const n = rows.length;
    const avgGoalsFor = rows.reduce((s, r) => s + r.goalsFor, 0) / n;
    const avgGoalsAgainst = rows.reduce((s, r) => s + r.goalsAgainst, 0) / n;
    const avgCorners = rows.reduce((s, r) => s + r.corners, 0) / n;
    const avgCards = rows.reduce((s, r) => s + r.yellowCards + r.redCards, 0) / n;

    let goallessRun = 0;
    for (const r of rows) {
      if (r.goalsFor === 0) goallessRun++;
      else break;
    }
    if (goallessRun >= 3) {
      insights.push({ type: "team_last10", text: `${name} haven't scored in their last ${goallessRun} games.`, href });
    }
    if (avgGoalsFor >= 1.5) {
      insights.push({ type: "team_last10", text: `${name} have averaged over ${Math.floor(avgGoalsFor)} goal${Math.floor(avgGoalsFor) !== 1 ? "s" : ""} per game in their last ${n} games.`, href });
    }
    if (avgCorners >= 4) {
      insights.push({ type: "team_last10", text: `${name} are averaging ${Math.floor(avgCorners)} corners per match in their last ${n} games.`, href });
    }
    if (avgCards >= 1.5) {
      const cardsFloor = Math.floor(avgCards);
      insights.push({ type: "team_last10", text: `${name} have averaged over ${cardsFloor} card${cardsFloor !== 1 ? "s" : ""} per game in their last ${n} games.`, href });
    }
  }

  // Team season (from TeamSeasonStats) — club-focused facts
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
      const n = Math.floor(goalsPerMatch);
      insights.push({ type: "team_season", text: `${name} are averaging ${n} goal${n !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (cornersPerMatch >= 4) {
      const n = Math.floor(cornersPerMatch);
      insights.push({ type: "team_season", text: `${name} are averaging ${n} corners per match this season.`, href });
    }
    if (cardsPerMatch >= 2) {
      const n = Math.floor(cardsPerMatch);
      insights.push({ type: "team_season", text: `${name} are averaging ${n} cards per game this season.`, href });
    }
  }

  /** Only show player insights for those with more than 6 full games (540 mins). */
  const MIN_MINUTES_FOR_PLAYER_INSIGHTS = 6 * 90; // 540
  /** Need at least this many eligible players to compute percentile bands (otherwise skip player insights). */
  const MIN_PLAYERS_FOR_BANDS = 4;

  type PlayerMetric = {
    p: (typeof playersWithStats)[0];
    appearances: number;
    minutes: number;
    goalsPerGame: number;
    assistsPerGame: number;
    foulsPerGame: number;
    shotsPerGame: number;
    tacklesPerGame: number;
    cardsPerGame: number;
    yellowCardsPer90: number;
    label: string;
    href: string | undefined;
  };

  const eligible: PlayerMetric[] = [];
  for (const p of playersWithStats) {
    const minutes = p.stats.minutes ?? 0;
    if (minutes < MIN_MINUTES_FOR_PLAYER_INSIGHTS) continue;
    // Use at least games implied by minutes so "per game" isn't inflated by low API appearance counts (e.g. 1 goal in 4 games stored as 1 appearance -> 1/1 = 1 per game).
    const gamesFromMinutes = Math.max(1, Math.round(minutes / 90));
    const rawAppearances = p.stats.appearances ?? gamesFromMinutes;
    const appearances = Math.max(rawAppearances, gamesFromMinutes, 1);
    const fixture = teamIdToFixture.get(p.teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const fullName = p.player.name;
    const teamLabel = p.teamName;
    const label = `${fullName} (${teamLabel})`;
    eligible.push({
      p,
      appearances,
      minutes,
      goalsPerGame: (p.stats.goals ?? 0) / appearances,
      assistsPerGame: (p.stats.assists ?? 0) / appearances,
      foulsPerGame: (p.stats.fouls ?? 0) / appearances,
      shotsPerGame: (p.stats.shots ?? 0) / appearances,
      tacklesPerGame: (p.stats.tackles ?? 0) / appearances,
      cardsPerGame: ((p.stats.yellowCards ?? 0) + (p.stats.redCards ?? 0)) / appearances,
      yellowCardsPer90: minutes >= 90 ? ((p.stats.yellowCards ?? 0) / minutes) * 90 : 0,
      label,
      href,
    });
  }

  if (eligible.length >= MIN_PLAYERS_FOR_BANDS) {
    const p75 = (arr: number[]) => percentile(arr, 75);
    const p25 = (arr: number[]) => percentile(arr, 25);
    const goalsArr = eligible.map((e) => e.goalsPerGame);
    const assistsArr = eligible.map((e) => e.assistsPerGame);
    const foulsArr = eligible.map((e) => e.foulsPerGame);
    const shotsArr = eligible.map((e) => e.shotsPerGame);
    const tacklesArr = eligible.map((e) => e.tacklesPerGame);
    const cardsArr = eligible.map((e) => e.cardsPerGame);
    const yellowPer90Arr = eligible.filter((e) => (e.p.stats.yellowCards ?? 0) > 0).map((e) => e.yellowCardsPer90);

    const goalsP75 = p75(goalsArr);
    const assistsP75 = p75(assistsArr);
    const foulsP75 = p75(foulsArr);
    const foulsP25 = p25(foulsArr);
    const shotsP75 = p75(shotsArr);
    const shotsP25 = p25(shotsArr);
    const tacklesP75 = p75(tacklesArr);
    const cardsP75 = p75(cardsArr);
    const yellowP75 = yellowPer90Arr.length >= 2 ? p75(yellowPer90Arr) : 0;

    for (const e of eligible) {
      // High scorers (top quarter) — show value we're sure they're at or above (floor to 1 decimal)
      if (e.goalsPerGame >= goalsP75 && e.goalsPerGame >= 0.5) {
        const display = e.goalsPerGame >= 1 ? Math.floor(e.goalsPerGame) : Math.floor(e.goalsPerGame * 10) / 10;
        const s = display !== 1 ? "s" : "";
        insights.push({ type: "player_season", text: `${e.label} has averaged at least ${display} goal${s} per game this season (top quarter among today's players).`, href: e.href });
      }
      // High assisters (top quarter)
      if (e.assistsPerGame >= assistsP75 && e.assistsPerGame >= 0.5) {
        const display = e.assistsPerGame >= 1 ? Math.floor(e.assistsPerGame) : Math.floor(e.assistsPerGame * 10) / 10;
        const s = display !== 1 ? "s" : "";
        insights.push({ type: "player_season", text: `${e.label} has averaged at least ${display} assist${s} per game this season.`, href: e.href });
      }
      // High foulers (top quarter)
      if (e.foulsPerGame >= foulsP75 && e.foulsPerGame >= 0.5) {
        insights.push({ type: "player_season", text: `${e.label} has averaged over ${Math.floor(e.foulsPerGame)} foul${Math.floor(e.foulsPerGame) !== 1 ? "s" : ""} per game this season.`, href: e.href });
      }
      // Clean player (bottom quarter fouls)
      if (e.foulsPerGame <= foulsP25 && foulsP25 < 1 && e.appearances >= 6) {
        insights.push({ type: "player_season", text: `${e.label} commits very few fouls per game compared to others playing today.`, href: e.href });
      }
      // High volume shooter (top quarter)
      if (e.shotsPerGame >= shotsP75 && e.shotsPerGame >= 0.5) {
        insights.push({ type: "player_season", text: `${e.label} has averaged over ${Math.floor(e.shotsPerGame)} shots per game this season.`, href: e.href });
      }
      // Rare shooter (bottom quarter) — only say "under X" when strictly below X
      if (e.shotsPerGame <= shotsP25 && shotsP25 < 2 && e.appearances >= 6) {
        const underThreshold = Math.ceil(shotsP25 * 2) / 2;
        if (e.shotsPerGame < underThreshold) {
          insights.push({ type: "player_season", text: `${e.label} averages under ${underThreshold} shots per game this season.`, href: e.href });
        } else {
          const display = e.shotsPerGame >= 1 ? Math.floor(e.shotsPerGame) : Math.floor(e.shotsPerGame * 10) / 10;
          if (display >= 0.5) {
            insights.push({ type: "player_season", text: `${e.label} averages ${display} shots per game this season (bottom quarter among today's players).`, href: e.href });
          }
        }
      }
      // Ball winner (top quarter tackles)
      if (e.tacklesPerGame >= tacklesP75 && e.tacklesPerGame >= 0.5) {
        insights.push({ type: "player_season", text: `${e.label} has averaged over ${Math.floor(e.tacklesPerGame)} tackle${Math.floor(e.tacklesPerGame) !== 1 ? "s" : ""} per game this season.`, href: e.href });
      }
      // Card magnet (top quarter cards per game)
      if (e.cardsPerGame >= cardsP75 && e.cardsPerGame >= 0.5) {
        const n = e.cardsPerGame >= 1 ? Math.floor(e.cardsPerGame) : 0.5;
        const cardWord = n === 1 ? "card" : "cards";
        insights.push({ type: "player_season", text: `${e.label} has averaged over ${n === 0.5 ? "0.5" : n} ${cardWord} per game this season.`, href: e.href });
      }
      // Booking risk (top quarter yellow per 90, only if they have at least one yellow)
      if ((e.p.stats.yellowCards ?? 0) > 0 && e.yellowCardsPer90 >= yellowP75 && e.yellowCardsPer90 >= 0.5 && yellowP75 > 0) {
        const rate = Math.round(e.yellowCardsPer90 * 10) / 10;
        const cardWord = rate === 1 ? "yellow card" : "yellow cards";
        insights.push({ type: "player_season", text: `${e.label} is averaging ${rate} ${cardWord} per 90 minutes this season (high among today's players).`, href: e.href });
      }
    }
  }

  // Shuffle and return up to 8
  shuffle(insights);
  return insights.slice(0, 8);
}

/** Build map of teamId -> canonical league key for TeamFixtureCache (leagueId as string when present, else league name). */
function teamIdToLeagueFromFixtures(
  fixtures: { homeTeamId: number; awayTeamId: number; league: string | null; leagueId?: number | null }[]
): Map<number, string> {
  const map = new Map<number, string>();
  for (const f of fixtures) {
    const cacheKey = f.leagueId != null ? String(f.leagueId) : (f.league ?? "Unknown");
    if (!map.has(f.homeTeamId)) map.set(f.homeTeamId, cacheKey);
    if (!map.has(f.awayTeamId)) map.set(f.awayTeamId, cacheKey);
  }
  return map;
}

/** Load last-5 stats for today's teams for the AI page "Last 5 form" section. */
export async function getLast5StatsForDate(dateKey: string): Promise<Last5TeamSummary[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);

  const fixtures = await prisma.fixture.findMany({
    where: fixturesOnDateInRequiredLeagues(dayStart, spilloverEnd),
    include: { homeTeam: true, awayTeam: true },
  });

  if (fixtures.length === 0) return [];

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
  );
  const teamIdToLeague = teamIdToLeagueFromFixtures(fixtures);

  const [teamCacheByTeam] = await Promise.all([loadLast5ByTeam(teamIds, teamIdToLeague)]);

  const teamIdToFixture = new Map<number, (typeof fixtures)[0]>();
  for (const f of fixtures) {
    teamIdToFixture.set(f.homeTeamId, f);
    teamIdToFixture.set(f.awayTeamId, f);
  }

  const out: Last5TeamSummary[] = [];

  for (const [teamId, rows] of teamCacheByTeam.entries()) {
    if (rows.length < 3) continue;
    const team = fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).find((t) => t.id === teamId);
    const name = team?.shortName ?? team?.name ?? "Unknown";
    const fixture = teamIdToFixture.get(teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const n = rows.length;
    out.push({
      teamId,
      teamName: name,
      gamesPlayed: n,
      avgGoalsFor: rows.reduce((s, r) => s + r.goalsFor, 0) / n,
      avgGoalsAgainst: rows.reduce((s, r) => s + r.goalsAgainst, 0) / n,
      avgCorners: rows.reduce((s, r) => s + r.corners, 0) / n,
      avgCards: rows.reduce((s, r) => s + r.yellowCards + r.redCards, 0) / n,
      href,
    });
  }

  out.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return out;
}

/** Load last-N stats for today's teams (used for last 10; last 5 uses getLast5StatsForDate). */
export async function getLastNStatsForDate(dateKey: string, n: number): Promise<Last5TeamSummary[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);
  const fixtures = await prisma.fixture.findMany({
    where: fixturesOnDateInRequiredLeagues(dayStart, spilloverEnd),
    include: { homeTeam: true, awayTeam: true },
  });
  if (fixtures.length === 0) return [];
  const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])));
  const teamIdToLeague = teamIdToLeagueFromFixtures(fixtures);
  const teamCacheByTeam = await loadLastNByTeam(teamIds, n, teamIdToLeague);
  const teamIdToFixture = new Map<number, (typeof fixtures)[0]>();
  for (const f of fixtures) {
    teamIdToFixture.set(f.homeTeamId, f);
    teamIdToFixture.set(f.awayTeamId, f);
  }
  const out: Last5TeamSummary[] = [];
  for (const [teamId, rows] of teamCacheByTeam.entries()) {
    if (rows.length < 3) continue;
    const team = fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]).find((t) => t.id === teamId);
    const name = team?.shortName ?? team?.name ?? "Unknown";
    const fixture = teamIdToFixture.get(teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    const gamesPlayed = rows.length;
    out.push({
      teamId,
      teamName: name,
      gamesPlayed,
      avgGoalsFor: rows.reduce((s, r) => s + r.goalsFor, 0) / gamesPlayed,
      avgGoalsAgainst: rows.reduce((s, r) => s + r.goalsAgainst, 0) / gamesPlayed,
      avgCorners: rows.reduce((s, r) => s + r.corners, 0) / gamesPlayed,
      avgCards: rows.reduce((s, r) => s + r.yellowCards + r.redCards, 0) / gamesPlayed,
      href,
    });
  }
  out.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return out;
}

/** Load last-10 stats for today's teams. */
export async function getLast10StatsForDate(dateKey: string): Promise<Last5TeamSummary[]> {
  return getLastNStatsForDate(dateKey, 10);
}

/** Fixtures for the date with team ids and names, for Form Edge section (same order as form tables). */
export async function getFormEdgeFixtures(dateKey: string): Promise<FormEdgeFixture[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);
  const fixtures = await prisma.fixture.findMany({
    where: fixturesOnDateInRequiredLeagues(dayStart, spilloverEnd),
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: "asc" },
  });
  return fixtures.map((f) => ({
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    homeName: f.homeTeam.shortName ?? f.homeTeam.name,
    awayName: f.awayTeam.shortName ?? f.awayTeam.name,
    href: fixtureToHref(f, dateKey),
    leagueId: f.leagueId ?? null,
    league: f.league ?? null,
  }));
}

/** Season averages for today's teams (from TeamSeasonStats). Uses each team's league for today so we show that competition's season stats. */
export async function getSeasonStatsForDate(dateKey: string): Promise<Last5TeamSummary[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);
  const fixtures = await prisma.fixture.findMany({
    where: fixturesOnDateInRequiredLeagues(dayStart, spilloverEnd),
    include: { homeTeam: true, awayTeam: true },
  });
  if (fixtures.length === 0) return [];
  const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])));
  const teamIdToLeague = teamIdToLeagueFromFixtures(fixtures);
  const teamSeasonRows = await prisma.teamSeasonStats.findMany({
    where: { teamId: { in: teamIds }, season: API_SEASON },
    include: { team: true },
  });
  const teamIdToFixture = new Map<number, (typeof fixtures)[0]>();
  for (const f of fixtures) {
    teamIdToFixture.set(f.homeTeamId, f);
    teamIdToFixture.set(f.awayTeamId, f);
  }
  const byTeam = new Map<
    number,
    { matches: number; goalsFor: number; goalsAgainst: number; corners: number; cards: number; teamName: string; href?: string }
  >();
  for (const row of teamSeasonRows) {
    const leagueForTeam = teamIdToLeague.get(row.teamId);
    const matchesLeague =
      leagueForTeam == null ||
      row.league === leagueForTeam ||
      (row.leagueId != null && String(row.leagueId) === leagueForTeam);
    if (!matchesLeague) continue;
    const matches = row.minutesPlayed / 90;
    if (matches < 1) continue;
    const existing = byTeam.get(row.teamId);
    if (existing && matches <= existing.matches) continue;
    const fixture = teamIdToFixture.get(row.teamId);
    const href = fixture ? fixtureToHref(fixture, dateKey) : undefined;
    byTeam.set(row.teamId, {
      matches,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      corners: row.corners,
      cards: row.yellowCards + row.redCards,
      teamName: row.team.shortName ?? row.team.name,
      href,
    });
  }
  const out: Last5TeamSummary[] = [];
  for (const [teamId, v] of byTeam.entries()) {
    out.push({
      teamId,
      teamName: v.teamName,
      gamesPlayed: Math.round(v.matches),
      avgGoalsFor: v.goalsFor / v.matches,
      avgGoalsAgainst: v.goalsAgainst / v.matches,
      avgCorners: v.corners / v.matches,
      avgCards: v.cards / v.matches,
      href: v.href,
    });
  }
  out.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return out;
}

/** Form (last 5, last 10, season) for specific teams — e.g. the two teams on the fixture match page. */
export async function getFormForTeams(
  teamIds: number[],
  dateKey: string,
  hrefByTeamId?: Map<number, string>
): Promise<{ last5: Last5TeamSummary[]; last10: Last5TeamSummary[]; season: Last5TeamSummary[] }> {
  if (teamIds.length === 0) return { last5: [], last10: [], season: [] };
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true },
  });
  const nameByTeamId = new Map(teams.map((t) => [t.id, t.shortName ?? t.name]));

  const [cache5, cache10, seasonRows] = await Promise.all([
    loadLastNByTeam(teamIds, 5),
    loadLastNByTeam(teamIds, 10),
    prisma.teamSeasonStats.findMany({
      where: { teamId: { in: teamIds }, season: API_SEASON },
      include: { team: true },
    }),
  ]);

  const build = (rows: CacheRow[], teamId: number): Last5TeamSummary | null => {
    if (rows.length < 3) return null;
    const n = rows.length;
    return {
      teamId,
      teamName: nameByTeamId.get(teamId) ?? "Unknown",
      gamesPlayed: n,
      avgGoalsFor: rows.reduce((s, r) => s + r.goalsFor, 0) / n,
      avgGoalsAgainst: rows.reduce((s, r) => s + r.goalsAgainst, 0) / n,
      avgCorners: rows.reduce((s, r) => s + r.corners, 0) / n,
      avgCards: rows.reduce((s, r) => s + r.yellowCards + r.redCards, 0) / n,
      href: hrefByTeamId?.get(teamId),
    };
  };

  const last5: Last5TeamSummary[] = [];
  const last10: Last5TeamSummary[] = [];
  for (const teamId of teamIds) {
    const b5 = build(cache5.get(teamId) ?? [], teamId);
    if (b5) last5.push(b5);
    const b10 = build(cache10.get(teamId) ?? [], teamId);
    if (b10) last10.push(b10);
  }

  const season: Last5TeamSummary[] = [];
  const byTeamSeason = new Map<
    number,
    { matches: number; goalsFor: number; goalsAgainst: number; corners: number; cards: number }
  >();
  for (const row of seasonRows) {
    const matches = row.minutesPlayed / 90;
    if (matches < 1) continue;
    const existing = byTeamSeason.get(row.teamId);
    if (existing && matches <= existing.matches) continue;
    byTeamSeason.set(row.teamId, {
      matches,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      corners: row.corners,
      cards: row.yellowCards + row.redCards,
    });
  }
  for (const teamId of teamIds) {
    const v = byTeamSeason.get(teamId);
    if (!v) continue;
    season.push({
      teamId,
      teamName: nameByTeamId.get(teamId) ?? "Unknown",
      gamesPlayed: Math.round(v.matches),
      avgGoalsFor: v.goalsFor / v.matches,
      avgGoalsAgainst: v.goalsAgainst / v.matches,
      avgCorners: v.corners / v.matches,
      avgCards: v.cards / v.matches,
      href: hrefByTeamId?.get(teamId),
    });
  }

  return { last5, last10, season };
}

type CacheRow = { goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number };

/** Load last N cache rows per team. If teamIdToLeague is provided, only includes rows for that team's league (same competition form). */
function loadLastNByTeam(
  teamIds: number[],
  n: number,
  teamIdToLeague?: Map<number, string>
): Promise<Map<number, CacheRow[]>> {
  if (teamIds.length === 0) return Promise.resolve(new Map());
  const now = new Date();
  const baseWhere: { teamId: { in: number[] }; season: string } | { OR: { teamId: number; league: string; season: string }[] } =
    teamIdToLeague && teamIdToLeague.size > 0
      ? { OR: Array.from(teamIdToLeague.entries()).map(([teamId, league]) => ({ teamId, league, season: API_SEASON })) }
      : { teamId: { in: teamIds }, season: API_SEASON };
  const where = { ...baseWhere, fixtureDate: { lte: now } };

  return db.teamFixtureCache
    .findMany({
      where,
      orderBy: { fixtureDate: "desc" },
    })
    .then((cache) => {
      const byTeam = new Map<number, CacheRow[]>();
      for (const row of cache) {
        if (!byTeam.has(row.teamId)) byTeam.set(row.teamId, []);
        const arr = byTeam.get(row.teamId)!;
        if (arr.length < n) arr.push({ goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, corners: row.corners, yellowCards: row.yellowCards, redCards: row.redCards });
      }
      return byTeam;
    });
}

function loadLast5ByTeam(teamIds: number[], teamIdToLeague?: Map<number, string>): Promise<Map<number, CacheRow[]>> {
  return loadLastNByTeam(teamIds, 5, teamIdToLeague);
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
    where: { teamId: { in: teamIds }, season: API_SEASON },
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

/** Get value at percentile p (0–100). Uses linear interpolation. Sorts a copy of the array. */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
