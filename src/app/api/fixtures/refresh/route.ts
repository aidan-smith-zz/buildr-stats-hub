import { NextResponse } from "next/server";
import { clearTodayFixturesCacheAndData } from "@/lib/fixturesService";

/**
 * POST /api/fixtures/refresh
 * Clears today's fixtures cache and DB data. Next load of the homepage will refetch from the API (with leagueId etc).
 */
export async function POST() {
  try {
    await clearTodayFixturesCacheAndData(new Date());
    return NextResponse.json({ ok: true, message: "Cache cleared. Reload the homepage to refetch fixtures." });
  } catch (err) {
    console.error("[api/fixtures/refresh]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to refresh" },
      { status: 500 },
    );
  }
}
