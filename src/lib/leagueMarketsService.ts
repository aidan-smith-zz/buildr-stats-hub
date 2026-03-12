import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";

type LeagueBttsTeamRow = {
  teamId: number;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  matches: number;
  bttsYes: number;
  bttsPct: number | null;
};

type LeagueBttsFixtureSummary = {
  apiFixtureId: string;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  btts: boolean;
};

export type LeagueBttsMarketData = {
  leagueId: number;
  leagueName: string;
  season: string;
  totalMatches: number;
  bttsYes: number;
  bttsPct: number | null;
  teams: LeagueBttsTeamRow[];
  recentFixtures: LeagueBttsFixtureSummary[];
};

async function loadLeagueBttsMarketData(leagueId: number): Promise<LeagueBttsMarketData | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) return null;
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId];
  if (!leagueName) return null;

  const cacheKey = String(leagueId);

  const rows = await prisma.teamFixtureCache.findMany({
    where: {
      season: API_SEASON,
      league: cacheKey,
    },
    select: {
      teamId: true,
      apiFixtureId: true,
      fixtureDate: true,
      goalsFor: true,
      goalsAgainst: true,
    },
  });

  if (rows.length === 0) {
    return null;
  }

  // Per-team BTTS from cache rows (team perspective).
  const teamStats = new Map<
    number,
    { matches: number; bttsYes: number }
  >();
  for (const r of rows) {
    const btts = r.goalsFor > 0 && r.goalsAgainst > 0;
    const current = teamStats.get(r.teamId) ?? { matches: 0, bttsYes: 0 };
    current.matches += 1;
    if (btts) current.bttsYes += 1;
    teamStats.set(r.teamId, current);
  }

  const teamIds = Array.from(teamStats.keys());
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, crestUrl: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const teamRows: LeagueBttsTeamRow[] = [];
  for (const [teamId, stats] of teamStats.entries()) {
    const team = teamById.get(teamId);
    if (!team) continue;
    const pct = stats.matches > 0 ? (stats.bttsYes / stats.matches) * 100 : null;
    teamRows.push({
      teamId,
      name: team.name,
      shortName: team.shortName ?? null,
      crestUrl: team.crestUrl ?? null,
      matches: stats.matches,
      bttsYes: stats.bttsYes,
      bttsPct: pct,
    });
  }

  teamRows.sort((a, b) => {
    if (b.bttsPct == null && a.bttsPct == null) return a.name.localeCompare(b.name);
    if (b.bttsPct == null) return -1;
    if (a.bttsPct == null) return 1;
    if (b.bttsPct !== a.bttsPct) return b.bttsPct - a.bttsPct;
    return a.name.localeCompare(b.name);
  });

  // Per-fixture BTTS from grouped cache (one row per match).
  type FixtureGroupRow = {
    teamId: number;
    fixtureDate: Date;
    goalsFor: number;
    goalsAgainst: number;
  };
  const byFixture = new Map<string, FixtureGroupRow[]>();
  for (const r of rows) {
    const list = byFixture.get(r.apiFixtureId) ?? [];
    list.push({
      teamId: r.teamId,
      fixtureDate: r.fixtureDate,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
    });
    byFixture.set(r.apiFixtureId, list);
  }

  type FixtureAgg = {
    apiFixtureId: string;
    date: Date;
    homeTeamId: number;
    awayTeamId: number | null;
    homeGoals: number;
    awayGoals: number;
    btts: boolean;
  };

  const fixtures: FixtureAgg[] = [];
  for (const [apiFixtureId, list] of byFixture.entries()) {
    if (list.length === 0) continue;
    const first = list[0]!;
    const date = first.fixtureDate;
    // Prefer a row where goalsFor + goalsAgainst is non-null; they all should be.
    const row = list.find((r) => r.goalsFor != null && r.goalsAgainst != null) ?? first;
    const homeGoals = row.goalsFor;
    const awayGoals = row.goalsAgainst;
    const btts = homeGoals > 0 && awayGoals > 0;
    const homeTeamId = row.teamId;
    const other = list.find((r) => r.teamId !== homeTeamId) ?? null;
    const awayTeamId = other ? other.teamId : null;
    fixtures.push({
      apiFixtureId,
      date,
      homeTeamId,
      awayTeamId,
      homeGoals,
      awayGoals,
      btts,
    });
  }

  fixtures.sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalMatches = fixtures.length;
  const bttsYes = fixtures.filter((f) => f.btts).length;
  const bttsPct = totalMatches > 0 ? (bttsYes / totalMatches) * 100 : null;

  const recentFixturesRaw = fixtures.slice(-25).reverse();
  const recentFixtures: LeagueBttsFixtureSummary[] = recentFixturesRaw.map((f) => {
    const homeTeam = teamById.get(f.homeTeamId);
    const awayTeam = f.awayTeamId != null ? teamById.get(f.awayTeamId) : null;
    const homeName = homeTeam ? homeTeam.shortName ?? homeTeam.name : "Home";
    const awayName = awayTeam ? awayTeam.shortName ?? awayTeam.name : "Away";
    return {
      apiFixtureId: f.apiFixtureId,
      date: f.date.toISOString(),
      homeTeamName: homeName,
      awayTeamName: awayName,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
      btts: f.btts,
    };
  });

  return {
    leagueId,
    leagueName,
    season: API_SEASON,
    totalMatches,
    bttsYes,
    bttsPct,
    teams: teamRows,
    recentFixtures,
  };
}

