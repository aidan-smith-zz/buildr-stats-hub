import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears team season stats cache so the next fixture load will refetch
 * standings + corners/cards from the API. Use this if you're seeing all zeros.
 *
 * Usage: npx tsx scripts/clear-team-stats-cache.ts
 */
async function clearTeamStatsCache() {
  try {
    console.log("Clearing team stats cache...");

    const deletedStats = await prisma.teamSeasonStats.deleteMany({});
    console.log(`  TeamSeasonStats: ${deletedStats.count}`);

    const deletedLogs = await prisma.apiFetchLog.deleteMany({
      where: { resource: { startsWith: "teamSeasonCorners:" } },
    });
    console.log(`  ApiFetchLog (teamSeasonCorners): ${deletedLogs.count}`);

    console.log("✅ Done. Reload a fixture to refetch goals, conceded, corners, and cards.");
  } catch (error) {
    console.error("Error clearing team stats cache:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearTeamStatsCache();
