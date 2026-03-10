import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getFixturesNeedingWarm } from "@/lib/warmTomorrowService";
import { refreshUpcomingFixturesTable } from "@/lib/fixturesService";

const DEFAULT_STALE_HOURS = 24;
const UPCOMING_PAGE_CACHE_TAG = "upcoming-page-data";

/**
 * GET /api/warm-tomorrow
 * Returns tomorrow's fixture IDs that need warming (player and team stats).
 * Uses UpcomingFixture for tomorrow's date; materializes into Fixture table so existing warm endpoints work.
 * - forceWarm=1: return all tomorrow's fixtures as needing warm.
 * - staleHours=N: treat stats as needing refresh if older than N hours (default 24). Use 0 to only check presence.
 */
export async function GET(request: Request) {
  const now = new Date();
  const url = new URL(request.url);
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  const skipRefresh = url.searchParams.get("skipRefresh") === "1";
  const staleHoursParam = url.searchParams.get("staleHours");
  const staleHours =
    staleHoursParam !== null && staleHoursParam !== ""
      ? Math.max(0, parseInt(staleHoursParam, 10) || 0)
      : DEFAULT_STALE_HOURS;
  const daysParam = url.searchParams.get("days");
  const days =
    daysParam !== null && daysParam !== ""
      ? Math.max(1, parseInt(daysParam, 10) || 1)
      : 1;

  try {
    if (!skipRefresh) {
      // Ensure upcoming fixtures stay current even if only warm-tomorrow runs.
      await refreshUpcomingFixturesTable(now);
    }
    const result = await getFixturesNeedingWarm({ forceWarm, staleHours, days });
    // This endpoint can materialize upcoming fixtures into the Fixture table (via warmTomorrowService),
    // which affects the "View stats" badges on the upcoming page. Bust the upcoming page cache.
    revalidateTag(UPCOMING_PAGE_CACHE_TAG, { expire: 0 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[warm-tomorrow] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
