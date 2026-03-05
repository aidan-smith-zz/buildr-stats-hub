import type { MetadataRoute } from "next";
import {
  getOrRefreshTodayFixtures,
  getUpcomingFixturesFromDb,
} from "@/lib/fixturesService";
import { REQUIRED_LEAGUE_IDS, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

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

  try {
    const fixtures = await getOrRefreshTodayFixtures(now);
    const dateKey = todayDateKey();
    const filtered = fixtures.filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    );

    entries.push({
      url: `${baseUrl}/fixtures/${dateKey}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    });
    entries.push(
      { url: `${baseUrl}/fixtures/${dateKey}/ai-insights`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
      { url: `${baseUrl}/fixtures/${dateKey}/form`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
      { url: `${baseUrl}/fixtures/${dateKey}/matchday-insights`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    );

    for (const f of filtered) {
      const leagueSlug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const match = matchSlug(home, away);
      entries.push({
        url: `${baseUrl}/fixtures/${dateKey}/${leagueSlug}/${match}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch today fixtures:", err);
  }

  // Next 14 days: fixture URLs from UpcomingFixture table (populated when warm-today runs without --resume).
  try {
    const upcomingByDate = await getUpcomingFixturesFromDb();
    for (const { dateKey: dayKey, fixtures: dayFixtures } of upcomingByDate) {
      entries.push({
        url: `${baseUrl}/fixtures/${dayKey}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.9,
      });
      entries.push(
        { url: `${baseUrl}/fixtures/${dayKey}/ai-insights`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
        { url: `${baseUrl}/fixtures/${dayKey}/form`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
        { url: `${baseUrl}/fixtures/${dayKey}/matchday-insights`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
      );
      for (const f of dayFixtures) {
        const leagueSlug = leagueToSlug(f.league ?? null);
        const home = f.homeTeam.shortName ?? f.homeTeam.name;
        const away = f.awayTeam.shortName ?? f.awayTeam.name;
        const match = matchSlug(home, away);
        entries.push({
          url: `${baseUrl}/fixtures/${dayKey}/${leagueSlug}/${match}`,
          lastModified: now,
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
  for (const slug of Object.values(STANDINGS_LEAGUE_SLUG_BY_ID)) {
    entries.push({
      url: `${baseUrl}/leagues/${slug}/standings`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return entries;
}
