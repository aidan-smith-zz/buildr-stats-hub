import "./load-env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears all DB data used for team stats so the next warm/refresh will refetch everything.
 * Deletes: TeamFixtureCache, TeamSeasonStats, teamSeasonCorners fetch logs, and MatchdayInsightsCache
 * (so matchday-insights doesn't keep showing stale corners/xG from before the clear).
 *
 * Usage: npx tsx scripts/clear-team-stats-data.ts
 */
async function clearTeamStatsData() {
  try {
    console.log("Clearing all team stats data...");

    const [cache, stats, logs, matchdayCache] = await prisma.$transaction([
      prisma.teamFixtureCache.deleteMany({}),
      prisma.teamSeasonStats.deleteMany({}),
      prisma.apiFetchLog.deleteMany({
        where: { resource: { startsWith: "teamSeasonCorners:" } },
      }),
      prisma.matchdayInsightsCache.deleteMany({}),
    ]);

    console.log(`  TeamFixtureCache: ${cache.count}`);
    console.log(`  TeamSeasonStats: ${stats.count}`);
    console.log(`  ApiFetchLog (teamSeasonCorners): ${logs.count}`);
    console.log(`  MatchdayInsightsCache: ${matchdayCache.count}`);
    console.log("✅ Done. Run warm-today to refetch team stats.");
  } catch (error) {
    console.error("Error clearing team stats data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearTeamStatsData();
