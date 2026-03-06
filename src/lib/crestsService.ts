import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchTeamLogo, fetchStandings } from "@/lib/footballApi";
import { REQUIRED_LEAGUE_IDS, STANDINGS_LEAGUE_IDS } from "@/lib/leagues";

/**
 * Get all teams that appear in (1) today's fixtures and (2) upcoming fixtures (next 14 days),
 * then fetch each team's crest from the API and store it in the DB.
 * Crests are stored on Team and kept for as long as the team is referenced (today or upcoming).
 */
export async function refreshTeamCrests(options?: {
  /** Limit how many teams to process per invocation (prevents serverless timeouts). */
  maxTeams?: number;
  /** When true, only fetch crests for teams missing a crestUrl. Default true. */
  onlyMissing?: boolean;
}): Promise<{
  updated: number;
  failed: number;
  total: number;
  processed: number;
  remaining: number;
}> {
  const leagueIds = [...REQUIRED_LEAGUE_IDS];

  const [fixtureTeams, upcomingRows] = await Promise.all([
    prisma.fixture.findMany({
      where: { leagueId: { in: leagueIds } },
      select: { homeTeamId: true, awayTeamId: true },
    }),
    prisma.upcomingFixture.findMany({
      select: { homeTeamApiId: true, awayTeamApiId: true },
    }),
  ]);

  const uniqueTeamIds = [...new Set(fixtureTeams.flatMap((f) => [f.homeTeamId, f.awayTeamId]))];
  const upcomingApiIds = [
    ...new Set(upcomingRows.flatMap((u) => [u.homeTeamApiId, u.awayTeamApiId]).filter(Boolean)),
  ];

  const orConditions: Array<{ id: { in: number[] }; apiId: { not: null } } | { apiId: { in: string[] } }> = [];
  if (uniqueTeamIds.length > 0) {
    orConditions.push({ id: { in: uniqueTeamIds }, apiId: { not: null } });
  }
  if (upcomingApiIds.length > 0) {
    orConditions.push({ apiId: { in: upcomingApiIds } });
  }
  if (orConditions.length === 0) {
    return { updated: 0, failed: 0, total: 0, processed: 0, remaining: 0 };
  }

  let teams = await prisma.team.findMany({
    where: { OR: orConditions },
    select: { id: true, apiId: true, name: true, crestUrl: true },
  });

  const existingApiIds = new Set(teams.map((t) => t.apiId).filter(Boolean));
  for (const apiId of upcomingApiIds) {
    if (existingApiIds.has(apiId)) continue;
    try {
      const created = await prisma.team.upsert({
        where: { apiId },
        update: {},
        create: { apiId, name: `Team ${apiId}` },
        select: { id: true, apiId: true, name: true, crestUrl: true },
      });
      teams = [...teams, created];
      existingApiIds.add(apiId);
    } catch {
      // apiId might already exist from a race, or invalid
    }
  }

  const teamsWithApiId = teams.filter((t): t is typeof t & { apiId: string } => t.apiId != null);
  const onlyMissing = options?.onlyMissing ?? true;
  const candidateTeams = onlyMissing
    ? teamsWithApiId.filter((t) => !t.crestUrl || String(t.crestUrl).trim() === "")
    : teamsWithApiId;
  const maxTeams =
    typeof options?.maxTeams === "number" && Number.isFinite(options.maxTeams) && options.maxTeams > 0
      ? Math.floor(options.maxTeams)
      : undefined;
  const toProcess = maxTeams ? candidateTeams.slice(0, maxTeams) : candidateTeams;
  let updated = 0;
  let failed = 0;

  for (const team of toProcess) {
    try {
      const logoUrl = await fetchTeamLogo(team.apiId);
      await prisma.team.update({
        where: { id: team.id },
        data: { crestUrl: logoUrl },
      });
      if (logoUrl) updated++;
    } catch (err) {
      failed++;
      console.error("[crestsService] Failed to fetch crest for team", team.id, team.apiId, err);
    }
  }

  return {
    updated,
    failed,
    total: candidateTeams.length,
    processed: toProcess.length,
    remaining: Math.max(0, candidateTeams.length - toProcess.length),
  };
}

/** Minimal type for LeagueCrestCache delegate (Prisma client has this after `npx prisma generate`). */
type LeagueCrestCacheDelegate = {
  findMany: (args: {
    where: { leagueId: { in: number[] } };
    select: { leagueId: true };
  }) => Promise<{ leagueId: number }[]>;
  findUnique: (args: {
    where: { leagueId: number };
    select: { crestUrl: true };
  }) => Promise<{ crestUrl: string } | null>;
  upsert: (args: {
    where: { leagueId: number };
    create: { leagueId: number; crestUrl: string };
    update: { crestUrl: string };
  }) => Promise<unknown>;
};

const leagueCrestCache = (prisma as unknown as { leagueCrestCache?: LeagueCrestCacheDelegate })
  .leagueCrestCache;

/**
 * Fetch league crests from the standings API (one-off per league) and store in LeagueCrestCache.
 * Only calls the API for leagues that don't already have a crest in the DB.
 * No-op if Prisma client has no leagueCrestCache (run `npx prisma generate`).
 */
export async function refreshLeagueCrests(): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}> {
  if (!leagueCrestCache) {
    return { updated: 0, skipped: 0, failed: 0, total: STANDINGS_LEAGUE_IDS.length };
  }

  const leagueIds = [...STANDINGS_LEAGUE_IDS];
  if (leagueIds.length === 0) return { updated: 0, skipped: 0, failed: 0, total: 0 };

  const existing = await leagueCrestCache.findMany({
    where: { leagueId: { in: leagueIds } },
    select: { leagueId: true },
  });
  const existingSet = new Set(existing.map((r) => r.leagueId));
  const toFetch = leagueIds.filter((id) => !existingSet.has(id));

  let updated = 0;
  let failed = 0;

  for (const leagueId of toFetch) {
    try {
      const response = await fetchStandings(leagueId);
      const first = response?.[0];
      const league = first?.league as { logo?: string } | undefined;
      const logoUrl =
        typeof league?.logo === "string" && league.logo.length > 0 ? league.logo : null;
      if (logoUrl) {
        await leagueCrestCache.upsert({
          where: { leagueId },
          create: { leagueId, crestUrl: logoUrl },
          update: { crestUrl: logoUrl },
        });
        updated++;
      }
    } catch (err) {
      failed++;
      console.error("[crestsService] Failed to fetch league crest", leagueId, err);
    }
  }

  return {
    updated,
    skipped: existingSet.size,
    failed,
    total: leagueIds.length,
  };
}

/** Get cached league crest URL for standings page. Returns null if not yet warmed or table missing. */
export async function getLeagueCrestUrl(leagueId: number): Promise<string | null> {
  if (!leagueCrestCache) return null;
  const row = await leagueCrestCache.findUnique({
    where: { leagueId },
    select: { crestUrl: true },
  });
  return row?.crestUrl ?? null;
}
