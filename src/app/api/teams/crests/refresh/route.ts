import { NextResponse } from "next/server";
import { refreshTeamCrests } from "@/lib/crestsService";

/**
 * POST /api/teams/crests/refresh
 * Fetches each team's crest from the API and stores it in the DB.
 * Only teams that appear in fixtures for your chosen tournaments (Premier League,
 * Championship, UCL, UEL, SPFL, FA Cup) are updated.
 * Hit this periodically (e.g. daily or after fixture refresh) to keep crests in sync.
 */
export async function POST() {
  try {
    const { updated, failed } = await refreshTeamCrests();
    return NextResponse.json({
      ok: true,
      message: `Crests refreshed. ${updated} updated, ${failed} failed.`,
      updated,
      failed,
    });
  } catch (err) {
    console.error("[api/teams/crests/refresh]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to refresh crests" },
      { status: 500 },
    );
  }
}
