import type { MetadataRoute } from "next";
import {
  getFixturesForDateFromDbOnly,
  getUpcomingFixturesFromDb,
} from "@/lib/fixturesService";
import {
  LEAGUE_DISPLAY_NAMES,
  REQUIRED_LEAGUE_IDS,
  STANDINGS_LEAGUE_SLUG_BY_ID,
} from "@/lib/leagues";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { makeTeamSlug } from "@/lib/teamSlugs";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

// Top leagues we create dedicated team pages for (must stay in sync with teamPageService).
const TOP_TEAM_LEAGUE_IDS = [39, 40, 179, 2, 3] as const;
const TOP_TEAM_LEAGUE_KEYS = TOP_TEAM_LEAGUE_IDS.map((id) => LEAGUE_DISPLAY_NAMES[id]);

export const dynamic = "force-dynamic";
/** Prevent sitemap from being cached so it reflects latest fixtures after warm-today. */
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  // Fetch lastmod data for standings and upcoming (used later).
  const [standingsCacheRows, upcomingLastmodByDate] = await Promise.all([
    prisma.leagueStandingsCache.findMany({ where: { season: API_SEASON }, select: { leagueId: true, updatedAt: true } }).catch(() => [] as { leagueId: number; updatedAt: Date }[]),
    prisma.upcomingFixture.groupBy({ by: ["dateKey"], _max: { updatedAt: true } }).catch(() => []),
  ]);
  const leagueLastmodByLeagueId = new Map(standingsCacheRows.map((r) => [r.leagueId, r.updatedAt]));
  const upcomingLastmodMap = new Map(upcomingLastmodByDate.map((r) => [r.dateKey, r._max.updatedAt ?? now]));

  try {
    const dateKey = todayDateKey();
    const fixtures = await getFixturesForDateFromDbOnly(dateKey);
    const filtered = fixtures.filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    );

    let todayLastmod = now;
    const fixtureLastmodById = new Map<number, Date>();
    if (filtered.length > 0) {
      const fixtureRows = await prisma.fixture.findMany({
        where: { id: { in: filtered.map((f) => f.id) } },
        select: { id: true, updatedAt: true },
        include: { liveScoreCache: { select: { cachedAt: true } } },
      });
      for (const row of fixtureRows) {
        const scoreCached = row.liveScoreCache?.cachedAt;
        const lastmod = scoreCached && scoreCached > row.updatedAt ? scoreCached : row.updatedAt;
        fixtureLastmodById.set(row.id, lastmod);
        if (lastmod > todayLastmod) todayLastmod = lastmod;
      }
    }

    entries.push({
      url: `${baseUrl}/fixtures/${dateKey}`,
      lastModified: todayLastmod,
      changeFrequency: "daily",
      priority: 0.9,
    });
    entries.push(
      { url: `${baseUrl}/fixtures/${dateKey}/ai-insights`, lastModified: todayLastmod, changeFrequency: "daily", priority: 0.7 },
      { url: `${baseUrl}/fixtures/${dateKey}/form`, lastModified: todayLastmod, changeFrequency: "daily", priority: 0.7 },
      { url: `${baseUrl}/fixtures/${dateKey}/matchday-insights`, lastModified: todayLastmod, changeFrequency: "daily", priority: 0.7 },
    );

    for (const f of filtered) {
      const leagueSlug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const match = matchSlug(home, away);
      entries.push({
        url: `${baseUrl}/fixtures/${dateKey}/${leagueSlug}/${match}`,
        lastModified: fixtureLastmodById.get(f.id) ?? todayLastmod,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch today fixtures:", err);
  }

  // Next 14 days: fixture URLs from UpcomingFixture table (populated when warm-today runs without --resume).
  // skipRefresh so sitemap never triggers 14-day API refresh (would timeout).
  try {
    const upcomingByDate = await getUpcomingFixturesFromDb({ skipRefresh: true });
    for (const { dateKey: dayKey, fixtures: dayFixtures } of upcomingByDate) {
      const dayLastmod = upcomingLastmodMap.get(dayKey) ?? now;
      entries.push({
        url: `${baseUrl}/fixtures/${dayKey}`,
        lastModified: dayLastmod,
        changeFrequency: "daily",
        priority: 0.9,
      });
      entries.push(
        { url: `${baseUrl}/fixtures/${dayKey}/ai-insights`, lastModified: dayLastmod, changeFrequency: "daily", priority: 0.7 },
        { url: `${baseUrl}/fixtures/${dayKey}/form`, lastModified: dayLastmod, changeFrequency: "daily", priority: 0.7 },
        { url: `${baseUrl}/fixtures/${dayKey}/matchday-insights`, lastModified: dayLastmod, changeFrequency: "daily", priority: 0.7 },
      );
      for (const f of dayFixtures) {
        const leagueSlug = leagueToSlug(f.league ?? null);
        const home = f.homeTeam.shortName ?? f.homeTeam.name;
        const away = f.awayTeam.shortName ?? f.awayTeam.name;
        const match = matchSlug(home, away);
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/${leagueSlug}/${match}`,
          lastModified: dayLastmod,
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch upcoming fixtures:", err);
  }

  // Leagues landing page.
  entries.push({
    url: `${baseUrl}/leagues/all`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  });

  // League standings pages (one per standings league).
  for (const [leagueId, slug] of Object.entries(STANDINGS_LEAGUE_SLUG_BY_ID)) {
    const lastmod = leagueLastmodByLeagueId.get(Number(leagueId)) ?? now;
    entries.push({
      url: `${baseUrl}/leagues/${slug}/standings`,
      lastModified: lastmod,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  // Team pages for top leagues only (teams with season stats in our tracked competitions).
  try {
    const seasonRows = await prisma.teamSeasonStats.findMany({
      where: {
        season: API_SEASON,
        league: { in: TOP_TEAM_LEAGUE_KEYS },
      },
      select: { teamId: true, updatedAt: true },
    });

    const teamIds = Array.from(new Set(seasonRows.map((row) => row.teamId)));
    const teamLastmodById = new Map<number, Date>();
    for (const row of seasonRows) {
      const existing = teamLastmodById.get(row.teamId);
      if (!existing || row.updatedAt > existing) teamLastmodById.set(row.teamId, row.updatedAt);
    }

    if (teamIds.length > 0) {
      const teams = await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: {
          id: true,
          name: true,
          shortName: true,
        },
      });

      for (const team of teams) {
        const displayName = team.shortName ?? team.name;
        const slug = makeTeamSlug(displayName);
        const lastmod = teamLastmodById.get(team.id) ?? now;

        entries.push({
          url: `${baseUrl}/teams/${slug}`,
          lastModified: lastmod,
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch team pages:", err);
  }

  return entries;
}
