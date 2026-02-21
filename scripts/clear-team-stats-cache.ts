import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears only the team-stats fetch log so the next refresh will re-run incremental
 * update (only fetches fixtures not already in DB). Season-to-date team stats and
 * TeamFixtureCache are NOT cleared – we keep them permanently.
 *
 * Usage: npx tsx scripts/clear-team-stats-cache.ts
 */
async function clearTeamStatsCache() {
  try {
    console.log("Clearing team stats fetch log (season data is kept)...");

    const deletedLogs = await prisma.apiFetchLog.deleteMany({
      where: { resource: { startsWith: "teamSeasonCorners:" } },
    });
    console.log(`  ApiFetchLog (teamSeasonCorners): ${deletedLogs.count}`);

    console.log("✅ Done. Next refresh will only fetch any missing fixtures.");
  } catch (error) {
    console.error("Error clearing team stats cache:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearTeamStatsCache();
