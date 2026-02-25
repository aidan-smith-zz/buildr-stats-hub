import { API_SEASON } from "@/lib/footballApi";
import { NextResponse } from "next/server";
import {
  getOrRefreshTodayFixtures,
  getTodayFixturesFromDbOnly,
  refreshUpcomingFixturesTable,
} from "@/lib/fixturesService";
import { isFixtureInRequiredLeagues } from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import { todayDateKey } from "@/lib/slugs";

const MIN_PLAYERS_PER_TEAM = 11;

/**
 * GET /api/warm-today
 * Returns today's fixture IDs that need warming: missing player stats OR missing team stats (e.g. after clearing team cache).
 * Use the script which calls GET /api/fixtures/[id]/stats per fixture to warm.
 * - skipRefresh=1: do not refresh upcoming table or fetch today from API; use DB only (resume mode, faster).
 * - forceWarm=1: return all today's fixtures as needing warm (ignore existing stats; use to re-warm after API fixes).
 */
export async function GET(request: Request) {
  const now = new Date();
  const url = new URL(request.url);
  const skipRefresh = url.searchParams.get("skipRefresh") === "1";
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  try {
    if (!skipRefresh) {
      await refreshUpcomingFixturesTable(now);
    }
    const fixtures = skipRefresh
      ? await getTodayFixturesFromDbOnly(now)
      : await getOrRefreshTodayFixtures(now);
    const filtered = fixtures.filter((f) =>
      isFixtureInRequiredLeagues({ leagueId: f.leagueId, league: f.league })
    );

    if (filtered.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No fixtures for today in required leagues.",
        total: 0,
        totalToday: 0,
        dateKey: todayDateKey(),
        fixtures: [],
        hint: "Date is YYYY-MM-DD (Europe/London). If you expected fixtures, check server logs for [footballApi] or [fixturesService] (e.g. plan limit or API errors).",
      });
    }

    const keys = filtered.flatMap((f) => {
      const league = f.league ?? "Unknown";
      return [
        { teamId: f.homeTeam.id, season: API_SEASON, league },
        { teamId: f.awayTeam.id, season: API_SEASON, league },
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

    const needsWarm = forceWarm
      ? filtered
      : filtered.filter((f) => {
          const league = f.league ?? "Unknown";
          const homePlayerCount = playerCountMap.get(`${f.homeTeam.id}:${API_SEASON}:${league}`) ?? 0;
          const awayPlayerCount = playerCountMap.get(`${f.awayTeam.id}:${API_SEASON}:${league}`) ?? 0;
          const needsPlayerStats =
            homePlayerCount < MIN_PLAYERS_PER_TEAM || awayPlayerCount < MIN_PLAYERS_PER_TEAM;
          const homeHasTeamStats = teamStatsKeys.has(`${f.homeTeam.id}:${API_SEASON}:${league}`);
          const awayHasTeamStats = teamStatsKeys.has(`${f.awayTeam.id}:${API_SEASON}:${league}`);
          const needsTeamStats = !homeHasTeamStats || !awayHasTeamStats;
          return needsPlayerStats || needsTeamStats;
        });

    const list = needsWarm.map((f) => ({
      id: f.id,
      label: `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`,
      leagueId: f.leagueId ?? undefined,
    }));

    // Return immediately so the warm script can start. Preview/sitemap warming is not done here
    // (it was blocking the response for 4–5+ minutes due to 14 days of sequential page fetches).
    return NextResponse.json({
      ok: true,
      message:
        list.length === 0
          ? "All fixtures already warmed."
          : forceWarm
            ? `Re-warming all ${list.length} fixtures (forceWarm=1).`
            : `${list.length} of ${filtered.length} fixtures need warming.`,
      total: list.length,
      totalToday: filtered.length,
      dateKey: todayDateKey(),
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
