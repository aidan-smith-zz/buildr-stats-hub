import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getFixturePreview,
  getFixturesForDateFromDbOnly,
  getOrRefreshTodayFixtures,
} from "@/lib/fixturesService";
import { withPoolRetry } from "@/lib/poolRetry";
import { fetchLiveFixture } from "@/lib/footballApi";
import { prisma } from "@/lib/prisma";
import { getFixtureStats } from "@/lib/statsService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { RawFixture } from "@/lib/footballApi";
import type { FixtureSummary } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { PastFixtureView, type PastFixtureScore } from "./past-fixture-view";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const FIXTURES_TIMEZONE = "Europe/London";

function findTodayFixture(
  fixtures: FixtureSummary[],
  leagueSlug: string,
  matchSlugParam: string
): FixtureSummary | null {
  const filtered = fixtures.filter(
    (f) =>
      f.leagueId != null &&
      (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
  );
  return (
    filtered.find((f) => {
      const slug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const m = matchSlug(home, away);
      return slug === leagueSlug && m === matchSlugParam;
    }) ?? null
  );
}

export const dynamicParams = true;

function formatKickoff(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    return d.toLocaleTimeString("en-GB", {
      timeZone: FIXTURES_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDisplayDate(dateKey: string): string {
  try {
    const d = new Date(dateKey + "T12:00:00.000Z");
    return d.toLocaleDateString("en-GB", {
      timeZone: FIXTURES_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateKey;
  }
}

function getYear(dateKey: string): string {
  return dateKey.slice(0, 4);
}

/** API-Football statusShort values that mean the match is finished. */
const FINISHED_STATUS = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function isMatchEnded(statusShort: string): boolean {
  return FINISHED_STATUS.has(statusShort);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}): Promise<Metadata> {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } =
    await params;

  if (dateKey === todayDateKey()) {
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixtures(new Date()));
    const fixture = findTodayFixture(fixtures, leagueSlug, matchSlugParam);
    if (!fixture) {
      return { title: "Fixture not found", robots: { index: true, follow: true } };
    }
    const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
    const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
    const league = fixture.league ?? "Football";
    const year = getYear(dateKey);
    const title = `${home} vs ${away} Preview, Stats & AI insights | ${league} ${year}`;
    const description = `${home} vs ${away} ${league} stats and lineups with xG, corners, cards, shots per 90 and bet builder stats, plus AI-powered football insights.`;
    const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: "statsBuildr",
        type: "website",
        images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} statsBuildr` }],
        locale: "en_GB",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`${BASE_URL}/stats-buildr.png`],
      },
    };
  }

  // Past or upcoming: prefer warmed fixture from DB
  const warmedFixtures = await withPoolRetry(() => getFixturesForDateFromDbOnly(dateKey));
  const warmedFixture = findTodayFixture(warmedFixtures, leagueSlug, matchSlugParam);
  if (warmedFixture) {
    const home = warmedFixture.homeTeam.shortName ?? warmedFixture.homeTeam.name;
    const away = warmedFixture.awayTeam.shortName ?? warmedFixture.awayTeam.name;
    const league = warmedFixture.league ?? "Football";
    const year = getYear(dateKey);
    const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
    const isPast = dateKey < todayDateKey();
    const title = isPast
      ? `${home} vs ${away} Result & lineups | ${league} ${year}`
      : `${home} vs ${away} Preview, Stats & AI insights | ${league} ${year}`;
    const description = isPast
      ? `${home} vs ${away} ${league} final result and lineups.`
      : `${home} vs ${away} ${league} stats and lineups with xG, corners, cards, shots per 90 and bet builder stats, plus AI-powered football insights.`;
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: "statsBuildr",
        type: "website",
        images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} statsBuildr` }],
        locale: "en_GB",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`${BASE_URL}/stats-buildr.png`],
      },
    };
  }

  const fixture = await getFixturePreview(dateKey, leagueSlug, matchSlugParam);
  if (!fixture) {
    return {
      title: "Fixture not found",
      description: "No fixtures scheduled for this date.",
      robots: { index: true, follow: true },
    };
  }

  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const year = getYear(dateKey);
  const title = `${home} vs ${away} Preview, Stats & AI insights | ${league} ${year}`;
  const description = `${home} vs ${away} ${league} stats and lineups with xG, corners, cards, shots per 90 and bet builder stats, plus AI-powered football insights.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      type: "website",
      images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} statsBuildr` }],
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/stats-buildr.png`],
    },
  };
}

const DEBUG_FIXTURE = process.env.DEBUG_FIXTURE === "1" || process.env.DEBUG_FIXTURE === "true";

export default async function FixtureMatchPage({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}) {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } =
    await params;

  if (DEBUG_FIXTURE) {
    console.log("[fixture-debug] page open", { dateKey, leagueSlug, match: matchSlugParam });
  }

  // Today: full flow (dashboard, redirect if not found)
  if (dateKey === todayDateKey()) {
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixtures(new Date()));
    const fixture = findTodayFixture(fixtures, leagueSlug, matchSlugParam);
    if (!fixture) {
      if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=today fixture=not-found redirect");
      redirect("/");
    }
    if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=today fixtureId=" + fixture.id + " (full dashboard, client will fetch /api/fixtures/" + fixture.id + "/stats)");
    const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
    const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
    const league = fixture.league ?? "Football";
    const kickoff = typeof fixture.date === "string" ? fixture.date : fixture.date?.toISOString?.() ?? new Date(dateKey + "T12:00:00.000Z").toISOString();
    const endDate = new Date(new Date(kickoff).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const description = `${home} vs ${away} ${league} match with live stats, confirmed lineups and AI-powered bet builder insights on statsBuildr.`;
    const displayDate = formatDisplayDate(dateKey);
    const sportsEventJsonLd = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${home} vs ${away}`,
      startDate: kickoff,
      endDate,
      description,
      image: [`${BASE_URL}/stats-buildr.png`],
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: `${league} fixture`,
        address: {
          "@type": "PostalAddress",
          addressCountry: "GB",
        },
      },
      organizer: {
        "@type": "Organization",
        name: "statsBuildr",
        url: BASE_URL,
      },
      offers: {
        "@type": "Offer",
        url: `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`,
        price: "0",
        priceCurrency: "GBP",
        availability: "https://schema.org/InStock",
      },
      competitor: [
        { "@type": "SportsTeam", name: home },
        { "@type": "SportsTeam", name: away },
      ],
      sport: "Football",
    };

    const breadcrumbItems = [
      { href: "/", label: "Home" },
      { href: `/fixtures/${dateKey}`, label: formatDisplayDate(dateKey) },
      { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${home} vs ${away}` },
    ];

    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: `${BASE_URL}${item.href === "/" ? "" : item.href}`,
      })),
    };

    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {league ?? "Football"} · {displayDate}
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    {home}
                    <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                    {away}
                  </h1>
                </div>
                <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                  Match stats &amp; lineups
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                On {displayDate}, {home} face {away} in the {league}. This page shows match stats,
                confirmed lineups, xG, corners, cards and player performance numbers to help you build smarter bet builder selections.
              </p>
              {Object.values(STANDINGS_LEAGUE_SLUG_BY_ID).includes(leagueSlug) && (
                <nav
                  className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
                  aria-label="League table"
                >
                  <NavLinkWithOverlay
                    href={`/leagues/${leagueSlug}/standings`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league table…"
                  >
                    View {league} league table →
                  </NavLinkWithOverlay>
                </nav>
              )}
            </header>
            <TodayFixturesDashboard
              fixtures={fixtures}
              initialSelectedId={String(fixture.id)}
              hideFixtureSelector
            />
            <section className="mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800">
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-6 dark:border-violet-800/50 dark:bg-violet-950/20">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  New AI insights
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  We scan today&apos;s fixtures & stats then we surface the trends
                  that matter
                </p>
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/ai-insights`}
                  className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
                  message="Loading insights…"
                  italic={false}
                >
                  See today&apos;s AI insights →
                </NavLinkWithOverlay>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // Past or upcoming: if this fixture was warmed, show either result+lineups (past) or full dashboard (upcoming)
  const warmedFixtures = await withPoolRetry(() => getFixturesForDateFromDbOnly(dateKey));
  const warmedFixture = findTodayFixture(warmedFixtures, leagueSlug, matchSlugParam);
  const isPast = dateKey < todayDateKey();

  if (warmedFixture && isPast) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=past fixtureId=" + warmedFixture.id + " (result + lineups, server-side getFixtureStats dbOnly)");
    // Past fixture: final result + lineups. Check DB first; if no score cached, fetch from API once and store.
    const [fixtureWithScore, stats] = await withPoolRetry(() =>
      Promise.all([
        prisma.fixture.findUnique({
          where: { id: warmedFixture.id },
          include: { liveScoreCache: true },
        }),
        getFixtureStats(warmedFixture.id, { dbOnly: true, sequential: true }),
      ])
    );
    let score: PastFixtureScore | null =
      fixtureWithScore?.liveScoreCache != null
        ? {
            homeGoals: fixtureWithScore.liveScoreCache.homeGoals,
            awayGoals: fixtureWithScore.liveScoreCache.awayGoals,
            statusShort: fixtureWithScore.liveScoreCache.statusShort,
          }
        : null;
    if (score == null && fixtureWithScore?.apiId) {
      try {
        const result = await fetchLiveFixture(fixtureWithScore.apiId);
        if (result && isMatchEnded(result.statusShort)) {
          const now = new Date();
          await prisma.liveScoreCache.upsert({
            where: { fixtureId: warmedFixture.id },
            create: {
              fixtureId: warmedFixture.id,
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              elapsedMinutes: result.elapsedMinutes,
              statusShort: result.statusShort,
              cachedAt: now,
            },
            update: {
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              elapsedMinutes: result.elapsedMinutes,
              statusShort: result.statusShort,
              cachedAt: now,
            },
          });
          score = {
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
            statusShort: result.statusShort,
          };
        }
      } catch {
        // Keep score null; UI will show – for result
      }
    }
    const home = warmedFixture.homeTeam.shortName ?? warmedFixture.homeTeam.name;
    const away = warmedFixture.awayTeam.shortName ?? warmedFixture.awayTeam.name;
    const league = warmedFixture.league ?? "Football";
    const displayDate = formatDisplayDate(dateKey);
    const breadcrumbItems = [
      { href: "/", label: "Home" },
      { href: "/fixtures/past", label: "Past fixtures" },
      { href: `/fixtures/${dateKey}`, label: displayDate },
      { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${home} vs ${away}` },
    ];
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {league} · {displayDate}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                {home}
                <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                {away}
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Final result and lineups for this match.
              </p>
            </header>
            <PastFixtureView fixture={warmedFixture} score={score} stats={stats} />
          </div>
        </main>
      </div>
    );
  }

  if (warmedFixture) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=upcoming fixtureId=" + warmedFixture.id + " (full dashboard, client will fetch /api/fixtures/" + warmedFixture.id + "/stats)");
    // Upcoming date: full stats from DB (e.g. warm-tomorrow)
    const fixtures = warmedFixtures;
    const fixture = warmedFixture;
    const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
    const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
    const league = fixture.league ?? "Football";
    const kickoff = typeof fixture.date === "string" ? fixture.date : fixture.date?.toISOString?.() ?? new Date(dateKey + "T12:00:00.000Z").toISOString();
    const endDate = new Date(new Date(kickoff).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const description = `${home} vs ${away} ${league} match with live stats, confirmed lineups and AI-powered bet builder insights on statsBuildr.`;
    const displayDate = formatDisplayDate(dateKey);
    const sportsEventJsonLd = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${home} vs ${away}`,
      startDate: kickoff,
      endDate,
      description,
      image: [`${BASE_URL}/stats-buildr.png`],
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: `${league} fixture`,
        address: { "@type": "PostalAddress", addressCountry: "GB" },
      },
      organizer: { "@type": "Organization", name: "statsBuildr", url: BASE_URL },
      offers: {
        "@type": "Offer",
        url: `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`,
        price: "0",
        priceCurrency: "GBP",
        availability: "https://schema.org/InStock",
      },
      competitor: [
        { "@type": "SportsTeam", name: home },
        { "@type": "SportsTeam", name: away },
      ],
      sport: "Football",
    };
    const breadcrumbItems = [
      { href: "/", label: "Home" },
      { href: `/fixtures/${dateKey}`, label: formatDisplayDate(dateKey) },
      { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${home} vs ${away}` },
    ];
    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: `${BASE_URL}${item.href === "/" ? "" : item.href}`,
      })),
    };
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {league ?? "Football"} · {displayDate}
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    {home}
                    <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                    {away}
                  </h1>
                </div>
                <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                  Match stats &amp; lineups
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                On {displayDate}, {home} face {away} in the {league}. This page shows match stats,
                confirmed lineups, xG, corners, cards and player performance numbers to help you build smarter bet builder selections.
              </p>
              {Object.values(STANDINGS_LEAGUE_SLUG_BY_ID).includes(leagueSlug) && (
                <nav
                  className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
                  aria-label="League table"
                >
                  <NavLinkWithOverlay
                    href={`/leagues/${leagueSlug}/standings`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league table…"
                  >
                    View {league} league table →
                  </NavLinkWithOverlay>
                </nav>
              )}
            </header>
            <TodayFixturesDashboard
              fixtures={fixtures}
              initialSelectedId={String(fixture.id)}
              hideFixtureSelector
            />
            <section className="mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800">
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-6 dark:border-violet-800/50 dark:bg-violet-950/20">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  New AI insights
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  We scan today&apos;s fixtures & stats then we surface the trends
                  that matter
                </p>
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/ai-insights`}
                  className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
                  message="Loading insights…"
                  italic={false}
                >
                  See AI insights for this date →
                </NavLinkWithOverlay>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // No warmed data: generic preview (UpcomingFixture or API)
  if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=preview (no warmed fixture for date, will try getFixturePreview)");
  const fixture = await getFixturePreview(dateKey, leagueSlug, matchSlugParam);

  if (!fixture) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <div>
            <p className="text-center text-neutral-600 dark:text-neutral-400">
              No fixtures scheduled for this date.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const kickoffPreview = typeof fixture.date === "string" ? fixture.date : new Date(dateKey + "T12:00:00.000Z").toISOString();
  const description = `${home} vs ${away} ${league} match preview with upcoming stats, lineups info and AI-powered bet builder insights on statsBuildr.`;
  const endDatePreview = new Date(new Date(kickoffPreview).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const sportsEventJsonLdPreview = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home} vs ${away}`,
    startDate: kickoffPreview,
    endDate: endDatePreview,
    description,
    image: [`${BASE_URL}/stats-buildr.png`],
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: `${league} fixture`,
      address: {
        "@type": "PostalAddress",
        addressCountry: "GB",
      },
    },
    organizer: {
      "@type": "Organization",
      name: "statsBuildr",
      url: BASE_URL,
    },
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`,
      price: "0",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
    },
    competitor: [
      { "@type": "SportsTeam", name: home },
      { "@type": "SportsTeam", name: away },
    ],
    sport: "Football",
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLdPreview) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <FixturePreviewContent fixture={fixture} dateKey={dateKey} leagueSlug={leagueSlug} matchSlugParam={matchSlugParam} />
        </div>
      </main>
    </div>
  );
}

