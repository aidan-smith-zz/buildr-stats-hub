import { API_SEASON } from "@/lib/footballApi";
import { getTomorrowFixturesForWarming } from "@/lib/fixturesService";
import { prisma } from "@/lib/prisma";
import { nextDateKeys } from "@/lib/slugs";
import * as leagues from "@/lib/leagues";

const MIN_PLAYERS_PER_TEAM = 11;
const DEFAULT_STALE_HOURS = 24;

export type FixtureNeedingWarm = {
  id: number;
  label: string;
  leagueId?: number;
};

export type WarmTomorrowListResult = {
  ok: boolean;
  message: string;
  total: number;
  totalTomorrow: number;
  dateKey: string;
  fixtures: FixtureNeedingWarm[];
  staleHours?: number;
  hint?: string;
};

/**
 * Get tomorrow's fixtures that need warming. Shared by GET /api/warm-tomorrow and the cron trigger.
 *
 * When `days > 1`, includes additional upcoming days (e.g. tomorrow + the following day).
 */
export async function getFixturesNeedingWarm(options?: {
  forceWarm?: boolean;
  staleHours?: number;
  days?: number;
}): Promise<WarmTomorrowListResult> {
  const forceWarm = options?.forceWarm ?? false;
  const staleHours =
    options?.staleHours !== undefined && options.staleHours !== null
      ? Math.max(0, options.staleHours)
      : DEFAULT_STALE_HOURS;
  const staleCutoffMs =
    staleHours > 0 ? Date.now() - staleHours * 60 * 60 * 1000 : null;
  const days = options?.days && options.days > 0 ? options.days : 1;
  const dateKeys = nextDateKeys(days);
  const tomorrowDateKey = dateKeys[0];

  // Sequential per date to avoid exhausting the connection pool (each date does many upserts)
  const fixturesArrays: Awaited<ReturnType<typeof getTomorrowFixturesForWarming>>[] = [];
  for (const dateKey of dateKeys) {
    fixturesArrays.push(await getTomorrowFixturesForWarming(dateKey));
  }
  const fixtures = fixturesArrays.flat();

  if (fixtures.length === 0) {
    return {
      ok: true,
      message:
        days > 1
          ? "No upcoming fixtures in required leagues for the selected dates (or UpcomingFixture empty for those dates)."
          : "No fixtures for tomorrow in required leagues (or UpcomingFixture empty for that date).",
      total: 0,
      totalTomorrow: 0,
      dateKey: tomorrowDateKey,
      fixtures: [],
      hint: "Run warm-today (without --resume) to refresh UpcomingFixture, then run warm-tomorrow again.",
    };
  }

  const keys = fixtures.flatMap((f) => {
    const { leagueKey } = leagues.getStatsLeagueForFixture({
      leagueId: f.leagueId,
      league: f.league,
    });
    return [
      { teamId: f.homeTeam.id, season: API_SEASON, league: leagueKey },
      { teamId: f.awayTeam.id, season: API_SEASON, league: leagueKey },
    ];
  });

  // Sequential to avoid holding 2 connections (reduces pool pressure)
  const playerCountsAndMaxUpdated = await prisma.playerSeasonStats.groupBy({
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
  });
  const teamStatsExisting = await prisma.teamSeasonStats.findMany({
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
  });

  const playerCountMap = new Map(
    playerCountsAndMaxUpdated.map((c) => [
      `${c.teamId}:${c.season}:${c.league}`,
      { count: c._count.id, updatedAt: c._max.updatedAt ?? null },
    ])
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
        const { leagueKey } = leagues.getStatsLeagueForFixture({
          leagueId: f.leagueId,
          league: f.league,
        });
        const isTeamStatsOnly = leagues.isTeamStatsOnlyLeague(f.leagueId);

        const homeKey = `${f.homeTeam.id}:${API_SEASON}:${leagueKey}`;
        const awayKey = `${f.awayTeam.id}:${API_SEASON}:${leagueKey}`;
        const homePlayer = playerCountMap.get(homeKey) ?? {
          count: 0,
          updatedAt: null,
        };
        const awayPlayer = playerCountMap.get(awayKey) ?? {
          count: 0,
          updatedAt: null,
        };

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
          : homePlayer.count < MIN_PLAYERS_PER_TEAM ||
            awayPlayer.count < MIN_PLAYERS_PER_TEAM ||
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

        if (f.leagueId === leagues.SCOTTISH_CUP_LEAGUE_ID) {
          const homeInPremiership = homePlayer.count > 0;
          const awayInPremiership = awayPlayer.count > 0;
          if (!homeInPremiership && !awayInPremiership) return false;
          const homeNeeds =
            (!isTeamStatsOnly &&
              (homePlayer.count < MIN_PLAYERS_PER_TEAM ||
                (staleCutoffMs != null && homePlayerStale))) ||
            !homeHasFreshTeamStats ||
            homeHasStaleTeamStats;
          const awayNeeds =
            (!isTeamStatsOnly &&
              (awayPlayer.count < MIN_PLAYERS_PER_TEAM ||
                (staleCutoffMs != null && awayPlayerStale))) ||
            !awayHasFreshTeamStats ||
            awayHasStaleTeamStats;
          return (
            (homeInPremiership && homeNeeds) || (awayInPremiership && awayNeeds)
          );
        }
        if (f.leagueId === leagues.ENGLISH_LEAGUE_CUP_LEAGUE_ID) {
          const homeInPremierLeague = homePlayer.count > 0;
          const awayInPremierLeague = awayPlayer.count > 0;
          if (!homeInPremierLeague && !awayInPremierLeague) return false;
          const homeNeeds =
            (!isTeamStatsOnly &&
              (homePlayer.count < MIN_PLAYERS_PER_TEAM ||
                (staleCutoffMs != null && homePlayerStale))) ||
            !homeHasFreshTeamStats ||
            homeHasStaleTeamStats;
          const awayNeeds =
            (!isTeamStatsOnly &&
              (awayPlayer.count < MIN_PLAYERS_PER_TEAM ||
                (staleCutoffMs != null && awayPlayerStale))) ||
            !awayHasFreshTeamStats ||
            awayHasStaleTeamStats;
          return (
            (homeInPremierLeague && homeNeeds) || (awayInPremierLeague && awayNeeds)
          );
        }

        return needsPlayerStats || needsTeamStats;
      });

  const list: FixtureNeedingWarm[] = needsWarm.map((f) => ({
    id: f.id,
    label: `${f.homeTeam.shortName ?? f.homeTeam.name} vs ${f.awayTeam.shortName ?? f.awayTeam.name}`,
    leagueId: f.leagueId ?? undefined,
  }));

  return {
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
  };
}
