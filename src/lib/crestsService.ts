import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchTeamLogo } from "@/lib/footballApi";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

/**
 * Get all teams that appear in fixtures for our chosen tournaments (REQUIRED_LEAGUE_IDS),
 * then fetch each team's crest from the API and store it in the DB.
 * Only updates teams that have an apiId.
 */
export async function refreshTeamCrests(): Promise<{ updated: number; failed: number }> {
  const leagueIds = [...REQUIRED_LEAGUE_IDS];

  const teamIds = await prisma.fixture.findMany({
    where: { leagueId: { in: leagueIds } },
    select: { homeTeamId: true, awayTeamId: true },
    distinct: ["homeTeamId", "awayTeamId"],
  });

  const uniqueTeamIds = [...new Set(teamIds.flatMap((f) => [f.homeTeamId, f.awayTeamId]))];
  const teams = await prisma.team.findMany({
    where: { id: { in: uniqueTeamIds }, apiId: { not: null } },
    select: { id: true, apiId: true, name: true },
  });

  let updated = 0;
  let failed = 0;

  for (const team of teams) {
    const apiId = team.apiId!;
    try {
      const logoUrl = await fetchTeamLogo(apiId);
      await prisma.team.update({
        where: { id: team.id },
        data: { crestUrl: logoUrl },
      });
      if (logoUrl) updated++;
    } catch (err) {
      failed++;
      console.error(`[crestsService] Failed to fetch crest for team ${team.id} (apiId ${apiId}):`, err);
    }
  }

  console.log(`[crestsService] Crest refresh done: ${updated} updated, ${failed} failed (${teams.length} teams in chosen leagues)`);
  return { updated, failed };
}
