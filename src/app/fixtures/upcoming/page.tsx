import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getFixturesForDateFromDbOnly, getUpcomingFixturesFromDb } from "@/lib/fixturesService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { UpcomingFixturesList } from "./upcoming-fixtures-list";
import type { WarmedFixtureSnapshot } from "./upcoming-fixtures-list";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const metadata: Metadata = {
  title: "Upcoming football fixtures | Next 14 days – match previews & bet builder stats",
  description:
    "View upcoming football fixtures for the next 14 days. Premier League, Championship and more: match previews, team stats, lineups and AI bet builder insights before kick-off.",
  alternates: { canonical: `${BASE_URL}/fixtures/upcoming` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Upcoming football fixtures | Next 14 days – match previews & bet builder stats",
    description:
      "View upcoming football fixtures for the next 14 days. Match previews, team stats, lineups and AI bet builder insights before kick-off.",
    url: `${BASE_URL}/fixtures/upcoming`,
    siteName: "statsBuildr",
    type: "website",
    images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: "Upcoming fixtures on statsBuildr" }],
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Upcoming football fixtures | Next 14 days – match previews & bet builder stats",
    description:
      "View upcoming football fixtures for the next 14 days. Match previews, team stats, lineups and AI bet builder insights.",
    images: [`${BASE_URL}/stats-buildr.png`],
  },
};

function toWarmedSnapshot(f: FixtureSummary): WarmedFixtureSnapshot {
  const date = f.date instanceof Date ? f.date.toISOString() : String(f.date);
  return {
    date,
    statusShort: f.statusShort ?? null,
    league: f.league ?? null,
    leagueId: f.leagueId ?? null,
    homeTeam: { name: f.homeTeam.name, shortName: f.homeTeam.shortName },
    awayTeam: { name: f.awayTeam.name, shortName: f.awayTeam.shortName },
  };
}

const getUpcomingPageData = unstable_cache(
  async () => {
    const byDate = await getUpcomingFixturesFromDb();

    // Build a lookup of "warmed" fixtures (i.e. present in the main Fixture table with stats)
    // keyed by date + leagueSlug + matchSlug so we can show "View stats" and live badges.
    const warmedByKey = new Map<string, FixtureSummary>();
    await Promise.all(
      byDate.map(async ({ dateKey }) => {
        const warmed = await getFixturesForDateFromDbOnly(dateKey);
        for (const fixture of warmed) {
          const leagueSlug = leagueToSlug(fixture.league);
          const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
          const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
          const m = matchSlug(home, away);
          const key = `${dateKey}:${leagueSlug}:${m}`;
          if (!warmedByKey.has(key)) {
            warmedByKey.set(key, fixture);
          }
        }
      }),
    );

    const warmedByKeySerialized: Record<string, WarmedFixtureSnapshot> = {};
    for (const [k, v] of warmedByKey) {
      warmedByKeySerialized[k] = toWarmedSnapshot(v);
    }

    return { byDate, warmedByKeySerialized };
  },
  ["upcoming-page-data"],
  { revalidate: 60 * 60 * 24 },
);

export default async function UpcomingPage() {
  const { byDate, warmedByKeySerialized } = await getUpcomingPageData();

  const todayKey = todayDateKey();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Home" },
            { href: "/fixtures/upcoming", label: "Upcoming fixtures" },
          ]}
          className="mb-3"
        />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Next 14 days
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                Upcoming football fixtures
              </h1>
            </div>
            <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
              Match previews &amp; stats
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Browse Premier League, Championship and more. Each fixture links to match previews, team stats, lineups and bet builder data as kick-off approaches.
          </p>
        </header>

        <UpcomingFixturesList byDate={byDate} warmedByKey={warmedByKeySerialized} />

        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            For today&apos;s fixtures and AI insights, see{" "}
            <NavLinkWithOverlay href="/" className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              today&apos;s football fixtures
            </NavLinkWithOverlay>
            ,{" "}
            <NavLinkWithOverlay href={`/fixtures/${todayKey}/ai-insights`} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              AI football insights
            </NavLinkWithOverlay>
            {" "}and{" "}
            <NavLinkWithOverlay href={`/fixtures/${todayKey}/form`} className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              form table
            </NavLinkWithOverlay>
            {" "}and{" "}
            <NavLinkWithOverlay href="/fixtures/past" className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300">
              past fixtures
            </NavLinkWithOverlay>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
