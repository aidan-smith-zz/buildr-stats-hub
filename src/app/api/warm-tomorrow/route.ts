import { API_SEASON } from "@/lib/footballApi";
import { NextResponse } from "next/server";
import { getTomorrowFixturesForWarming } from "@/lib/fixturesService";
import { prisma } from "@/lib/prisma";
import { nextDateKeys } from "@/lib/slugs";
import { isTeamStatsOnlyLeague } from "@/lib/leagues";

const MIN_PLAYERS_PER_TEAM = 11;

/**
 * GET /api/warm-tomorrow
 * Returns tomorrow's fixture IDs that need warming (player and team stats).
 * Uses UpcomingFixture for tomorrow's date; materializes into Fixture table so existing warm endpoints work.
 * Site behaviour is unchanged (only today's fixtures shown). Run the warm-tomorrow script to warm these.
 * - forceWarm=1: return all tomorrow's fixtures as needing warm.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  const tomorrowDateKey = nextDateKeys(1)[0];

  try {
    const fixtures = await getTomorrowFixturesForWarming(tomorrowDateKey);

    if (fixtures.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No fixtures for tomorrow in required leagues (or UpcomingFixture empty for that date).",
        total: 0,
        totalTomorrow: 0,
        dateKey: tomorrowDateKey,
        fixtures: [],
        hint: "Run warm-today (without --resume) to refresh UpcomingFixture, then run warm-tomorrow again.",
      });
    }

    const keys = fixtures.flatMap((f) => {
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
      playerCounts.map((c) => [`${c.teamId}:${c.season}:${c.league}`, c._count.id]),
    );
    // Only treat team-season stats as present when they have non-zero data (minutes or any stat),
    // matching warm-today behaviour so partially empty rows don't cause fixtures to be skipped.
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
      ? fixtures
      : fixtures.filter((f) => {
          const league = f.league ?? "Unknown";
          const isTeamStatsOnly = isTeamStatsOnlyLeague(f.leagueId);

          const homePlayerCount = playerCountMap.get(`${f.homeTeam.id}:${API_SEASON}:${league}`) ?? 0;
          const awayPlayerCount = playerCountMap.get(`${f.awayTeam.id}:${API_SEASON}:${league}`) ?? 0;
          // For League One/Two (team-stats-only leagues) there is no player data, so skip the player-stats check.
          const needsPlayerStats = isTeamStatsOnly
            ? false
            : homePlayerCount < MIN_PLAYERS_PER_TEAM || awayPlayerCount < MIN_PLAYERS_PER_TEAM;

          const homeHasTeamStats = teamStatsNonZeroKeys.has(`${f.homeTeam.id}:${API_SEASON}:${league}`);
          const awayHasTeamStats = teamStatsNonZeroKeys.has(`${f.awayTeam.id}:${API_SEASON}:${league}`);
          const needsTeamStats = !homeHasTeamStats || !awayHasTeamStats;

          return needsPlayerStats || needsTeamStats;
        });

    const list = needsWarm.map((f) => ({
      id: f.id,
      label: `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`,
      leagueId: f.leagueId ?? undefined,
    }));

    return NextResponse.json({
      ok: true,
      message:
        list.length === 0
          ? "All tomorrow's fixtures already warmed."
          : forceWarm
            ? `Re-warming all ${list.length} fixtures (forceWarm=1).`
            : `${list.length} of ${fixtures.length} fixtures need warming.`,
      total: list.length,
      totalTomorrow: fixtures.length,
      dateKey: tomorrowDateKey,
      fixtures: list,
      hint:
        list.length > 0
          ? "If you hit API limits, run warm-today --resume tomorrow to finish warming (uses DB list, no refetch)."
          : undefined,
    });
  } catch (err) {
    console.error("[warm-tomorrow] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
