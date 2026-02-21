import { NextResponse } from "next/server";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";

const MIN_PLAYERS_PER_TEAM = 11;

/**
 * GET /api/warm-today
 * Returns today's fixture IDs that need warming: missing player stats OR missing team stats (e.g. after clearing team cache).
 * Use the script which calls GET /api/fixtures/[id]/stats per fixture to warm.
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

    const keys = filtered.flatMap((f) => {
      const league = f.league ?? "Unknown";
      return [
        { teamId: f.homeTeam.id, season: f.season, league },
        { teamId: f.awayTeam.id, season: f.season, league },
      ];
    });
    const [playerCounts, teamStatsExisting] = await Promise.all([
      prisma.playerSeasonStats.groupBy({
        by: ["teamId", "season", "league"],
        where: {
          OR: keys.map((k) => ({
            teamId: k.teamId,
            season: k.season,
            league: k.league,
          })),
        },
        _count: { id: true },
      }),
      prisma.teamSeasonStats.findMany({
        where: {
          OR: keys.map((k) => ({
            teamId: k.teamId,
            season: k.season,
            league: k.league,
          })),
        },
        select: { teamId: true, season: true, league: true },
      }),
    ]);

    const playerCountMap = new Map(
      playerCounts.map((c) => [`${c.teamId}:${c.season}:${c.league}`, c._count.id])
    );
    const teamStatsKeys = new Set(
      teamStatsExisting.map((r) => `${r.teamId}:${r.season}:${r.league}`)
    );

    const needsWarm = filtered.filter((f) => {
      const league = f.league ?? "Unknown";
      const homePlayerCount = playerCountMap.get(`${f.homeTeam.id}:${f.season}:${league}`) ?? 0;
      const awayPlayerCount = playerCountMap.get(`${f.awayTeam.id}:${f.season}:${league}`) ?? 0;
      const needsPlayerStats =
        homePlayerCount < MIN_PLAYERS_PER_TEAM || awayPlayerCount < MIN_PLAYERS_PER_TEAM;
      const homeHasTeamStats = teamStatsKeys.has(`${f.homeTeam.id}:${f.season}:${league}`);
      const awayHasTeamStats = teamStatsKeys.has(`${f.awayTeam.id}:${f.season}:${league}`);
      const needsTeamStats = !homeHasTeamStats || !awayHasTeamStats;
      return needsPlayerStats || needsTeamStats;
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
