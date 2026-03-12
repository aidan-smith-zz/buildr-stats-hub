import { NextResponse } from "next/server";
import { getFixturesForDateFromDbOnly } from "@/lib/fixturesService";
import { isFixtureInRequiredLeagues } from "@/lib/leagues";
import { pastDateKeys } from "@/lib/slugs";

/**
 * GET /api/warm-yesterday
 * Returns yesterday's fixture IDs from the Fixture table (Europe/London date).
 * Used by warm-today script to run teamstats for yesterday's matches so TeamFixtureCache
 * gets the new results and team/market pages show "last 10" including yesterday.
 * Only returns fixtures in required leagues. Empty if yesterday had no fixtures in DB.
 */
export async function GET() {
  try {
    const [yesterdayKey] = pastDateKeys(1);
    const fixtures = await getFixturesForDateFromDbOnly(yesterdayKey);
    const filtered = fixtures.filter((f) =>
      isFixtureInRequiredLeagues({ leagueId: f.leagueId, league: f.league })
    );
    const list = filtered.map((f) => ({
      id: f.id,
      label: `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`,
      leagueId: f.leagueId ?? undefined,
    }));
    return NextResponse.json({
      ok: true,
      dateKey: yesterdayKey,
      total: list.length,
      fixtures: list,
    });
  } catch (err) {
    console.error("[warm-yesterday] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