export const getLeagueBttsMarketData = unstable_cache(
  async (leagueId: number) => {
    return loadLeagueBttsMarketData(leagueId);
  },
  ["league-btts-market"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

type LeagueTotalGoalsTeamRow = {
  teamId: number;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  matches: number;
  over25: number;
  over25Pct: number | null;
};

type LeagueTotalGoalsFixtureSummary = {
  apiFixtureId: string;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
  over25: boolean;
};

export type LeagueTotalGoalsMarketData = {
  leagueId: number;
  leagueName: string;
  season: string;
  totalMatches: number;
  over25: number;
  over25Pct: number | null;
  over35: number;
  over35Pct: number | null;
  over45: number;
  over45Pct: number | null;
  teams: LeagueTotalGoalsTeamRow[];
  recentFixtures: LeagueTotalGoalsFixtureSummary[];
};

async function loadLeagueTotalGoalsMarketData(leagueId: number): Promise<LeagueTotalGoalsMarketData | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) return null;
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId];
  if (!leagueName) return null;

  const cacheKey = String(leagueId);

  const rows = await prisma.teamFixtureCache.findMany({
    where: {
      season: API_SEASON,
      league: cacheKey,
    },
    select: {
      teamId: true,
      apiFixtureId: true,
      fixtureDate: true,
      goalsFor: true,
      goalsAgainst: true,
    },
  });

  if (rows.length === 0) {
    return null;
  }

  // Per-team over 2.5 from cache rows (team perspective).
  const teamStats = new Map<
    number,
    { matches: number; over25: number }
  >();
  for (const r of rows) {
    const totalGoals = r.goalsFor + r.goalsAgainst;
    const over25 = totalGoals > 2.5;
    const current = teamStats.get(r.teamId) ?? { matches: 0, over25: 0 };
    current.matches += 1;
    if (over25) current.over25 += 1;
    teamStats.set(r.teamId, current);
  }

  const teamIds = Array.from(teamStats.keys());
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, crestUrl: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const teamRows: LeagueTotalGoalsTeamRow[] = [];
  for (const [teamId, stats] of teamStats.entries()) {
    const team = teamById.get(teamId);
    if (!team) continue;
    const pct = stats.matches > 0 ? (stats.over25 / stats.matches) * 100 : null;
    teamRows.push({
      teamId,
      name: team.name,
      shortName: team.shortName ?? null,
      crestUrl: team.crestUrl ?? null,
      matches: stats.matches,
      over25: stats.over25,
      over25Pct: pct,
    });
  }

  teamRows.sort((a, b) => {
    if (b.over25Pct == null && a.over25Pct == null) return a.name.localeCompare(b.name);
    if (b.over25Pct == null) return -1;
    if (a.over25Pct == null) return 1;
    if (b.over25Pct !== a.over25Pct) return b.over25Pct - a.over25Pct;
    return a.name.localeCompare(b.name);
  });

  // Per-fixture totals from grouped cache (one row per match).
  type FixtureGroupRow = {
    teamId: number;
    fixtureDate: Date;
    goalsFor: number;
    goalsAgainst: number;
  };
  const byFixture = new Map<string, FixtureGroupRow[]>();
  for (const r of rows) {
    const list = byFixture.get(r.apiFixtureId) ?? [];
    list.push({
      teamId: r.teamId,
      fixtureDate: r.fixtureDate,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
    });
    byFixture.set(r.apiFixtureId, list);
  }

  type FixtureAgg = {
    apiFixtureId: string;
    date: Date;
    homeTeamId: number;
    awayTeamId: number | null;
    homeGoals: number;
    awayGoals: number;
    totalGoals: number;
  };

  const fixtures: FixtureAgg[] = [];
  for (const [apiFixtureId, list] of byFixture.entries()) {
    if (list.length === 0) continue;
    const first = list[0]!;
    const date = first.fixtureDate;
    const row = list.find((r) => r.goalsFor != null && r.goalsAgainst != null) ?? first;
    const homeGoals = row.goalsFor;
    const awayGoals = row.goalsAgainst;
    const totalGoals = homeGoals + awayGoals;
    const homeTeamId = row.teamId;
    const other = list.find((r) => r.teamId !== homeTeamId) ?? null;
    const awayTeamId = other ? other.teamId : null;
    fixtures.push({
      apiFixtureId,
      date,
      homeTeamId,
      awayTeamId,
      homeGoals,
      awayGoals,
      totalGoals,
    });
  }

  fixtures.sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalMatches = fixtures.length;
  let over25 = 0;
  let over35 = 0;
  let over45 = 0;
  for (const f of fixtures) {
    if (f.totalGoals > 2.5) over25 += 1;
    if (f.totalGoals > 3.5) over35 += 1;
    if (f.totalGoals > 4.5) over45 += 1;
  }
  const over25Pct = totalMatches > 0 ? (over25 / totalMatches) * 100 : null;
  const over35Pct = totalMatches > 0 ? (over35 / totalMatches) * 100 : null;
  const over45Pct = totalMatches > 0 ? (over45 / totalMatches) * 100 : null;

  const recentFixturesRaw = fixtures.slice(-25).reverse();
  const recentFixtures: LeagueTotalGoalsFixtureSummary[] = recentFixturesRaw.map((f) => {
    const homeTeam = teamById.get(f.homeTeamId);
    const awayTeam = f.awayTeamId != null ? teamById.get(f.awayTeamId) : null;
    const homeName = homeTeam ? homeTeam.shortName ?? homeTeam.name : "Home";
    const awayName = awayTeam ? awayTeam.shortName ?? awayTeam.name : "Away";
    return {
      apiFixtureId: f.apiFixtureId,
      date: f.date.toISOString(),
      homeTeamName: homeName,
      awayTeamName: awayName,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
      totalGoals: f.totalGoals,
      over25: f.totalGoals > 2.5,
    };
  });

  return {
    leagueId,
    leagueName,
    season: API_SEASON,
    totalMatches,
    over25,
    over25Pct,
    over35,
    over35Pct,
    over45,
    over45Pct,
    teams: teamRows,
    recentFixtures,
  };
}

