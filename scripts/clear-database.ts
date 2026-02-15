import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clears the database completely for a fresh start.
 * Deletes: PlayerSeasonStats → Player → Fixture → Team → ApiFetchLog
 *
 * Usage: npx tsx scripts/clear-database.ts
 */
async function clearDatabase() {
  try {
    console.log("Clearing database completely...");

    const [stats, players, fixtures, teams, logs] = await prisma.$transaction([
      prisma.playerSeasonStats.deleteMany({}),
      prisma.player.deleteMany({}),
      prisma.fixture.deleteMany({}),
      prisma.team.deleteMany({}),
      prisma.apiFetchLog.deleteMany({}),
    ]);

    console.log(`  PlayerSeasonStats: ${stats.count}`);
    console.log(`  Players: ${players.count}`);
    console.log(`  Fixtures: ${fixtures.count}`);
    console.log(`  Teams: ${teams.count}`);
    console.log(`  ApiFetchLog: ${logs.count}`);
    console.log("✅ Database cleared. Restart your dev server to clear in-memory cache, then load the app for a fresh start.");
  } catch (error) {
    console.error("Error clearing database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
