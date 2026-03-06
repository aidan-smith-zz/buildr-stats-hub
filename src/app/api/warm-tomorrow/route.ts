import { NextResponse } from "next/server";
import { getFixturesNeedingWarm } from "@/lib/warmTomorrowService";

const DEFAULT_STALE_HOURS = 24;

/**
 * GET /api/warm-tomorrow
 * Returns tomorrow's fixture IDs that need warming (player and team stats).
 * Uses UpcomingFixture for tomorrow's date; materializes into Fixture table so existing warm endpoints work.
 * - forceWarm=1: return all tomorrow's fixtures as needing warm.
 * - staleHours=N: treat stats as needing refresh if older than N hours (default 24). Use 0 to only check presence.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  const staleHoursParam = url.searchParams.get("staleHours");
  const staleHours =
    staleHoursParam !== null && staleHoursParam !== ""
      ? Math.max(0, parseInt(staleHoursParam, 10) || 0)
      : DEFAULT_STALE_HOURS;

  try {
    const result = await getFixturesNeedingWarm({ forceWarm, staleHours });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[warm-tomorrow] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