export const getLeagueTotalGoalsMarketData = unstable_cache(
  async (leagueId: number) => {
    return loadLeagueTotalGoalsMarketData(leagueId);
  },
  ["league-total-goals-market"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

type LeagueCornersTeamRow = {
  teamId: number;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  matches: number;
  over35: number;
  over35Pct: number | null;
};

type LeagueCornersFixtureSummary = {
  apiFixtureId: string;
  date: string;
  teamName: string;
  corners: number;
  over35: boolean;
};

export type LeagueCornersMarketData = {
  leagueId: number;
  leagueName: string;
  season: string;
  totalRows: number;
  over35: number;
  over35Pct: number | null;
  over45: number;
  over45Pct: number | null;
  over55: number;
  over55Pct: number | null;
  teams: LeagueCornersTeamRow[];
  recentRows: LeagueCornersFixtureSummary[];
};

async function loadLeagueCornersMarketData(leagueId: number): Promise<LeagueCornersMarketData | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) return null;
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId];
  if (!leagueName) return null;

  const cacheKey = String(leagueId);

  const rows = await prisma.teamFixtureCache.findMany({
    where: {
      season: API_SEASON,
      league: cacheKey,
    },
    select: {
      teamId: true,
      apiFixtureId: true,
      fixtureDate: true,
      corners: true,
    },
  });

  if (rows.length === 0) {
    return null;
  }

  // Per-team over 3.5 from cache rows (team-specific corners).
  const teamStats = new Map<
    number,
    { matches: number; over35: number }
  >();
  let totalRows = 0;
  let over35 = 0;
  let over45 = 0;
  let over55 = 0;

  for (const r of rows) {
    const corners = r.corners ?? 0;
    const isOver35 = corners > 3.5;
    const isOver45 = corners > 4.5;
    const isOver55 = corners > 5.5;
    totalRows += 1;
    if (isOver35) over35 += 1;
    if (isOver45) over45 += 1;
    if (isOver55) over55 += 1;

    const current = teamStats.get(r.teamId) ?? { matches: 0, over35: 0 };
    current.matches += 1;
    if (isOver35) current.over35 += 1;
    teamStats.set(r.teamId, current);
  }

  const teamIds = Array.from(teamStats.keys());
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, crestUrl: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const teamRows: LeagueCornersTeamRow[] = [];
  for (const [teamId, stats] of teamStats.entries()) {
    const team = teamById.get(teamId);
    if (!team) continue;
    const pct = stats.matches > 0 ? (stats.over35 / stats.matches) * 100 : null;
    teamRows.push({
      teamId,
      name: team.name,
      shortName: team.shortName ?? null,
      crestUrl: team.crestUrl ?? null,
      matches: stats.matches,
      over35: stats.over35,
      over35Pct: pct,
    });
  }

  teamRows.sort((a, b) => {
    if (b.over35Pct == null && a.over35Pct == null) return a.name.localeCompare(b.name);
    if (b.over35Pct == null) return -1;
    if (a.over35Pct == null) return 1;
    if (b.over35Pct !== a.over35Pct) return b.over35Pct - a.over35Pct;
    return a.name.localeCompare(b.name);
  });

  const over35Pct = totalRows > 0 ? (over35 / totalRows) * 100 : null;
  const over45Pct = totalRows > 0 ? (over45 / totalRows) * 100 : null;
  const over55Pct = totalRows > 0 ? (over55 / totalRows) * 100 : null;

  const recentRowsRaw = rows
    .slice()
    .sort((a, b) => a.fixtureDate.getTime() - b.fixtureDate.getTime())
    .slice(-25)
    .reverse();
  const recentRows: LeagueCornersFixtureSummary[] = recentRowsRaw.map((r) => {
    const team = teamById.get(r.teamId);
    const name = team ? team.shortName ?? team.name : "Team";
    const corners = r.corners ?? 0;
    return {
      apiFixtureId: r.apiFixtureId,
      date: r.fixtureDate.toISOString(),
      teamName: name,
      corners,
      over35: corners > 3.5,
    };
  });

  return {
    leagueId,
    leagueName,
    season: API_SEASON,
    totalRows,
    over35,
    over35Pct,
    over45,
    over45Pct,
    over55,
    over55Pct,
    teams: teamRows,
    recentRows,
  };
}

