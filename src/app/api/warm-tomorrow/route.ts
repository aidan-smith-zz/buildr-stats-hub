import { API_SEASON } from "@/lib/footballApi";
import { NextResponse } from "next/server";
import { getTomorrowFixturesForWarming } from "@/lib/fixturesService";
import { prisma } from "@/lib/prisma";
import { nextDateKeys } from "@/lib/slugs";
import { isTeamStatsOnlyLeague } from "@/lib/leagues";

const MIN_PLAYERS_PER_TEAM = 11;
/** Default: treat team/player stats as stale after this many hours so we re-warm for tomorrow. Use staleHours=0 to disable. */
const DEFAULT_STALE_HOURS = 24;

/**
 * GET /api/warm-tomorrow
 * Returns tomorrow's fixture IDs that need warming (player and team stats).
 * Uses UpcomingFixture for tomorrow's date; materializes into Fixture table so existing warm endpoints work.
 * - forceWarm=1: return all tomorrow's fixtures as needing warm.
 * - staleHours=N: treat stats as needing refresh if older than N hours (default 24). Use 0 to only check presence.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  const staleHoursParam = url.searchParams.get("staleHours");
  const staleHours =
    staleHoursParam !== null && staleHoursParam !== ""
      ? Math.max(0, parseInt(staleHoursParam, 10) || 0)
      : DEFAULT_STALE_HOURS;
  const staleCutoffMs =
    staleHours > 0 ? Date.now() - staleHours * 60 * 60 * 1000 : null;
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
    const [playerCountsAndMaxUpdated, teamStatsExisting] = await Promise.all([
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
        _max: { updatedAt: true },
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
          updatedAt: true,
        },
      }),
    ]);

    const playerCountMap = new Map(
      playerCountsAndMaxUpdated.map((c) => [
        `${c.teamId}:${c.season}:${c.league}`,
        { count: c._count.id, updatedAt: c._max.updatedAt ?? null },
      ]),
    );
    // Only treat team-season stats as present when they have non-zero data (minutes or any stat),
    // and when not stale: if staleHours > 0, updatedAt must be within the last N hours.
    const teamStatsByKey = new Map(
      teamStatsExisting.map((r) => [`${r.teamId}:${r.season}:${r.league}`, r]),
    );
    const teamStatsFreshKeys = new Set<string>();
    const teamStatsStaleKeys = new Set<string>();
    for (const r of teamStatsExisting) {
      const key = `${r.teamId}:${r.season}:${r.league}`;
      const hasData =
        (r.minutesPlayed ?? 0) > 0 ||
        r.goalsFor > 0 ||
        r.goalsAgainst > 0 ||
        r.corners > 0 ||
        r.yellowCards > 0 ||
        r.redCards > 0;
      if (!hasData) continue;
      if (staleCutoffMs != null && (r.updatedAt?.getTime() ?? 0) < staleCutoffMs) {
        teamStatsStaleKeys.add(key);
      } else {
        teamStatsFreshKeys.add(key);
      }
    }

    const needsWarm = forceWarm
      ? fixtures
      : fixtures.filter((f) => {
          const league = f.league ?? "Unknown";
          const isTeamStatsOnly = isTeamStatsOnlyLeague(f.leagueId);

          const homeKey = `${f.homeTeam.id}:${API_SEASON}:${league}`;
          const awayKey = `${f.awayTeam.id}:${API_SEASON}:${league}`;
          const homePlayer = playerCountMap.get(homeKey) ?? { count: 0, updatedAt: null };
          const awayPlayer = playerCountMap.get(awayKey) ?? { count: 0, updatedAt: null };

          const homePlayerCount = homePlayer.count;
          const awayPlayerCount = awayPlayer.count;
          const homePlayerStale =
            staleCutoffMs != null &&
            homePlayer.updatedAt != null &&
            homePlayer.updatedAt.getTime() < staleCutoffMs;
          const awayPlayerStale =
            staleCutoffMs != null &&
            awayPlayer.updatedAt != null &&
            awayPlayer.updatedAt.getTime() < staleCutoffMs;

          const needsPlayerStats = isTeamStatsOnly
            ? false
            : homePlayerCount < MIN_PLAYERS_PER_TEAM ||
              awayPlayerCount < MIN_PLAYERS_PER_TEAM ||
              (staleCutoffMs != null && (homePlayerStale || awayPlayerStale));

          const homeHasFreshTeamStats = teamStatsFreshKeys.has(homeKey);
          const awayHasFreshTeamStats = teamStatsFreshKeys.has(awayKey);
          const homeHasStaleTeamStats = teamStatsStaleKeys.has(homeKey);
          const awayHasStaleTeamStats = teamStatsStaleKeys.has(awayKey);
          const needsTeamStats =
            !homeHasFreshTeamStats ||
            !awayHasFreshTeamStats ||
            homeHasStaleTeamStats ||
            awayHasStaleTeamStats;

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
      staleHours: staleHours > 0 ? staleHours : undefined,
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
