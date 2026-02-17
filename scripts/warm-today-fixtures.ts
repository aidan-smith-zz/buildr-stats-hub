/**
 * Warm the cache for today's fixtures by loading stats for each one.
 * Run once in the morning (e.g. after opening the app to load today's fixture list).
 * Stats are cached in the DB, so later visits will be fast.
 *
 * Usage: npm run warm-today
 */

import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { prisma } from "@/lib/prisma";
import { getFixtureStats } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

async function main() {
  const now = new Date();
  console.log(`[warm-today] Loading today's fixtures (${now.toLocaleDateString("en-GB", { timeZone: "Europe/London" })})...`);

  const fixtures = await getOrRefreshTodayFixtures(now);
  const filtered = fixtures.filter(
    (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
  );

  if (filtered.length === 0) {
    console.log("[warm-today] No fixtures for today in the selected leagues. Nothing to warm.");
    return;
  }

  console.log(`[warm-today] Found ${filtered.length} fixture(s). Loading stats for each (this may take a few minutes due to rate limiting)...\n`);

  for (let i = 0; i < filtered.length; i++) {
    const f = filtered[i];
    const label = `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`;
    console.log(`[warm-today] (${i + 1}/${filtered.length}) ${label} ...`);
    const start = Date.now();
    try {
      const stats = await getFixtureStats(f.id);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (stats) {
        console.log(`[warm-today]   ✓ done in ${elapsed}s`);
      } else {
        console.log(`[warm-today]   ⚠ no stats (${elapsed}s)`);
      }
    } catch (err) {
      console.error(`[warm-today]   ✗ error:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\n[warm-today] Done. Today's fixtures are warmed; opening the app later will be fast.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[warm-today] Fatal:", err);
    prisma.$disconnect();
    process.exit(1);
  });
