import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { LEAGUE_DISPLAY_NAMES, REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { makeTeamSlug, normalizeTeamSlug } from "@/lib/teamSlugs";
import { todayDateKey } from "@/lib/slugs";

const REQUIRED_LEAGUE_KEYS = REQUIRED_LEAGUE_IDS.map((id) => LEAGUE_DISPLAY_NAMES[id]).filter(
  (name): name is string => Boolean(name),
);
/** TeamFixtureCache stores league as String(leagueId); use for recent fixtures from warm data. */
const REQUIRED_LEAGUE_CACHE_KEYS = REQUIRED_LEAGUE_IDS.map((id) => String(id));
const TEAM_SLUG_ALIASES: Record<string, string[]> = {
  // Common Bayern variants users type/click.
  "bayern-mnchen": ["bayern-munchen", "bayern-muenchen", "bayern-munich"],
  "bayern-muenchen": ["bayern-munchen", "bayern-munich"],
  "bayern-munchen": ["bayern-muenchen", "bayern-munich"],
};

type TeamSeasonRow = {
  teamId: number;
  season: string;
  league: string;
  leagueId?: number | null;
  minutesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  corners: number;
  yellowCards: number;
  redCards: number;
  homeGames: number;
  awayGames: number;
  homeGoalsFor: number;
  homeCorners: number;
  homeYellowCards: number;
  homeRedCards: number;
  awayGoalsFor: number;
  awayCorners: number;
  awayYellowCards: number;
  awayRedCards: number;
};

export type TeamPageHomeAwayProfile = {
  homeGames: number;
  awayGames: number;
  homeGoalsPerMatch: number;
  homeCornersPerMatch: number;
  homeCardsPerMatch: number;
  awayGoalsPerMatch: number;
  awayCornersPerMatch: number;
  awayCardsPerMatch: number;
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
  /** Team-specific stats from TeamFixtureCache when available (null when using Fixture fallback). */
  teamCorners: number | null;
  teamCards: number | null;
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
  /** Home vs away season splits (goals, corners, cards per match). Only set when warmed and enough games. */
  homeAwayProfile: TeamPageHomeAwayProfile | null;
  recentFixtures: TeamPageFixtureSummary[];
  keyPlayers: TeamPagePlayerSummary[];
};

export type TeamIdentity = {
  id: number;
  name: string;
  shortName: string | null;
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

  // Find this team's season stats for tracked leagues (by display name or leagueId so we
  // include rows stored as "EFL Championship" etc. from fixture warm).
  const seasonRows = await prisma.teamSeasonStats.findMany({
    where: {
      teamId,
      season: API_SEASON,
      OR: [
        { league: { in: REQUIRED_LEAGUE_KEYS } },
        { leagueId: { in: REQUIRED_LEAGUE_IDS as unknown as number[] } },
      ],
    },
  });

  if (seasonRows.length === 0) {
    // Not in tracked leagues for this season – no dedicated page.
    return null;
  }

  // If a team somehow has multiple top-league rows, pick the one with the most minutes (primary league).
  const primarySeasonRow = seasonRows.reduce((best, row) =>
    !best || row.minutesPlayed > best.minutesPlayed ? row : best,
  ) as TeamSeasonRow;

  const leagueName = primarySeasonRow.league;
  const leagueId = primarySeasonRow.leagueId ?? null;

  const homeGames = primarySeasonRow.homeGames ?? 0;
  const awayGames = primarySeasonRow.awayGames ?? 0;
  const hasEnoughHome = homeGames >= 3;
  const hasEnoughAway = awayGames >= 3;
  const homeAwayProfile: TeamPageHomeAwayProfile | null =
    (hasEnoughHome || hasEnoughAway) &&
    (homeGames > 0 || awayGames > 0)
      ? {
          homeGames,
          awayGames,
          homeGoalsPerMatch: homeGames > 0 ? primarySeasonRow.homeGoalsFor / homeGames : 0,
          homeCornersPerMatch: homeGames > 0 ? primarySeasonRow.homeCorners / homeGames : 0,
          homeCardsPerMatch:
            homeGames > 0
              ? (primarySeasonRow.homeYellowCards + primarySeasonRow.homeRedCards) / homeGames
              : 0,
          awayGoalsPerMatch: awayGames > 0 ? primarySeasonRow.awayGoalsFor / awayGames : 0,
          awayCornersPerMatch: awayGames > 0 ? primarySeasonRow.awayCorners / awayGames : 0,
          awayCardsPerMatch:
            awayGames > 0
              ? (primarySeasonRow.awayYellowCards + primarySeasonRow.awayRedCards) / awayGames
              : 0,
        }
      : null;

  // Recent fixtures: prefer TeamFixtureCache (populated by warm-league-stats) so team/market pages have data.
  // Fall back to Fixture + LiveScoreCache only when cache is empty (e.g. before first warm).
  const cacheRows = await prisma.teamFixtureCache.findMany({
    where: {
      teamId,
      season: API_SEASON,
      league: { in: REQUIRED_LEAGUE_CACHE_KEYS },
    },
    orderBy: { fixtureDate: "desc" },
    take: 10,
  });

  let recentFixtures: TeamPageFixtureSummary[];

  if (cacheRows.length > 0) {
    const apiIds = cacheRows.map((r) => r.apiFixtureId);
    const fixturesByApiId = new Map<
      string,
      { homeTeam: { name: string; shortName: string | null }; awayTeam: { name: string; shortName: string | null } }
    >();
    const fixturesFound = await prisma.fixture.findMany({
      where: { apiId: { in: apiIds } },
      select: {
        apiId: true,
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
    });
    for (const f of fixturesFound) {
      if (f.apiId) fixturesByApiId.set(f.apiId, { homeTeam: f.homeTeam, awayTeam: f.awayTeam });
    }

    recentFixtures = cacheRows.map((r) => {
      const isHome = r.isHome;
      const homeGoals = isHome ? r.goalsFor : r.goalsAgainst;
      const awayGoals = isHome ? r.goalsAgainst : r.goalsFor;
      const fixture = fixturesByApiId.get(r.apiFixtureId);
      const opponent = fixture
        ? (isHome ? fixture.awayTeam.shortName ?? fixture.awayTeam.name : fixture.homeTeam.shortName ?? fixture.homeTeam.name)
        : "—";
      const leagueDisplay = LEAGUE_DISPLAY_NAMES[Number(r.league) as keyof typeof LEAGUE_DISPLAY_NAMES] ?? r.league;
      return {
        id: r.id,
        date: r.fixtureDate instanceof Date ? r.fixtureDate.toISOString() : new Date(r.fixtureDate).toISOString(),
        league: leagueDisplay,
        opponentName: opponent,
        isHome,
        homeGoals,
        awayGoals,
        statusShort: "FT",
        teamCorners: r.corners ?? 0,
        teamCards: (r.yellowCards ?? 0) + (r.redCards ?? 0),
      };
    });
  } else {
    const recentFixturesRaw = await prisma.fixture.findMany({
      where: {
        season: API_SEASON,
        leagueId: { in: REQUIRED_LEAGUE_IDS as unknown as number[] },
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
    recentFixtures = recentFixturesRaw.map((f) => {
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
        teamCorners: null,
        teamCards: null,
      };
    });
  }

  // Key players for this team in the same league + season.
  const playerLeagueKeys = new Set<string>([leagueName]);
  if (leagueId != null) {
    for (const row of seasonRows) {
      if (row.leagueId === leagueId) playerLeagueKeys.add(row.league);
    }
    const displayName = LEAGUE_DISPLAY_NAMES[leagueId];
    if (displayName) {
      playerLeagueKeys.add(displayName);
      playerLeagueKeys.add(`UEFA ${displayName}`);
    }
  }
  const playerLeagueList = Array.from(playerLeagueKeys).filter(Boolean);

  const playerRows = await prisma.playerSeasonStats.findMany({
    where: {
      teamId,
      season: API_SEASON,
      league: playerLeagueList.length > 1 ? { in: playerLeagueList } : leagueName,
      minutes: { gt: 0 },
    },
    include: {
      player: true,
    },
    orderBy: [{ minutes: "desc" }],
  });

  // Same player can appear in multiple rows when `league` strings differ (e.g. API variants for one
  // competition). Summing those would double-count goals/minutes. Pick one row per player: prefer
  // the row whose `league` matches this page's primary `leagueName`, else the row with most minutes.
  type PlayerSeasonRowWithPlayer = (typeof playerRows)[number];
  function preferKeyPlayerRow(
    prev: PlayerSeasonRowWithPlayer,
    next: PlayerSeasonRowWithPlayer,
    primaryLeague: string,
  ): PlayerSeasonRowWithPlayer {
    const prevPrimary = prev.league === primaryLeague;
    const nextPrimary = next.league === primaryLeague;
    if (nextPrimary && !prevPrimary) return next;
    if (prevPrimary && !nextPrimary) return prev;
    if (next.minutes !== prev.minutes) return next.minutes > prev.minutes ? next : prev;
    return next.league < prev.league ? next : prev;
  }

  const bestRowByPlayer = new Map<number, PlayerSeasonRowWithPlayer>();
  for (const row of playerRows) {
    const pid = Number(row.player?.id ?? row.playerId);
    if (!Number.isFinite(pid)) continue;

    const existing = bestRowByPlayer.get(pid);
    if (!existing) {
      bestRowByPlayer.set(pid, row);
    } else {
      bestRowByPlayer.set(pid, preferKeyPlayerRow(existing, row, leagueName));
    }
  }

  const keyPlayers: TeamPagePlayerSummary[] = Array.from(bestRowByPlayer.entries())
    .map(([playerId, row]) => ({
      id: playerId,
      name: row.player.name,
      position: row.player.position ?? null,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      shots: row.shots,
      shotsOnTarget: row.shotsOnTarget,
      yellowCards: row.yellowCards,
      redCards: row.redCards,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.id - b.id)
    .slice(0, 12);

  return {
    teamId: team.id,
    teamApiId: team.apiId ?? null,
    name: team.name,
    shortName: team.shortName ?? null,
    crestUrl: team.crestUrl ?? null,
    leagueName,
    season: API_SEASON,
    per90: rowToPer90(primarySeasonRow),
    homeAwayProfile,
    recentFixtures,
    keyPlayers,
  };
}

/** One findMany per day for all slug resolutions (not one per unique slug on cold cache). */
const getTeamsMinimalForSlugLookup = unstable_cache(
  async () =>
    prisma.team.findMany({
      select: { id: true, name: true, shortName: true },
    }),
  ["teams-minimal-slug-lookup"],
  { revalidate: 60 * 60 * 24, tags: ["team-page"] },
);

const resolveTeamIdByNormalizedSlug = unstable_cache(
  async (slug: string) => {
    const slugCandidates = new Set([slug, ...(TEAM_SLUG_ALIASES[slug] ?? [])]);
    const teams = await getTeamsMinimalForSlugLookup();
    if (!teams.length) return null;
    const matches = teams.filter((team) => {
      const nameSlug = normalizeTeamSlug(makeTeamSlug(team.name));
      const shortSlug = team.shortName ? normalizeTeamSlug(team.shortName) : null;
      return slugCandidates.has(nameSlug) || (shortSlug != null && slugCandidates.has(shortSlug));
    });
    if (!matches.length) return null;
    matches.sort((a, b) => a.name.localeCompare(b.name));
    return matches[0].id;
  },
  ["team-id-by-slug"],
  { revalidate: 60 * 60 * 24, tags: ["team-page"] },
);

async function getTeamIdBySlugUncached(rawSlug: string): Promise<number | null> {
  const slug = normalizeTeamSlug(rawSlug);
  if (!slug) return null;
  return resolveTeamIdByNormalizedSlug(slug);
}

/** Resolve team id from URL slug (e.g. "vfb-stuttgart"). Returns null if not found. */
export const getTeamIdBySlug = cache(getTeamIdBySlugUncached);

const loadTeamIdentityById = unstable_cache(
  async (teamId: number) => {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, shortName: true },
    });
    if (!team) return null;
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName ?? null,
    };
  },
  ["team-identity-by-id"],
  { revalidate: 60 * 60 * 24, tags: ["team-page"] },
);

export async function getTeamIdentityById(teamId: number): Promise<TeamIdentity | null> {
  return loadTeamIdentityById(teamId);
}

export const getTeamPageData = unstable_cache(
  async (teamId: number) => {
    return loadTeamPageData(teamId);
  },
  ["team-page-data"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
    tags: ["team-page"],
  },
);

export type TeamUpcomingFixture = {
  dateKey: string;
  kickoff: string;
  league: string | null;
  opponentName: string;
  isHome: boolean;
};

const loadTeamUpcomingFixtures = unstable_cache(
  async (teamId: number) => {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { apiId: true },
    });
    if (!team?.apiId) return [];
    const today = todayDateKey();
    const rows = await prisma.upcomingFixture.findMany({
      where: {
        dateKey: { gte: today },
        OR: [{ homeTeamApiId: team.apiId }, { awayTeamApiId: team.apiId }],
      },
      orderBy: [{ dateKey: "asc" }, { kickoff: "asc" }],
      take: 5,
    });
    return rows.map((r) => {
      const isHome = r.homeTeamApiId === team.apiId;
      const opponentName = isHome ? (r.awayTeamShortName ?? r.awayTeamName) : (r.homeTeamShortName ?? r.homeTeamName);
      return {
        dateKey: r.dateKey,
        kickoff: r.kickoff instanceof Date ? r.kickoff.toISOString() : new Date(r.kickoff).toISOString(),
        league: r.league ?? null,
        opponentName,
        isHome,
      };
    });
  },
  ["team-upcoming-fixtures"],
  { revalidate: 15 * 60, tags: ["team-page"] },
);

/** Upcoming fixtures for this team (from UpcomingFixture table, next 14 days). For market pages. */
export async function getTeamUpcomingFixtures(teamId: number): Promise<TeamUpcomingFixture[]> {
  return loadTeamUpcomingFixtures(teamId);
}

