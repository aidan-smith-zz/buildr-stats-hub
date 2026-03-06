import { NextResponse } from "next/server";
import { refreshTeamCrests } from "@/lib/crestsService";

/**
 * POST /api/teams/crests/refresh/teams
 *
 * Refresh team crests for teams that appear in fixtures / upcoming fixtures.
 *
 * Query params:
 * - max: number (limit how many teams to process per request; default 50)
 * - mode: "missing" | "all" (default "missing")
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const maxRaw = searchParams.get("max");
    const mode = searchParams.get("mode") ?? "missing";

    const max = maxRaw ? Number(maxRaw) : 50;
    const maxTeams = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    const onlyMissing = mode !== "all";

    const result = await refreshTeamCrests({ maxTeams, onlyMissing });

    return NextResponse.json({
      ok: true,
      message: `Team crests: ${result.updated} updated, ${result.failed} failed. Processed ${result.processed}/${result.total}${result.remaining ? ` (remaining ${result.remaining})` : ""}.`,
      teams: result,
      next:
        result.remaining > 0
          ? { hint: "Call again to continue", query: `?max=${maxTeams}&mode=${mode}` }
          : null,
    });
  } catch (err) {
    console.error("[api/teams/crests/refresh/teams]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to refresh team crests" },
      { status: 500 },
    );
  }
}

