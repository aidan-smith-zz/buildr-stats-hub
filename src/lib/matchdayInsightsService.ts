import { prisma } from "@/lib/prisma";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { getFixtureStats } from "@/lib/statsService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

const FIXTURES_TZ = "Europe/London";

function dayBoundsUtc(dateKey: string) {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  const nextDayStr = new Date(dayEnd.getTime() + 1).toISOString().slice(0, 10);
  const spilloverEnd = new Date(`${nextDayStr}T00:59:59.999Z`);
  return { dayStart, spilloverEnd };
}

export type MatchdayPlayerLeaderEntry = {
  name: string;
  teamName: string;
  value: number;
  href: string;
};

export type MatchdayFixtureLeaderEntry = {
  homeName: string;
  awayName: string;
  combinedXg: number;
  href: string;
};

export type MatchdayTeamLeaderEntry = {
  teamName: string;
  xgPer90: number;
  href: string;
};

export type MatchdayTeamCornersEntry = {
  teamName: string;
  cornersPer90: number;
  href: string;
};

export type MatchdayInsightsData = {
  dateKey: string;
  displayDate: string;
  top5ShotsOnTargetPer90: MatchdayPlayerLeaderEntry[];
  top5ShotsPer90: MatchdayPlayerLeaderEntry[];
  top5FoulsPer90: MatchdayPlayerLeaderEntry[];
  top5FixturesCombinedXg: MatchdayFixtureLeaderEntry[];
  top5TeamsXgPer90: MatchdayTeamLeaderEntry[];
  top5TeamsCornersPer90: MatchdayTeamCornersEntry[];
  top5CardsPer90: MatchdayPlayerLeaderEntry[];
};

const MIN_MINUTES_FOR_PER90 = 90;

function fixtureHref(
  dateKey: string,
  league: string | null,
  homeName: string,
  awayName: string,
): string {
  return `/fixtures/${dateKey}/${leagueToSlug(league)}/${matchSlug(homeName, awayName)}`;
}

/**
 * Load fixtures for a date (today from getOrRefreshTodayFixtures, other dates from DB),
 * then get stats for each (getFixtureStats populates DB if empty). Aggregate into leaderboards.
 * Limits to 20 fixtures to avoid timeout.
 */
