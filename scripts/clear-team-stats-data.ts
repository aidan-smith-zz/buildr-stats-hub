import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears all DB data used for team stats so the next warm/refresh will refetch everything.
 * Deletes: TeamFixtureCache, TeamSeasonStats, and teamSeasonCorners fetch logs.
 *
 * Usage: npx tsx scripts/clear-team-stats-data.ts
 */
async function clearTeamStatsData() {
  try {
    console.log("Clearing all team stats data...");

    const [cache, stats, logs] = await prisma.$transaction([
      prisma.teamFixtureCache.deleteMany({}),
      prisma.teamSeasonStats.deleteMany({}),
      prisma.apiFetchLog.deleteMany({
        where: { resource: { startsWith: "teamSeasonCorners:" } },
      }),
    ]);

    console.log(`  TeamFixtureCache: ${cache.count}`);
    console.log(`  TeamSeasonStats: ${stats.count}`);
    console.log(`  ApiFetchLog (teamSeasonCorners): ${logs.count}`);
    console.log("✅ Done. Run warm-today to refetch team stats.");
  } catch (error) {
    console.error("Error clearing team stats data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearTeamStatsData();