export const getLeagueCornersMarketData = unstable_cache(
  async (leagueId: number) => {
    return loadLeagueCornersMarketData(leagueId);
  },
  ["league-corners-market"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

type LeagueCardsTeamRow = {
  teamId: number;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  matches: number;
  over15: number;
  over15Pct: number | null;
};

type LeagueCardsFixtureSummary = {
  apiFixtureId: string;
  date: string;
  teamName: string;
  cards: number;
  over15: boolean;
};

export type LeagueCardsMarketData = {
  leagueId: number;
  leagueName: string;
  season: string;
  totalRows: number;
  over15: number;
  over15Pct: number | null;
  over25: number;
  over25Pct: number | null;
  over35: number;
  over35Pct: number | null;
  teams: LeagueCardsTeamRow[];
  recentRows: LeagueCardsFixtureSummary[];
};

async function loadLeagueCardsMarketData(leagueId: number): Promise<LeagueCardsMarketData | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) return null;
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId];
  if (!leagueName) return null;

  const cacheKey = String(leagueId);

  const rows = await prisma.teamFixtureCache.findMany({
    where: {
      season: API_SEASON,
      league: cacheKey,
    },
    select: {
      teamId: true,
      apiFixtureId: true,
      fixtureDate: true,
      yellowCards: true,
      redCards: true,
    },
  });

  if (rows.length === 0) {
    return null;
  }

  const teamStats = new Map<
    number,
    { matches: number; over15: number }
  >();

  let totalRows = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;

  for (const r of rows) {
    const cards = (r.yellowCards ?? 0) + (r.redCards ?? 0);
    const isOver15 = cards > 1.5;
    const isOver25 = cards > 2.5;
    const isOver35 = cards > 3.5;
    totalRows += 1;
    if (isOver15) over15 += 1;
    if (isOver25) over25 += 1;
    if (isOver35) over35 += 1;

    const current = teamStats.get(r.teamId) ?? { matches: 0, over15: 0 };
    current.matches += 1;
    if (isOver15) current.over15 += 1;
    teamStats.set(r.teamId, current);
  }

  const teamIds = Array.from(teamStats.keys());
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, crestUrl: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const teamRows: LeagueCardsTeamRow[] = [];
  for (const [teamId, stats] of teamStats.entries()) {
    const team = teamById.get(teamId);
    if (!team) continue;
    const pct = stats.matches > 0 ? (stats.over15 / stats.matches) * 100 : null;
    teamRows.push({
      teamId,
      name: team.name,
      shortName: team.shortName ?? null,
      crestUrl: team.crestUrl ?? null,
      matches: stats.matches,
      over15: stats.over15,
      over15Pct: pct,
    });
  }

  teamRows.sort((a, b) => {
    if (b.over15Pct == null && a.over15Pct == null) return a.name.localeCompare(b.name);
    if (b.over15Pct == null) return -1;
    if (a.over15Pct == null) return 1;
    if (b.over15Pct !== a.over15Pct) return b.over15Pct - a.over15Pct;
    return a.name.localeCompare(b.name);
  });

  const over15Pct = totalRows > 0 ? (over15 / totalRows) * 100 : null;
  const over25Pct = totalRows > 0 ? (over25 / totalRows) * 100 : null;
  const over35Pct = totalRows > 0 ? (over35 / totalRows) * 100 : null;

  const recentRowsRaw = rows
    .slice()
    .sort((a, b) => a.fixtureDate.getTime() - b.fixtureDate.getTime())
    .slice(-25)
    .reverse();

  const recentRows: LeagueCardsFixtureSummary[] = recentRowsRaw.map((r) => {
    const team = teamById.get(r.teamId);
    const name = team ? team.shortName ?? team.name : "Team";
    const cards = (r.yellowCards ?? 0) + (r.redCards ?? 0);
    return {
      apiFixtureId: r.apiFixtureId,
      date: r.fixtureDate.toISOString(),
      teamName: name,
      cards,
      over15: cards > 1.5,
    };
  });

  return {
    leagueId,
    leagueName,
    season: API_SEASON,
    totalRows,
    over15,
    over15Pct,
    over25,
    over25Pct,
    over35,
    over35Pct,
    teams: teamRows,
    recentRows,
  };
}

export const getLeagueCardsMarketData = unstable_cache(
  async (leagueId: number) => {
    return loadLeagueCardsMarketData(leagueId);
  },
  ["league-cards-market"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

