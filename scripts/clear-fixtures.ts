import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearFixtures() {
  try {
    console.log("Clearing all fixtures from database...");
    
    // Delete all fixtures (this will cascade delete related data if needed)
    const deletedFixtures = await prisma.fixture.deleteMany({});
    console.log(`Deleted ${deletedFixtures.count} fixtures`);
    
    // Optionally clear teams that are no longer referenced
    // Note: This might delete teams that are referenced by other data
    // Uncomment if you want to clear teams too
    // const deletedTeams = await prisma.team.deleteMany({});
    // console.log(`Deleted ${deletedTeams.count} teams`);
    
    // Clear API fetch logs (this forces fresh API calls)
    const deletedLogs = await prisma.apiFetchLog.deleteMany({});
    console.log(`Deleted ${deletedLogs.count} API fetch logs`);
    
    // Also clear the in-memory cache
    console.log("Note: You may need to restart your dev server to clear the in-memory cache");
    
    console.log("✅ Database cleared successfully!");
  } catch (error) {
    console.error("Error clearing fixtures:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearFixtures();
