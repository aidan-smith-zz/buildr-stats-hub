/**
 * Quick check: do we have any TeamSeasonStats / TeamFixtureCache, and what do today's fixtures look like?
 * Usage: npx tsx scripts/check-team-stats.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getTodayBounds() {
  const tz = "Europe/London";
  const now = new Date();
  const dateKey = now.toLocaleDateString("en-CA", { timeZone: tz });
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const nextDay = new Date(dayEnd.getTime() + 1).toISOString().slice(0, 10);
  const spilloverEnd = new Date(`${nextDay}T00:59:59.999Z`);
  return { dayStart, spilloverEnd };
}

async function main() {
  const [statsCount, cacheCount, todayFixtures] = await Promise.all([
    prisma.teamSeasonStats.count(),
    prisma.teamFixtureCache.count(),
    prisma.fixture.findMany({
      where: (() => {
        const { dayStart, spilloverEnd } = getTodayBounds();
        return { date: { gte: dayStart, lte: spilloverEnd } };
      })(),
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: "asc" },
      take: 25,
    }),
  ]);

  console.log("--- Team stats in DB ---");
  console.log("TeamSeasonStats rows:", statsCount);
  console.log("TeamFixtureCache rows:", cacheCount);
  console.log("");
  console.log("--- Today's fixtures (sample) ---");
  const fixtures = todayFixtures as Array<{ id: number; league: string | null; leagueId: number | null; season: string; homeTeamId: number; awayTeamId: number; homeTeam: { name: string }; awayTeam: { name: string } }>;
  for (const f of fixtures) {
    const homeHas = await prisma.teamSeasonStats.findFirst({ where: { teamId: f.homeTeamId, season: f.season } });
    const awayHas = await prisma.teamSeasonStats.findFirst({ where: { teamId: f.awayTeamId, season: f.season } });
    console.log(
      `  id=${f.id} league="${f.league ?? "null"}" leagueId=${f.leagueId ?? "null"} season=${f.season} | ${f.homeTeam.name} vs ${f.awayTeam.name} | homeStats=${homeHas ? "YES" : "NO"} awayStats=${awayHas ? "YES" : "NO"}`
    );
  }
  if (fixtures.length === 0) {
    console.log("  (no fixtures for today in DB)");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
