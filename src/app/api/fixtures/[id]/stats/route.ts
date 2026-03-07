import { NextResponse } from "next/server";
import { withPoolRetry } from "@/lib/poolRetry";
import { getFixtureStats } from "@/lib/statsService";

const DEBUG_FIXTURE = process.env.DEBUG_FIXTURE === "1" || process.env.DEBUG_FIXTURE === "true";

/** Hobby plan max 60s. Use chunked warm (GET /api/fixtures/[id]/warm?part=home|away) to prefill player stats. */
export const maxDuration = 60;

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

  const stats = await withPoolRetry(() =>
    getFixtureStats(id, { sequential: true })
  );

  if (!stats) {
    // Check if any fixtures exist to help debug
    const { prisma } = await import("@/lib/prisma");
    const fixtureCount = await prisma.fixture.count();
    const existingIds = await prisma.fixture.findMany({
      select: { id: true },
      take: 10,
      orderBy: { id: "asc" },
    });
    console.error(`[API] Fixture ${id} not found. Total fixtures in DB: ${fixtureCount}`);
    console.error(`[API] Sample fixture IDs:`, existingIds.map(f => f.id));
    return NextResponse.json({ 
      error: "Fixture not found",
      fixtureId: id,
      totalFixtures: fixtureCount,
      sampleIds: existingIds.map(f => f.id),
    }, { status: 404 });
  }

  return NextResponse.json(stats, {
    // Team/player stats are static until next match; cache 2h fresh, serve stale up to 3h while revalidating.
    headers: {
      "Cache-Control": "public, max-age=7200, stale-while-revalidate=10800",
    },
  });
}

