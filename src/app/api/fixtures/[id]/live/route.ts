import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchLiveFixture } from "@/lib/footballApi";

const LIVE_CACHE_TTL_MS = 90 * 1000; // 90 seconds
const PRE_MATCH_WINDOW_MS = 10 * 60 * 1000; // show 0-0 from 10 min before kickoff
/** Only call external API during this window after kickoff (covers normal + ET). After this, use cache only. */
const MAX_MATCH_DURATION_MS = 120 * 60 * 1000; // 2 hours

/** API-Football statusShort values that mean the match is finished (cache can be used as FT score). */
const FINISHED_STATUS = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function isMatchEnded(statusShort: string): boolean {
  return FINISHED_STATUS.has(statusShort);
}

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

  // Pre-match: within 10 min before kickoff — return 0-0, no API call
  if (kickoff > now) {
    const preMatchStart = new Date(kickoff.getTime() - PRE_MATCH_WINDOW_MS);
    if (now >= preMatchStart) {
      return NextResponse.json(
        { live: true, homeGoals: 0, awayGoals: 0, elapsedMinutes: null, statusShort: "Pre" },
        { headers: { "Cache-Control": "public, max-age=60" } },
      );
    }
    return NextResponse.json(
      { live: false, reason: "Match has not started" },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }

  const cached = await prisma.liveScoreCache.findUnique({
    where: { fixtureId },
  });

  const cacheSaysEnded = cached ? isMatchEnded(cached.statusShort) : false;

  // Ended (from cache): return cached FT score, no TTL — fulltime score persists
  if (cacheSaysEnded && cached) {
    return NextResponse.json(
      {
        live: true,
        homeGoals: cached.homeGoals,
        awayGoals: cached.awayGoals,
        elapsedMinutes: cached.elapsedMinutes,
        statusShort: cached.statusShort,
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  // Live: use 90s cache
  const cacheCutoff = new Date(now.getTime() - LIVE_CACHE_TTL_MS);
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

  // Past the game window: match has ended. Use cache only if it already says FT; otherwise re-fetch once to get final result, or force FT so we don't show stale "45'" etc.
  const elapsedSinceKickoff = now.getTime() - kickoff.getTime();
  const duringGame = elapsedSinceKickoff <= MAX_MATCH_DURATION_MS;

  if (!duringGame) {
    // Stale cache (e.g. last updated at 45' / HT): re-fetch once to get FT and update cache.
    if (cached && !cacheSaysEnded && fixture.apiId) {
      try {
        const result = await fetchLiveFixture(fixture.apiId);
        if (result && isMatchEnded(result.statusShort)) {
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
            { headers: { "Cache-Control": "public, max-age=3600" } },
          );
        }
      } catch {
        // Fall through to force FT below
      }
    }
    // Use cache if we have it, but force status to FT so UI doesn't show "45'" — match has ended.
    if (cached) {
      return NextResponse.json(
        {
          live: true,
          homeGoals: cached.homeGoals,
          awayGoals: cached.awayGoals,
          elapsedMinutes: null,
          statusShort: isMatchEnded(cached.statusShort) ? cached.statusShort : "FT",
        },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      );
    }
    return NextResponse.json(
      { live: true, homeGoals: 0, awayGoals: 0, elapsedMinutes: null, statusShort: "FT" },
      { headers: { "Cache-Control": "public, max-age=3600" } },
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
