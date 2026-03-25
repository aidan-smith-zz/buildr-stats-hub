import type { MetadataRoute } from "next";
import {
  getFixturesForDateFromDbOnly,
  getUpcomingFixturesFromDb,
} from "@/lib/fixturesService";
import {
  LEAGUE_DISPLAY_NAMES,
  isFixtureInRequiredLeagues,
  STANDINGS_LEAGUE_SLUG_BY_ID,
  TOP_LEAGUE_IDS,
} from "@/lib/leagues";
import { leagueToSlug, matchSlug, nextDateKeys, pastDateKeys, todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { makeTeamSlug } from "@/lib/teamSlugs";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

const TOP_TEAM_LEAGUE_KEYS = TOP_LEAGUE_IDS.map((id) => LEAGUE_DISPLAY_NAMES[id]);

/** Newest of two optional timestamps (for league hub lastmod). */
function maxOfTwoDates(a: Date | undefined, b: Date | undefined, fallback: Date): Date {
  if (!a && !b) return fallback;
  if (!a) return b!;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/*
 * Sitemap coverage (keep in sync with `src/app` routes):
 * - Home, about, contact
 * - /fixtures (hub redirects — omit; canonical is /fixtures/[date])
 * - /fixtures/[date], /fixtures/[date]/ai-insights|form|matchday-insights (today, upcoming 14d, past 14d)
 * - /fixtures/[date]/[league]/[match] and /live
 * - /fixtures/past, /fixtures/upcoming, /fixtures/live
 * - /leagues/all; /leagues/[slug]/standings|stats|form|markets/*
 * - /teams/all; /teams/[slug] and /teams/[slug]/markets/*
 * - /predictions, /predictions/[date], /predictions/[date]/btts|total-goals|corners|cards (today + next 13 days)
 */

/** Regenerate every request so URLs reflect latest fixtures (literal `0` required for static analysis in Next.js 16+). */
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const todayKey = todayDateKey();
  const tomorrowKey = tomorrowDateKey();
  /** Today + next 13 days (14 rolling days, aligned with upcoming fixtures horizon). */
  const predictionDateKeys = [todayKey, ...nextDateKeys(13)];

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/fixtures`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/predictions`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const PREDICTION_MARKETS = ["btts", "total-goals", "corners", "cards"] as const;
  for (const dk of predictionDateKeys) {
    const isToday = dk === todayKey;
    const isTomorrow = dk === tomorrowKey;
    const hubPriority = isToday ? 0.8 : isTomorrow ? 0.75 : 0.65;
    const marketPriority = isToday ? 0.7 : isTomorrow ? 0.65 : 0.55;
    entries.push({
      url: `${baseUrl}/predictions/${dk}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: hubPriority,
    });
    for (const m of PREDICTION_MARKETS) {
      entries.push({
        url: `${baseUrl}/predictions/${dk}/${m}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: marketPriority,
      });
    }
  }

  // Fetch lastmod data for standings, stats hubs, and upcoming (used later).
  const [standingsCacheRows, statsLastmodRows, upcomingLastmodByDate] = await Promise.all([
    prisma.leagueStandingsCache.findMany({ where: { season: API_SEASON }, select: { leagueId: true, updatedAt: true } }).catch(() => [] as { leagueId: number; updatedAt: Date }[]),
    prisma.teamSeasonStats
      .groupBy({
        by: ["leagueId"],
        where: { season: API_SEASON, leagueId: { not: null } },
        _max: { updatedAt: true },
      })
      .catch(() => [] as { leagueId: number | null; _max: { updatedAt: Date | null } }[]),
    prisma.upcomingFixture.groupBy({ by: ["dateKey"], _max: { updatedAt: true } }).catch(() => []),
  ]);
  const leagueLastmodByLeagueId = new Map(standingsCacheRows.map((r) => [r.leagueId, r.updatedAt]));
  const statsLastmodByLeagueId = new Map(
    statsLastmodRows
      .filter((r): r is { leagueId: number; _max: { updatedAt: Date | null } } => r.leagueId != null)
      .map((r) => [r.leagueId, r._max.updatedAt ?? now])
  );
  const upcomingLastmodMap = new Map(upcomingLastmodByDate.map((r) => [r.dateKey, r._max.updatedAt ?? now]));

  try {
    const dateKey = todayDateKey();
    const fixtures = await getFixturesForDateFromDbOnly(dateKey);
    const filtered = fixtures.filter((f) =>
      isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
    );

    let todayLastmod = now;
    const fixtureLastmodById = new Map<number, Date>();
    if (filtered.length > 0) {
      const fixtureRows = await prisma.fixture.findMany({
        where: { id: { in: filtered.map((f) => f.id) } },
        select: {
          id: true,
          updatedAt: true,
          liveScoreCache: {
            select: { cachedAt: true },
          },
        },
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
      const fixtureLastmod = fixtureLastmodById.get(f.id) ?? todayLastmod;
      entries.push({
        url: `${baseUrl}/fixtures/${dateKey}/${leagueSlug}/${match}`,
        lastModified: fixtureLastmod,
        changeFrequency: "daily",
        priority: 0.8,
      });
      // Live match URL: helps Google discover "X vs Y live" pages during matches.
      entries.push({
        url: `${baseUrl}/fixtures/${dateKey}/${leagueSlug}/${match}/live`,
        lastModified: fixtureLastmod,
        changeFrequency: "hourly",
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
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/${leagueSlug}/${match}/live`,
          lastModified: dayLastmod,
          changeFrequency: "hourly",
          priority: 0.75,
        });
      }
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch upcoming fixtures:", err);
  }

  // Past 14 days: finished / recent match URLs (same retention as past fixtures page).
  try {
    for (const dayKey of pastDateKeys(14)) {
      const dayFixtures = await getFixturesForDateFromDbOnly(dayKey);
      const filtered = dayFixtures.filter((f) =>
        isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
      );
      if (filtered.length === 0) continue;

      let dayLastmod = now;
      const fixtureLastmodById = new Map<number, Date>();
      const fixtureRows = await prisma.fixture.findMany({
        where: { id: { in: filtered.map((f) => f.id) } },
        select: {
          id: true,
          updatedAt: true,
          liveScoreCache: { select: { cachedAt: true } },
        },
      });
      for (const row of fixtureRows) {
        const scoreCached = row.liveScoreCache?.cachedAt;
        const lastmod = scoreCached && scoreCached > row.updatedAt ? scoreCached : row.updatedAt;
        fixtureLastmodById.set(row.id, lastmod);
        if (lastmod > dayLastmod) dayLastmod = lastmod;
      }

      entries.push({
        url: `${baseUrl}/fixtures/${dayKey}`,
        lastModified: dayLastmod,
        changeFrequency: "daily",
        priority: 0.75,
      });
      entries.push(
        {
          url: `${baseUrl}/fixtures/${dayKey}/ai-insights`,
          lastModified: dayLastmod,
          changeFrequency: "weekly",
          priority: 0.55,
        },
        {
          url: `${baseUrl}/fixtures/${dayKey}/form`,
          lastModified: dayLastmod,
          changeFrequency: "weekly",
          priority: 0.55,
        },
        {
          url: `${baseUrl}/fixtures/${dayKey}/matchday-insights`,
          lastModified: dayLastmod,
          changeFrequency: "weekly",
          priority: 0.55,
        },
      );

      for (const f of filtered) {
        const leagueSlug = leagueToSlug(f.league);
        const home = f.homeTeam.shortName ?? f.homeTeam.name;
        const away = f.awayTeam.shortName ?? f.awayTeam.name;
        const match = matchSlug(home, away);
        const fixtureLastmod = fixtureLastmodById.get(f.id) ?? dayLastmod;
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/${leagueSlug}/${match}`,
          lastModified: fixtureLastmod,
          changeFrequency: "weekly",
          priority: 0.7,
        });
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/${leagueSlug}/${match}/live`,
          lastModified: fixtureLastmod,
          changeFrequency: "weekly",
          priority: 0.65,
        });
      }
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch past fixture URLs:", err);
  }

  // Fixture hub pages (high value for "live scores", "upcoming fixtures", "past results").
  entries.push(
    { url: `${baseUrl}/fixtures/past`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/fixtures/upcoming`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/fixtures/live`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
  );

  // About & contact (trust and discovery).
  entries.push({
    url: `${baseUrl}/about`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  });
  entries.push({
    url: `${baseUrl}/contact`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  });

  // Hub pages: leagues and teams index (strong internal linking targets).
  entries.push({
    url: `${baseUrl}/leagues/all`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  });
  entries.push({
    url: `${baseUrl}/teams/all`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  });

  // League standings, stats, form and market pages (one per standings league).
  for (const [leagueId, slug] of Object.entries(STANDINGS_LEAGUE_SLUG_BY_ID)) {
    const id = Number(leagueId);
    const lastmodStandings = leagueLastmodByLeagueId.get(id);
    const lastmodStats = statsLastmodByLeagueId.get(id);
    const lastmodStandingsOrNow = lastmodStandings ?? now;
    const lastmodStatsOrNow = lastmodStats ?? now;
    /** Form uses standings team list + TeamFixtureCache; use freshest league-level signal. */
    const lastmodLeagueForm = maxOfTwoDates(lastmodStandings, lastmodStats, now);

    entries.push({
      url: `${baseUrl}/leagues/${slug}/standings`,
      lastModified: lastmodStandingsOrNow,
      changeFrequency: "daily",
      priority: 0.6,
    });
    entries.push({
      url: `${baseUrl}/leagues/${slug}/stats`,
      lastModified: lastmodStatsOrNow,
      changeFrequency: "daily",
      priority: 0.6,
    });
    entries.push({
      url: `${baseUrl}/leagues/${slug}/form`,
      lastModified: lastmodLeagueForm,
      changeFrequency: "daily",
      priority: 0.65,
    });
    // League market pages for competitions that have league-level stats.
    entries.push(
      {
        url: `${baseUrl}/leagues/${slug}/markets/btts`,
        lastModified: lastmodStatsOrNow,
        changeFrequency: "daily",
        priority: 0.6,
      },
      {
        url: `${baseUrl}/leagues/${slug}/markets/total-goals`,
        lastModified: lastmodStatsOrNow,
        changeFrequency: "daily",
        priority: 0.6,
      },
      {
        url: `${baseUrl}/leagues/${slug}/markets/corners`,
        lastModified: lastmodStatsOrNow,
        changeFrequency: "daily",
        priority: 0.6,
      },
      {
        url: `${baseUrl}/leagues/${slug}/markets/cards`,
        lastModified: lastmodStatsOrNow,
        changeFrequency: "daily",
        priority: 0.6,
      },
    );
  }

  // Team pages for top leagues only (teams with season stats in our tracked competitions).
  // Match teamPageService: include by league name or leagueId so we don't miss "EFL Championship" etc.
  try {
    const seasonRows = await prisma.teamSeasonStats.findMany({
      where: {
        season: API_SEASON,
        OR: [
          { league: { in: TOP_TEAM_LEAGUE_KEYS } },
          { leagueId: { in: TOP_LEAGUE_IDS as unknown as number[] } },
        ],
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
        // Team market pages (BTTS, total goals, corners, cards) for teams we have season stats for.
        entries.push(
          {
            url: `${baseUrl}/teams/${slug}/markets/btts`,
            lastModified: lastmod,
            changeFrequency: "daily",
            priority: 0.6,
          },
          {
            url: `${baseUrl}/teams/${slug}/markets/total-goals`,
            lastModified: lastmod,
            changeFrequency: "daily",
            priority: 0.6,
          },
          {
            url: `${baseUrl}/teams/${slug}/markets/corners`,
            lastModified: lastmod,
            changeFrequency: "daily",
            priority: 0.6,
          },
          {
            url: `${baseUrl}/teams/${slug}/markets/cards`,
            lastModified: lastmod,
            changeFrequency: "daily",
            priority: 0.6,
          },
        );
      }
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch team pages:", err);
  }

  return entries;
}
