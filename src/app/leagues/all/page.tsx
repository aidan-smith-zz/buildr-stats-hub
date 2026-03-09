import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getUpcomingFixturesFromDb } from "@/lib/fixturesService";
import {
  LEAGUE_DISPLAY_NAMES,
  LEAGUE_GROUP_ORDER,
  STANDINGS_LEAGUE_IDS,
  STANDINGS_LEAGUE_SLUG_BY_ID,
} from "@/lib/leagues";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { getLeagueCrestUrl } from "@/lib/crestsService";
import type { UpcomingFixtureWithCrests } from "@/lib/fixturesService";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const TIMEZONE = "Europe/London";

/** From upcoming fixtures, get the next fixture per standings league (earliest by date). */
function getNextFixturePerLeague(
  byDate: { dateKey: string; fixtures: UpcomingFixtureWithCrests[] }[]
): Map<number, { home: string; away: string; time: string; dateShort: string }> {
  const standingsSet = new Set(STANDINGS_LEAGUE_IDS);
  const allFixtures: { leagueId: number; date: string; home: string; away: string }[] = [];

  for (const { fixtures } of byDate) {
    for (const f of fixtures) {
      const leagueId = f.leagueId ?? null;
      if (leagueId == null || !standingsSet.has(leagueId)) continue;
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      allFixtures.push({
        leagueId,
        date: typeof f.date === "string" ? f.date : new Date(f.date).toISOString(),
        home,
        away,
      });
    }
  }

  allFixtures.sort((a, b) => a.date.localeCompare(b.date));

  const nextByLeague = new Map<
    number,
    { home: string; away: string; time: string; dateShort: string }
  >();
  for (const f of allFixtures) {
    if (nextByLeague.has(f.leagueId)) continue;
    const d = new Date(f.date);
    const time = d.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TIMEZONE,
    });
    const dateShort = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: TIMEZONE,
    });
    nextByLeague.set(f.leagueId, { home: f.home, away: f.away, time, dateShort });
  }
  return nextByLeague;
}

export const metadata: Metadata = {
  title: "Football league tables | Premier League, Championship & more | statsBuildr",
  description:
    "View league tables and standings for Premier League, Championship, Scottish Premiership, League One, League Two, Champions League and Europa League. Points, form and next fixtures.",
  alternates: { canonical: `${BASE_URL}/leagues/all` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Football league tables | Premier League, Championship & more | statsBuildr",
    description:
      "League tables and standings for Premier League, Championship, Scottish Premiership and more. Points, form and next fixtures.",
    url: `${BASE_URL}/leagues/all`,
    siteName: "statsBuildr",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football league tables | Premier League, Championship & more | statsBuildr",
    description:
      "League tables and standings for Premier League, Championship and more. Points, form and next fixtures.",
  },
};

const getLeaguesAllPageData = unstable_cache(
  async () => {
    // Use skipRefresh so this page never triggers a heavy 14-day API refresh.
    // Warm scripts (warm-today / warm-tomorrow) keep UpcomingFixture populated.
    const [byDate, ...crestUrls] = await Promise.all([
      getUpcomingFixturesFromDb({ skipRefresh: true }),
      ...STANDINGS_LEAGUE_IDS.map((id) => getLeagueCrestUrl(id)),
    ]);
    return { byDate, crestUrls };
  },
  ["leagues-all-page-data"],
  { revalidate: 60 * 60 * 12 }, // 12 hours
);

export default async function LeaguesAllPage() {
  const { byDate, crestUrls } = await getLeaguesAllPageData();
  const nextByLeague = getNextFixturePerLeague(byDate);

  const leagues = [...STANDINGS_LEAGUE_IDS].sort((a, b) => {
    const i = LEAGUE_GROUP_ORDER.indexOf(a);
    const j = LEAGUE_GROUP_ORDER.indexOf(b);
    return (i === -1 ? 999 : i) - (j === -1 ? 999 : j);
  });
  const slugById = STANDINGS_LEAGUE_SLUG_BY_ID;
  const crestByLeagueId = new Map(
    STANDINGS_LEAGUE_IDS.map((id, index) => [id, crestUrls[index] ?? null])
  );

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/leagues/all", label: "Leagues" },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Football league tables",
    description: "League tables and standings for supported competitions.",
    numberOfItems: leagues.length,
    itemListElement: leagues.map((id, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: LEAGUE_DISPLAY_NAMES[id] ?? "",
      url: `${BASE_URL}/leagues/${slugById[id]}/standings`,
    })),
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-8 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                League tables
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                All supported leagues
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Current season standings: points, goal difference, wins, draws and losses for each competition.
              </p>
            </div>
            <span className="mt-2 inline-flex flex-shrink-0 items-center rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900 sm:mt-0">
              {leagues.length} leagues
            </span>
          </div>
        </header>

        <section className="space-y-4" aria-label="League list">
          <h2 className="sr-only">League tables</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {leagues.map((leagueId) => {
              const slug = slugById[leagueId];
              const name = LEAGUE_DISPLAY_NAMES[leagueId] ?? "League";
              const crestUrl = crestByLeagueId.get(leagueId) ?? null;
              const next = nextByLeague.get(leagueId);
              const href = `/leagues/${slug}/standings`;

              return (
                <div
                  key={leagueId}
                  className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:shadow-neutral-800/50 sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    {crestUrl ? (
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-11 sm:w-11"
                        aria-hidden
                      >
                        <img
                          src={crestUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 sm:h-11 sm:w-11"
                        aria-hidden
                      >
                        {name.slice(0, 1)}
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                      {name}
                    </h3>
                  </div>
                  {next ? (
                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {next.home} v {next.away}
                      </span>
                      <span className="ml-1.5 text-neutral-500 dark:text-neutral-500">
                        {next.time} · {next.dateShort}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
                      No upcoming fixture in the next 14 days
                    </p>
                  )}
                  <div className="mt-4 flex flex-1 items-end justify-between gap-2">
                    <NavLinkWithOverlay
                      href={href}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors group-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:group-hover:bg-neutral-700"
                      message="Loading league table…"
                    >
                      View table
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </NavLinkWithOverlay>
                    <NavLinkWithOverlay
                      href={`/leagues/${slug}/stats`}
                      className="text-xs font-medium text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                      message="Loading league stats…"
                    >
                      League stats
                    </NavLinkWithOverlay>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800">
          <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NavLinkWithOverlay
              href="/"
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
              message="Loading…"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Today&apos;s fixtures
              </span>
              <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/fixtures/upcoming"
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
              message="Loading…"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Upcoming fixtures
              </span>
              <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
          </div>
          <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500">
            Match previews, team form and player stats
          </p>
        </section>
      </main>
    </div>
  );
}
