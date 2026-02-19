import type { MetadataRoute } from "next";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  try {
    const fixtures = await getOrRefreshTodayFixtures(new Date());
    const dateKey = todayDateKey();
    const filtered = fixtures.filter(
      (f) =>
        f.leagueId != null &&
        (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId),
    );

    entries.push({
      url: `${baseUrl}/fixtures/${dateKey}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    });

    for (const f of filtered) {
      const leagueSlug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const match = matchSlug(home, away);
      entries.push({
        url: `${baseUrl}/fixtures/${dateKey}/${leagueSlug}/${match}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error("[sitemap] Failed to fetch fixtures:", err);
  }

  return entries;
}
