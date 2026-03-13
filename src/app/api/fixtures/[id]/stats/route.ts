import { NextResponse } from "next/server";
import { withPoolRetry } from "@/lib/poolRetry";
import {
  getFixtureStatsCached,
  mergeLineupIntoStats,
} from "@/lib/statsService";
import { ensureLineupIfWithinWindow, getLineupForFixture, isWithinLineupFetchWindow } from "@/lib/lineupService";
import { prisma } from "@/lib/prisma";

const DEBUG_FIXTURE = process.env.DEBUG_FIXTURE === "1" || process.env.DEBUG_FIXTURE === "true";

/** Hobby plan max 60s. Use chunked warm (GET /api/fixtures/[id]/warm?part=home|away) to prefill player stats. */
export const maxDuration = 60;

/** Long-lived cache for fixture stats (7h fresh, 8h stale-while-revalidate). */
const CACHE_CONTROL_LONG = "public, max-age=25200, stale-while-revalidate=28800";
/** No cache: used when inside lineup window and response has no lineup so next request hits server and can fetch/store lineup. */
const CACHE_CONTROL_NO_STORE = "private, no-store, max-age=0";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: idParam } = await params;
  const id = Number(idParam);

  if (DEBUG_FIXTURE) {
    console.log("[fixture-debug] GET /api/fixtures/" + id + "/stats");
  }

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  }

  let stats = await withPoolRetry(() => getFixtureStatsCached(id));

  if (!stats) {
    const fixtureCount = await prisma.fixture.count();
    const existingIds = await prisma.fixture.findMany({
      select: { id: true },
      take: 10,
      orderBy: { id: "asc" },
    });
    console.error(`[API] Fixture ${id} not found. Total fixtures in DB: ${fixtureCount}`);
    console.error(`[API] Sample fixture IDs:`, existingIds.map((f) => f.id));
    return NextResponse.json(
      {
        error: "Fixture not found",
        fixtureId: id,
        totalFixtures: fixtureCount,
        sampleIds: existingIds.map((f) => f.id),
      },
      { status: 404 },
    );
  }

  const kickoff = typeof stats.fixture.date === "string" ? new Date(stats.fixture.date) : stats.fixture.date;
  const inLineupWindow = isWithinLineupFetchWindow(kickoff, new Date());

  // Always merge any existing lineup into stats so /live and match pages see it,
  // even if it was fetched earlier or outside the current lineup window.
  let lineupByTeam = await getLineupForFixture(id);

  // If we're within the safe fetch window, there is no lineup yet in DB, and stats
  // still report hasLineup=false, trigger a one-off fetch + store.
  if (inLineupWindow && !stats.hasLineup && lineupByTeam.size === 0) {
    const fixture = await prisma.fixture.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true },
    });
    if (fixture?.apiId) {
      await ensureLineupIfWithinWindow(
        fixture.id,
        fixture.date,
        fixture.apiId,
        fixture.homeTeamId,
        fixture.awayTeamId,
        fixture.homeTeam.apiId,
        fixture.awayTeam.apiId,
      );
      lineupByTeam = await getLineupForFixture(id);
    }
  }

  if (lineupByTeam.size > 0 && !stats.hasLineup) {
    stats = await mergeLineupIntoStats(stats, lineupByTeam);
  }

  const cacheControl =
    inLineupWindow && !stats.hasLineup ? CACHE_CONTROL_NO_STORE : CACHE_CONTROL_LONG;

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": cacheControl,
    },
  });
}

