import { prisma } from "@/lib/prisma";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { leagueToSlug, matchSlug } from "@/lib/slugs";

const db = prisma as typeof prisma & { teamFixtureCache: { findMany: (args: { where?: object; orderBy?: object }) => Promise<{ teamId: number; goalsFor: number; goalsAgainst: number; corners: number; yellowCards: number; redCards: number }[]> } };

export type Insight = { text: string; type: "team_last5" | "team_season" | "player_season"; href?: string };

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

  /** Minimum appearances before we show per-game rate insights (avoids "1 goal in 1 game = 1 per game" nonsense). */
  const MIN_APPEARANCES_FOR_RATE = 5;

  // Player season (from PlayerSeasonStats) — full name and team so everyone knows who it is
  for (const p of playersWithStats) {
    const rawAppearances = p.stats.appearances ?? (p.stats.minutes > 0 ? Math.max(1, Math.round(p.stats.minutes / 90)) : 0);
    const appearances = Math.max(1, rawAppearances);
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

    const hasEnoughGames = appearances >= MIN_APPEARANCES_FOR_RATE;
    const totalGoals = p.stats.goals ?? 0;

    if (hasEnoughGames && goalsPerGame >= 0.3) {
      const showOverOneGoal = goalsPerGame >= 1 && totalGoals >= 5;
      const textVal = showOverOneGoal ? Math.floor(goalsPerGame) : goalsPerGame < 0.5 ? "0.5" : Math.floor(goalsPerGame);
      insights.push({ type: "player_season", text: `${label} has averaged over ${textVal} goal${textVal !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (hasEnoughGames && foulsPerGame >= 0.8) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(foulsPerGame)} foul${Math.floor(foulsPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (hasEnoughGames && shotsPerGame > 0 && shotsPerGame <= 2.5) {
      insights.push({ type: "player_season", text: `${label} has averaged under ${Math.ceil(shotsPerGame * 2) / 2} shots per game this season.`, href });
    }
    if (hasEnoughGames && shotsPerGame >= 2) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(shotsPerGame)} shots per game this season.`, href });
    }
    if (hasEnoughGames && assistsPerGame >= 0.2) {
      const showOverOneAssist = assistsPerGame >= 1 && (p.stats.assists ?? 0) >= 5;
      const textVal = showOverOneAssist ? Math.floor(assistsPerGame) : assistsPerGame < 0.5 ? "0.5" : Math.floor(assistsPerGame);
      insights.push({ type: "player_season", text: `${label} has averaged over ${textVal} assist${textVal !== 1 ? "s" : ""} per game this season.`, href });
    }
    if (hasEnoughGames && tacklesPerGame >= 1.5) {
      insights.push({ type: "player_season", text: `${label} has averaged over ${Math.floor(tacklesPerGame)} tackle${Math.floor(tacklesPerGame) !== 1 ? "s" : ""} per game this season.`, href });
    }
  }

  // Shuffle and return up to 8
  shuffle(insights);
  return insights.slice(0, 8);
}

/** Load last-5 stats for today's teams for the AI page "Last 5 form" section. */
export async function getLast5StatsForDate(dateKey: string): Promise<Last5TeamSummary[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);

  const fixtures = await prisma.fixture.findMany({
    where: {
      date: { gte: dayStart, lte: spilloverEnd },
      leagueId: { in: [...REQUIRED_LEAGUE_IDS] },
    },
    include: { homeTeam: true, awayTeam: true },
  });

  if (fixtures.length === 0) return [];

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))
  );

  const [teamCacheByTeam] = await Promise.all([loadLast5ByTeam(teamIds)]);

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
    where: { date: { gte: dayStart, lte: spilloverEnd }, leagueId: { in: [...REQUIRED_LEAGUE_IDS] } },
    include: { homeTeam: true, awayTeam: true },
  });
  if (fixtures.length === 0) return [];
  const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])));
  const teamCacheByTeam = await loadLastNByTeam(teamIds, n);
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

/** Season averages for today's teams (from TeamSeasonStats). */
export async function getSeasonStatsForDate(dateKey: string): Promise<Last5TeamSummary[]> {
  const { dayStart, spilloverEnd } = dayBoundsForDate(dateKey);
  const fixtures = await prisma.fixture.findMany({
    where: { date: { gte: dayStart, lte: spilloverEnd }, leagueId: { in: [...REQUIRED_LEAGUE_IDS] } },
    include: { homeTeam: true, awayTeam: true },
  });
  if (fixtures.length === 0) return [];
  const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])));
  const teamSeasonRows = await prisma.teamSeasonStats.findMany({
    where: { teamId: { in: teamIds } },
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
      where: { teamId: { in: teamIds } },
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

function loadLastNByTeam(
  teamIds: number[],
  n: number
): Promise<Map<number, CacheRow[]>> {
  if (teamIds.length === 0) return Promise.resolve(new Map());
  return db.teamFixtureCache
    .findMany({
      where: { teamId: { in: teamIds } },
      orderBy: { fixtureDate: "desc" },
    })
    .then((cache) => {
      const byTeam = new Map<number, CacheRow[]>();
      for (const row of cache) {
        if (!byTeam.has(row.teamId)) byTeam.set(row.teamId, []);
        const arr = byTeam.get(row.teamId)!;
        if (arr.length < n) arr.push(row);
      }
      return byTeam;
    });
}

function loadLast5ByTeam(teamIds: number[]): Promise<Map<number, CacheRow[]>> {
  return loadLastNByTeam(teamIds, 5);
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
