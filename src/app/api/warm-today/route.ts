import { NextResponse } from "next/server";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";

const MIN_PLAYERS_PER_TEAM = 11;

/**
 * GET /api/warm-today
 * Returns today's fixture IDs (and labels) that still need warming (missing player stats).
 * Does NOT warm stats in this request — use the script which calls GET /api/fixtures/[id]/stats per fixture.
 */
export async function GET() {
  try {
    const fixtures = await getOrRefreshTodayFixtures(new Date());
    const filtered = fixtures.filter(
      (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
    );

    if (filtered.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No fixtures for today in required leagues.",
        total: 0,
        fixtures: [],
      });
    }

    // Pairs (teamId, season, league) we need counts for
    const keys = filtered.flatMap((f) => {
      const league = f.league ?? "Unknown";
      return [
        { teamId: f.homeTeam.id, season: f.season, league },
        { teamId: f.awayTeam.id, season: f.season, league },
      ];
    });
    const counts = await prisma.playerSeasonStats.groupBy({
      by: ["teamId", "season", "league"],
      where: {
        OR: keys.map((k) => ({
          teamId: k.teamId,
          season: k.season,
          league: k.league,
        })),
      },
      _count: { id: true },
    });
    const countMap = new Map(
      counts.map((c) => [`${c.teamId}:${c.season}:${c.league}`, c._count.id])
    );

    const needsWarm = filtered.filter((f) => {
      const league = f.league ?? "Unknown";
      const homeCount = countMap.get(`${f.homeTeam.id}:${f.season}:${league}`) ?? 0;
      const awayCount = countMap.get(`${f.awayTeam.id}:${f.season}:${league}`) ?? 0;
      return homeCount < MIN_PLAYERS_PER_TEAM || awayCount < MIN_PLAYERS_PER_TEAM;
    });

    const list = needsWarm.map((f) => ({
      id: f.id,
      label: `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`,
    }));

    return NextResponse.json({
      ok: true,
      message:
        list.length === 0
          ? "All fixtures already warmed."
          : `${list.length} of ${filtered.length} fixtures need warming.`,
      total: list.length,
      totalToday: filtered.length,
      fixtures: list,
    });
  } catch (err) {
    console.error("[warm-today] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
