import { NextResponse } from "next/server";
import { refreshLeagueCrests } from "@/lib/crestsService";

/**
 * POST /api/teams/crests/refresh
 * Refreshes league crests only (EPL, Championship, Scottish Premiership, etc.) — the small set
 * of supported leagues with standings. Fetches from the standings API and stores in LeagueCrestCache.
 * Skips leagues that already have a crest in the DB. Fast (handful of API calls).
 */
export async function POST() {
  try {
    const result = await refreshLeagueCrests();
    return NextResponse.json({
      ok: true,
      message: `League crests: ${result.updated} updated, ${result.skipped} already cached, ${result.failed} failed (${result.total} leagues).`,
      leagues: result,
    });
  } catch (err) {
    console.error("[api/teams/crests/refresh]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to refresh league crests" },
      { status: 500 },
    );
  }
}