export async function getMatchdayInsightsData(
  dateKey: string,
): Promise<MatchdayInsightsData> {
  const displayDate = new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: FIXTURES_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const empty: MatchdayInsightsData = {
    dateKey,
    displayDate,
    top5ShotsOnTargetPer90: [],
    top5ShotsPer90: [],
    top5FoulsPer90: [],
    top5FixturesCombinedXg: [],
    top5TeamsXgPer90: [],
    top5TeamsCornersPer90: [],
    top5CardsPer90: [],
  };

  let fixtureIds: number[];

  if (dateKey === todayDateKey()) {
    const now = new Date();
    const fixtures = await getOrRefreshTodayFixtures(now);
    const filtered = fixtures.filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    );
    fixtureIds = filtered.map((f) => f.id);
  } else {
    const { dayStart, spilloverEnd } = dayBoundsUtc(dateKey);
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: { gte: dayStart, lte: spilloverEnd },
        leagueId: { in: [...REQUIRED_LEAGUE_IDS] },
      },
      orderBy: { date: "asc" },
      select: { id: true },
    });
    fixtureIds = fixtures.map((f) => f.id);
  }

  if (fixtureIds.length === 0) return empty;

  const MAX_FIXTURES = 20;
  const idsToLoad = fixtureIds.slice(0, MAX_FIXTURES);

  const statsResults = await Promise.all(
    idsToLoad.map((id) => getFixtureStats(id)),
  );

  const allStats = statsResults.filter(
    (s): s is NonNullable<typeof s> => s != null,
  );

  const playerEntries: {
    name: string;
    teamName: string;
    href: string;
    minutes: number;
    shotsOnTargetPer90: number;
    shotsPer90: number;
    foulsPer90: number;
    cardsPer90: number;
  }[] = [];

  const fixtureEntries: MatchdayFixtureLeaderEntry[] = [];
  const teamXgMap = new Map<number, { teamName: string; xgPer90: number; href: string }>();
  const teamCornersMap = new Map<number, { teamName: string; cornersPer90: number; href: string }>();

  for (const s of allStats) {
    const homeName = s.fixture.homeTeam.shortName ?? s.fixture.homeTeam.name;
    const awayName = s.fixture.awayTeam.shortName ?? s.fixture.awayTeam.name;
    const href = fixtureHref(
      dateKey,
      s.fixture.league,
      homeName,
      awayName,
    );

    if (s.teamStats) {
      const homeXg = s.teamStats.home.xgPer90 ?? 0;
      const awayXg = s.teamStats.away.xgPer90 ?? 0;
      fixtureEntries.push({
        homeName,
        awayName,
        combinedXg: homeXg + awayXg,
        href,
      });

      const homeTeamId = s.fixture.homeTeam.id;
      const awayTeamId = s.fixture.awayTeam.id;
      const homeTeamName = s.teams.find((t) => t.teamId === homeTeamId)?.teamShortName ?? s.fixture.homeTeam.shortName ?? s.fixture.homeTeam.name;
      const awayTeamName = s.teams.find((t) => t.teamId === awayTeamId)?.teamShortName ?? s.fixture.awayTeam.shortName ?? s.fixture.awayTeam.name;
      if (homeXg > 0 && !teamXgMap.has(homeTeamId)) {
        teamXgMap.set(homeTeamId, { teamName: homeTeamName, xgPer90: homeXg, href });
      }
      if (awayXg > 0 && !teamXgMap.has(awayTeamId)) {
        teamXgMap.set(awayTeamId, { teamName: awayTeamName, xgPer90: awayXg, href });
      }

      const homeCorners = s.teamStats.home.cornersPer90;
      const awayCorners = s.teamStats.away.cornersPer90;
      if (homeCorners > 0 && !teamCornersMap.has(homeTeamId)) {
        teamCornersMap.set(homeTeamId, { teamName: homeTeamName, cornersPer90: homeCorners, href });
      }
      if (awayCorners > 0 && !teamCornersMap.has(awayTeamId)) {
        teamCornersMap.set(awayTeamId, { teamName: awayTeamName, cornersPer90: awayCorners, href });
      }
    }

    for (const team of s.teams) {
      const teamName = team.teamShortName ?? team.teamName;
      for (const p of team.players) {
        if (p.minutes < MIN_MINUTES_FOR_PER90) continue;
        const mins = p.minutes;
        const per90 = (x: number) => (x / mins) * 90;
        playerEntries.push({
          name: p.name,
          teamName,
          href,
          minutes: mins,
          shotsOnTargetPer90: per90(p.shotsOnTarget),
          shotsPer90: per90(p.shots),
          foulsPer90: per90(p.fouls),
          cardsPer90: per90(p.yellowCards + p.redCards),
        });
      }
    }
  }

  const take5 = <T, K>(arr: T[], key: (t: T) => K, desc = true): T[] => {
    const sorted = [...arr].sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      if (typeof va === "number" && typeof vb === "number") {
        return desc ? vb - va : va - vb;
      }
      return 0;
    });
    return sorted.slice(0, 5);
  };

  return {
    dateKey,
    displayDate,
    top5ShotsOnTargetPer90: take5(playerEntries, (e) => e.shotsOnTargetPer90).map((e) => ({
      name: e.name,
      teamName: e.teamName,
      value: Math.round(e.shotsOnTargetPer90 * 10) / 10,
      href: e.href,
    })),
    top5ShotsPer90: take5(playerEntries, (e) => e.shotsPer90).map((e) => ({
      name: e.name,
      teamName: e.teamName,
      value: Math.round(e.shotsPer90 * 10) / 10,
      href: e.href,
    })),
    top5FoulsPer90: take5(playerEntries, (e) => e.foulsPer90).map((e) => ({
      name: e.name,
      teamName: e.teamName,
      value: Math.round(e.foulsPer90 * 10) / 10,
      href: e.href,
    })),
    top5FixturesCombinedXg: take5(fixtureEntries, (e) => e.combinedXg).map((e) => ({
      ...e,
      combinedXg: Math.round(e.combinedXg * 100) / 100,
    })),
    top5TeamsXgPer90: take5(
      Array.from(teamXgMap.entries()),
      ([_, v]) => v.xgPer90,
    ).map(([, v]) => ({
      teamName: v.teamName,
      xgPer90: Math.round(v.xgPer90 * 100) / 100,
      href: v.href,
    })),
    top5TeamsCornersPer90: take5(
      Array.from(teamCornersMap.entries()),
      ([_, v]) => v.cornersPer90,
    ).map(([, v]) => ({
      teamName: v.teamName,
      cornersPer90: Math.round(v.cornersPer90 * 10) / 10,
      href: v.href,
    })),
    top5CardsPer90: take5(playerEntries, (e) => e.cardsPer90).map((e) => ({
      name: e.name,
      teamName: e.teamName,
      value: Math.round(e.cardsPer90 * 10) / 10,
      href: e.href,
    })),
  };
}
