import { prisma } from "@/lib/prisma";
import { fetchStandings, API_SEASON, type StandingsResponseItem } from "@/lib/footballApi";

/** Max age of cached standings before we refresh from API (5 hours). */
const STANDINGS_CACHE_MAX_AGE_MS = 5 * 60 * 60 * 1000;

/** Minimal type for LeagueStandingsCache delegate (Prisma client has this after `npx prisma generate`). */
type LeagueStandingsCacheDelegate = {
  findUnique: (args: {
    where: { leagueId_season: { leagueId: number; season: string } };
  }) => Promise<{
    updatedAt: Date;
    payload: unknown;
  } | null>;
  upsert: (args: {
    where: { leagueId_season: { leagueId: number; season: string } };
    create: { leagueId: number; season: string; payload: object; updatedAt: Date };
    update: { payload: object; updatedAt: Date };
  }) => Promise<unknown>;
};

const standingsCache = (prisma as unknown as { leagueStandingsCache?: LeagueStandingsCacheDelegate })
  .leagueStandingsCache;

function getStandingsCache() {
  if (!standingsCache) {
    throw new Error(
      "Prisma client is missing leagueStandingsCache. Run: npx prisma generate. Then restart the dev server.",
    );
  }
  return standingsCache;
}

export type StandingsData = {
  leagueId: number;
  leagueName: string;
  season: string;
  updatedAt: Date;
  tables: Array<{
    group?: string;
    rows: Array<{
      rank: number;
      teamId: number;
      teamName: string;
      logo: string | null;
      points: number;
      goalsDiff: number;
      played: number;
      win: number;
      draw: number;
      lose: number;
      goalsFor: number;
      goalsAgainst: number;
    }>;
  }>;
};

type StandingRow = StandingsResponseItem["standings"] extends (infer R)[] | undefined ? R : never;

function normalizeStandingsRows(standings: unknown): StandingRow[] {
  if (!Array.isArray(standings) || standings.length === 0) return [];
  const first = standings[0];
  if (Array.isArray(first)) {
    return standings.flat() as StandingRow[];
  }
  return standings as StandingRow[];
}

function parseApiStandings(response: StandingsResponseItem[]): StandingsData | null {
  if (!response?.length) return null;
  const first = response[0];
  const league = first?.league;
  const rawStandings =
    (first?.league as { standings?: unknown } | undefined)?.standings ?? first?.standings;
  const standings = normalizeStandingsRows(rawStandings);
  if (!league || standings.length === 0) return null;

  const tables: StandingsData["tables"] = [];
  const byGroup = new Map<string | undefined, StandingRow[]>();
  for (const row of standings) {
    if (!row || typeof row !== "object") continue;
    const group = (row as StandingRow).group ?? undefined;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(row as StandingRow);
  }
  const groups = Array.from(byGroup.entries()).sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""));
  for (const [, rows] of groups) {
    tables.push({
      group: groups.length > 1 ? (rows[0]?.group ?? undefined) : undefined,
      rows: rows.map((r) => ({
        rank: r.rank ?? 0,
        teamId: r.team?.id ?? 0,
        teamName: r.team?.name ?? "—",
        logo: typeof r.team?.logo === "string" && r.team.logo ? r.team.logo : null,
        points: r.points ?? 0,
        goalsDiff: r.goalsDiff ?? 0,
        played: r.all?.played ?? 0,
        win: r.all?.win ?? 0,
        draw: r.all?.draw ?? 0,
        lose: r.all?.lose ?? 0,
        goalsFor: r.all?.goals?.for ?? 0,
        goalsAgainst: r.all?.goals?.against ?? 0,
      })),
    });
  }

  return {
    leagueId: league.id,
    leagueName: league.name,
    season: String(league.season ?? API_SEASON),
    updatedAt: new Date(),
    tables,
  };
}

/**
 * Get standings for a league. Uses cache if present and younger than 5 hours;
 * otherwise fetches from API, stores in LeagueStandingsCache, and returns.
 * At most one API call per league per 5 hours.
 */
export async function getOrRefreshStandings(
  leagueId: number,
  season: string = API_SEASON,
): Promise<StandingsData | null> {
  const cache = getStandingsCache();
  const cached = await cache.findUnique({
    where: { leagueId_season: { leagueId, season } },
  });

  const now = new Date();
  const cacheAgeMs = cached ? now.getTime() - cached.updatedAt.getTime() : Infinity;
  const useCache = cached && cacheAgeMs < STANDINGS_CACHE_MAX_AGE_MS;

  if (useCache && cached.payload && typeof cached.payload === "object") {
    const parsed = parseApiStandings(cached.payload as StandingsResponseItem[]);
    if (parsed) {
      return { ...parsed, updatedAt: cached.updatedAt };
    }
  }

  try {
    const response = await fetchStandings(leagueId, season);
    const parsed = parseApiStandings(response);
    if (!parsed) return null;

    const payload = JSON.parse(JSON.stringify(response)) as object;
    await getStandingsCache().upsert({
      where: { leagueId_season: { leagueId, season } },
      create: { leagueId, season, payload, updatedAt: now },
      update: { payload, updatedAt: now },
    });

    return { ...parsed, updatedAt: now };
  } catch (err) {
    console.error("[standingsService] fetchStandings failed", { leagueId, season, error: err });
    if (cached?.payload && typeof cached.payload === "object") {
      const parsed = parseApiStandings(cached.payload as StandingsResponseItem[]);
      if (parsed) return { ...parsed, updatedAt: cached.updatedAt };
    }
    return null;
  }
}
