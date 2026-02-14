import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears cached player season stats so the app will refetch from the API.
 * Run this after upgrading your API plan or changing USE_MOCK_PLAYERS_FALLBACK.
 *
 * Usage: npx tsx scripts/clear-player-stats.ts
 */
async function clearPlayerStats() {
  try {
    console.log("Clearing cached player season stats...");
    const result = await prisma.playerSeasonStats.deleteMany({});
    console.log(`Deleted ${result.count} player season stats rows`);
    console.log("✅ Done. Load a fixture again to refetch real player data from the API.");
  } catch (error) {
    console.error("Error clearing player stats:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearPlayerStats();
