import { NextResponse } from "next/server";
import { getFixtureStats } from "@/lib/statsService";

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

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  }

  const stats = await getFixtureStats(id);

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
    // Shorter max-age so team stats show soon after warm; stale-while-revalidate for speed.
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

