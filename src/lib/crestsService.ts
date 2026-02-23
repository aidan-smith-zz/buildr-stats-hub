import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchTeamLogo } from "@/lib/footballApi";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

/**
 * Get all teams that appear in (1) today's fixtures and (2) upcoming fixtures (next 14 days),
 * then fetch each team's crest from the API and store it in the DB.
 * Crests are stored on Team and kept for as long as the team is referenced (today or upcoming).
 */
export async function refreshTeamCrests(): Promise<{ updated: number; failed: number; total: number }> {
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
    return { updated: 0, failed: 0, total: 0 };
  }

  let teams = await prisma.team.findMany({
    where: { OR: orConditions },
    select: { id: true, apiId: true, name: true },
  });

  const existingApiIds = new Set(teams.map((t) => t.apiId).filter(Boolean));
  for (const apiId of upcomingApiIds) {
    if (existingApiIds.has(apiId)) continue;
    try {
      const created = await prisma.team.upsert({
        where: { apiId },
        update: {},
        create: { apiId, name: `Team ${apiId}` },
        select: { id: true, apiId: true, name: true },
      });
      teams = [...teams, created];
      existingApiIds.add(apiId);
    } catch {
      // apiId might already exist from a race, or invalid
    }
  }

  const teamsWithApiId = teams.filter((t): t is typeof t & { apiId: string } => t.apiId != null);
  let updated = 0;
  let failed = 0;

  for (const team of teamsWithApiId) {
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

  return { updated, failed, total: teamsWithApiId.length };
}