function TeamCrest({
  crestUrl,
  alt,
}: {
  crestUrl: string | null | undefined;
  alt: string;
}) {
  const sizeClass = "h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 object-contain";
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={56}
        height={56}
        className={sizeClass}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400`}
      aria-hidden
    >
      <svg className="h-6 w-6 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
      </svg>
    </span>
  );
}

function FixturePreviewContent({
  fixture,
  dateKey,
  leagueSlug,
  matchSlugParam,
}: {
  fixture: RawFixture;
  dateKey: string;
  leagueSlug: string;
  matchSlugParam: string;
}) {
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const kickoff = formatKickoff(fixture.date);
  const displayDate = formatDisplayDate(dateKey);

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: `/fixtures/${dateKey}`, label: displayDate },
    { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${home} vs ${away}` },
  ];

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} className="mb-3" />

      <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {league} · {displayDate}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
              {home}
              <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
              {away}
            </h1>
          </div>
          <span className="inline-flex items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
            Match preview
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          On {displayDate}, {home} face {away} in the {league}. This page will show match stats,
          confirmed lineups, xG, corners, cards and player performance once the fixture is loaded – check back closer to kick-off{kickoff ? ` (${kickoff})` : ""}.
        </p>
        {(() => {
          const standingsSlug =
            fixture.leagueId != null && STANDINGS_LEAGUE_SLUG_BY_ID[fixture.leagueId]
              ? STANDINGS_LEAGUE_SLUG_BY_ID[fixture.leagueId]
              : Object.values(STANDINGS_LEAGUE_SLUG_BY_ID).includes(leagueSlug)
                ? leagueSlug
                : null;
          return standingsSlug ? (
            <nav
              className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
              aria-label="League table"
            >
              <NavLinkWithOverlay
                href={`/leagues/${standingsSlug}/standings`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                message="Loading league table…"
              >
                View {league} league table →
              </NavLinkWithOverlay>
            </nav>
          ) : null;
        })()}
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <div className="flex flex-col items-center gap-2">
            <TeamCrest crestUrl={fixture.homeTeam.crestUrl} alt={home} />
            <span className="text-center text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              {home}
            </span>
          </div>
          <span className="self-center text-sm font-medium text-neutral-400 dark:text-neutral-500">
            vs
          </span>
          <div className="flex flex-col items-center gap-2">
            <TeamCrest crestUrl={fixture.awayTeam.crestUrl} alt={away} />
            <span className="text-center text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              {away}
            </span>
          </div>
        </div>
        {kickoff && (
          <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Kick-off {kickoff}
          </p>
        )}
      </div>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Match Preview
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>
            {home} take on {away} in the {league} on {displayDate}. This match
            preview includes upcoming team statistics, player performance data
            and AI-powered betting insights ahead of kick-off.
          </p>
          <p>
            Historical trends such as goals scored and conceded, average
            corners, cards per match and shots per 90 will be analysed as the
            fixture approaches. Confirmed starting lineups, live score updates
            and in-play match statistics will also be available once the game
            begins.
          </p>
          <p>
            Explore data-driven insights for {home} vs {away} and uncover key
            performance trends before placing any bet builder selections.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          What To Expect
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <li>Player season statistics</li>
          <li>Team season / last 5 matches statistics</li>
          <li>AI-powered match insights (available before kick-off)</li>
        </ul>
      </section>
    </>
  );
}
