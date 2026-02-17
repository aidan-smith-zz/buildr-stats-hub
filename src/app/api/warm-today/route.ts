import { NextResponse } from "next/server";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { getFixtureStats } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

/**
 * GET /api/warm-today
 * Warms the cache for today's fixtures by loading stats for each.
 * Call this once in the morning (or via npm run warm-today which hits this route).
 * May take several minutes if many fixtures need API calls (rate-limited).
 */
export async function GET() {
  const now = new Date();
  try {
    const fixtures = await getOrRefreshTodayFixtures(now);
    const filtered = fixtures.filter(
      (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
    );

    if (filtered.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No fixtures for today in the selected leagues.",
        warmed: 0,
        results: [],
      });
    }

    const results: { fixtureId: number; label: string; ok: boolean; elapsedSec: number; error?: string }[] = [];

    for (let i = 0; i < filtered.length; i++) {
      const f = filtered[i];
      const label = `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`;
      const start = Date.now();
      try {
        const stats = await getFixtureStats(f.id);
        const elapsedSec = (Date.now() - start) / 1000;
        results.push({ fixtureId: f.id, label, ok: !!stats, elapsedSec });
      } catch (err) {
        const elapsedSec = (Date.now() - start) / 1000;
        results.push({
          fixtureId: f.id,
          label,
          ok: false,
          elapsedSec,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Warmed ${results.filter((r) => r.ok).length}/${filtered.length} fixtures.`,
      warmed: results.filter((r) => r.ok).length,
      total: filtered.length,
      results,
    });
  } catch (err) {
    console.error("[warm-today] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
