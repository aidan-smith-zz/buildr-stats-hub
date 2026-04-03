import type { MetadataRoute } from "next";
import {
  getFixturesForDateFromDbOnly,
  getUpcomingFixturesFromDb,
} from "@/lib/fixturesService";
import { isFixtureInRequiredLeagues, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { nextDateKeys, todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

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
 * - /fixtures/[date] and /fixtures/[date]/ai-insights only today & tomorrow; form|matchday-insights for upcoming horizon
 * - /fixtures/[date]/[league]/[match] intentionally excluded (deep pages are noindex)
 * - /fixtures/past, /fixtures/upcoming, /fixtures/live
 * - /leagues/all; /leagues/[slug]/standings|stats|form|markets/*
 * - /teams/all (team profile /teams/[slug] omitted — noindex / not in sitemap)
 * - /predictions, /predictions/[date], /predictions/[date]/btts|total-goals|corners|cards (today + next 13 days)
 */

/**
 * ISR (seconds): full sitemap build runs at most once per day on revalidation.
 * Next.js 16 requires a numeric literal here. Avoid duplicating Cache-Control in `next.config.ts` for
 * `/sitemap.xml` — custom headers can conflict with Next/Vercel ISR and increase origin CPU (Fluid).
 */
export const revalidate = 86400;

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

    // Deep fixture pages are noindex, so keep them out of sitemap to reduce crawl pressure.
  } catch (err) {
    console.error("[sitemap] Failed to fetch today fixtures:", err);
  }

  // Next 14 days: fixture URLs from UpcomingFixture table (populated when warm-today runs without --resume).
  // skipRefresh so sitemap never triggers 14-day API refresh (would timeout).
  try {
    const upcomingByDate = await getUpcomingFixturesFromDb({ skipRefresh: true });
    let sawTomorrowHub = false;
    for (const { dateKey: dayKey } of upcomingByDate) {
      const dayLastmod = upcomingLastmodMap.get(dayKey) ?? now;
      if (dayKey === tomorrowKey) {
        sawTomorrowHub = true;
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}`,
          lastModified: dayLastmod,
          changeFrequency: "daily",
          priority: 0.85,
        });
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/ai-insights`,
          lastModified: dayLastmod,
          changeFrequency: "daily",
          priority: 0.65,
        });
      }
      entries.push(
        { url: `${baseUrl}/fixtures/${dayKey}/form`, lastModified: dayLastmod, changeFrequency: "daily", priority: 0.7 },
        { url: `${baseUrl}/fixtures/${dayKey}/matchday-insights`, lastModified: dayLastmod, changeFrequency: "daily", priority: 0.7 },
      );
      // Deep fixture pages are noindex, so keep them out of sitemap to reduce crawl pressure.
    }
    if (!sawTomorrowHub) {
      const tm = upcomingLastmodMap.get(tomorrowKey) ?? now;
      entries.push(
        {
          url: `${baseUrl}/fixtures/${tomorrowKey}`,
          lastModified: tm,
          changeFrequency: "daily",
          priority: 0.85,
        },
        {
          url: `${baseUrl}/fixtures/${tomorrowKey}/ai-insights`,
          lastModified: tm,
          changeFrequency: "daily",
          priority: 0.65,
        },
      );
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch upcoming fixtures:", err);
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

  // /teams/[slug] profile pages are noindex and omitted from sitemap to limit crawler load.

  return entries;
}
