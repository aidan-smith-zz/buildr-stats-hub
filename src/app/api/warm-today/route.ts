import { API_SEASON } from "@/lib/footballApi";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  getOrRefreshTodayFixtures,
  getTodayFixturesFromDbOnly,
  refreshUpcomingFixturesTable,
} from "@/lib/fixturesService";
import {
  getStatsLeagueForFixture,
  isFixtureInRequiredLeagues,
  isTeamStatsOnlyLeague,
  SCOTTISH_CUP_LEAGUE_ID,
} from "@/lib/leagues";
import { prisma } from "@/lib/prisma";
import { withPoolRetry } from "@/lib/poolRetry";
import { todayDateKey } from "@/lib/slugs";

const MIN_PLAYERS_PER_TEAM = 11;
const UPCOMING_PAGE_CACHE_TAG = "upcoming-page-data";

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
    const response = await withPoolRetry(async () => {
    if (!skipRefresh) {
      await refreshUpcomingFixturesTable(now);
      // Bust the upcoming page cache so the refreshed UpcomingFixture table shows up immediately.
      revalidateTag(UPCOMING_PAGE_CACHE_TAG, { expire: 0 });
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
      const { leagueKey } = getStatsLeagueForFixture({ leagueId: f.leagueId, league: f.league });
      return [
        { teamId: f.homeTeam.id, season: API_SEASON, league: leagueKey },
        { teamId: f.awayTeam.id, season: API_SEASON, league: leagueKey },
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
        select: {
          teamId: true,
          season: true,
          league: true,
          minutesPlayed: true,
          goalsFor: true,
          goalsAgainst: true,
          corners: true,
          yellowCards: true,
          redCards: true,
        },
      }),
    ]);

    const playerCountMap = new Map(
      playerCounts.map((c) => [`${c.teamId}:${c.season}:${c.league}`, c._count.id])
    );
    // Treat a team as "having season stats" only when we have non-zero data (minutes or any stat).
    // This avoids cases where an all-zero row was written during a partial warm and warm-today
    // incorrectly skips the team even though useful stats are still missing.
    const teamStatsNonZeroKeys = new Set(
      teamStatsExisting
        .filter(
          (r) =>
            (r.minutesPlayed ?? 0) > 0 ||
            r.goalsFor > 0 ||
            r.goalsAgainst > 0 ||
            r.corners > 0 ||
            r.yellowCards > 0 ||
            r.redCards > 0,
        )
        .map((r) => `${r.teamId}:${r.season}:${r.league}`),
    );

    const needsWarm = forceWarm
      ? filtered
      : filtered.filter((f) => {
          const { leagueKey } = getStatsLeagueForFixture({ leagueId: f.leagueId, league: f.league });
          const isTeamStatsOnly = isTeamStatsOnlyLeague(f.leagueId);

          const homePlayerCount = playerCountMap.get(`${f.homeTeam.id}:${API_SEASON}:${leagueKey}`) ?? 0;
          const awayPlayerCount = playerCountMap.get(`${f.awayTeam.id}:${API_SEASON}:${leagueKey}`) ?? 0;
          // For League One/Two (team-stats-only leagues) there is no player data, so skip the player-stats check.
          const needsPlayerStats = isTeamStatsOnly
            ? false
            : homePlayerCount < MIN_PLAYERS_PER_TEAM || awayPlayerCount < MIN_PLAYERS_PER_TEAM;

          const homeHasTeamStats = teamStatsNonZeroKeys.has(`${f.homeTeam.id}:${API_SEASON}:${leagueKey}`);
          const awayHasTeamStats = teamStatsNonZeroKeys.has(`${f.awayTeam.id}:${API_SEASON}:${leagueKey}`);
          const needsTeamStats = !homeHasTeamStats || !awayHasTeamStats;

          if (f.leagueId === SCOTTISH_CUP_LEAGUE_ID) {
            const homeInPremiership = homePlayerCount > 0;
            const awayInPremiership = awayPlayerCount > 0;
            if (!homeInPremiership && !awayInPremiership) return false;
            const homeNeeds =
              (!isTeamStatsOnly && homePlayerCount < MIN_PLAYERS_PER_TEAM) ||
              !homeHasTeamStats;
            const awayNeeds =
              (!isTeamStatsOnly && awayPlayerCount < MIN_PLAYERS_PER_TEAM) ||
              !awayHasTeamStats;
            return (
              (homeInPremiership && homeNeeds) || (awayInPremiership && awayNeeds)
            );
          }

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
      ...(skipRefresh && list.length > 0
        ? { hint: "Using DB-only fixture list (--resume). Only listed fixtures need warming; no list refetch." }
        : {}),
    });
    });
    return response;
  } catch (err) {
    console.error("[warm-today] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
