import { NextResponse } from "next/server";
import { getFixtureStats } from "@/lib/statsService";

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
    // Stats are season-to-date and typically change at most daily.
    // This hints that responses can be cached briefly at the edge if desired.
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}

