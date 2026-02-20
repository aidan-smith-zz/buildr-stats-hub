import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchLiveFixture } from "@/lib/footballApi";

const LIVE_CACHE_TTL_MS = 90 * 1000; // 90 seconds

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: idParam } = await params;
  const fixtureId = Number(idParam);

  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { id: true, apiId: true, date: true },
  });

  if (!fixture) {
    return NextResponse.json({ error: "Fixture not found", live: false }, { status: 404 });
  }

  const now = new Date();
  const kickoff = new Date(fixture.date);

  // Only fetch live data if match has started — avoid wasting API calls
  if (kickoff > now) {
    return NextResponse.json(
      { live: false, reason: "Match has not started" },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  const cacheCutoff = new Date(now.getTime() - LIVE_CACHE_TTL_MS);

  const cached = await prisma.liveScoreCache.findUnique({
    where: { fixtureId },
  });

  if (cached && cached.cachedAt >= cacheCutoff) {
    return NextResponse.json(
      {
        live: true,
        homeGoals: cached.homeGoals,
        awayGoals: cached.awayGoals,
        elapsedMinutes: cached.elapsedMinutes,
        statusShort: cached.statusShort,
      },
      { headers: { "Cache-Control": "public, max-age=90" } },
    );
  }

  if (!fixture.apiId) {
    return NextResponse.json(
      { live: true, homeGoals: 0, awayGoals: 0, elapsedMinutes: null, statusShort: "?" },
      { headers: { "Cache-Control": "public, max-age=90" } },
    );
  }

  try {
    const result = await fetchLiveFixture(fixture.apiId);
    if (!result) {
      return NextResponse.json(
        { live: true, homeGoals: 0, awayGoals: 0, elapsedMinutes: null, statusShort: "?" },
        { headers: { "Cache-Control": "public, max-age=90" } },
      );
    }

    await prisma.liveScoreCache.upsert({
      where: { fixtureId },
      create: {
        fixtureId,
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        elapsedMinutes: result.elapsedMinutes,
        statusShort: result.statusShort,
        cachedAt: now,
      },
      update: {
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        elapsedMinutes: result.elapsedMinutes,
        statusShort: result.statusShort,
        cachedAt: now,
      },
    });

    return NextResponse.json(
      {
        live: true,
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        elapsedMinutes: result.elapsedMinutes,
        statusShort: result.statusShort,
      },
      { headers: { "Cache-Control": "public, max-age=90" } },
    );
  } catch (err) {
    console.error("[live] Failed to fetch live fixture", fixtureId, err);
    if (cached) {
      return NextResponse.json(
        {
          live: true,
          homeGoals: cached.homeGoals,
          awayGoals: cached.awayGoals,
          elapsedMinutes: cached.elapsedMinutes,
          statusShort: cached.statusShort,
        },
        { headers: { "Cache-Control": "public, max-age=30" } },
      );
    }
    return NextResponse.json(
      { live: true, homeGoals: 0, awayGoals: 0, elapsedMinutes: null, statusShort: "?", error: "Failed to fetch" },
      { status: 200, headers: { "Cache-Control": "public, max-age=30" } },
    );
  }
}
