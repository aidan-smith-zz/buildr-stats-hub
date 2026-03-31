import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getFixturePreviewRequestCached,
  getFixturesForDateRequestCached,
  getOrRefreshTodayFixturesRequestCached,
} from "@/lib/fixturesService";
import {
  ensureLineupIfWithinWindow,
  getLineupForFixture,
  getPastFixtureLineupOnly,
  isWithinLineupFetchWindow,
  isWithinLineupShortCacheWindow,
} from "@/lib/lineupService";
import { withPoolRetry } from "@/lib/poolRetry";
import { API_SEASON, fetchLiveFixture } from "@/lib/footballApi";
import { prisma } from "@/lib/prisma";
import { loadMatchStatsPairFromDb, resolveMatchStatsForFixture } from "@/lib/matchStats";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import { makeTeamSlug } from "@/lib/teamSlugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import type { RawFixture } from "@/lib/footballApi";
import {
  getFixtureStats,
  getFixtureStatsCached,
  getFixtureStatsCachedShort,
  mergeLineupIntoStats,
  type FixtureStatsResponse,
} from "@/lib/statsService";
import type { FixtureSummary } from "@/lib/statsService";
import { isFixtureInRequiredLeagues, REQUIRED_LEAGUE_IDS, getStandingsSlug, STANDINGS_LEAGUE_SLUG_BY_ID, isTeamStatsOnlyLeague } from "@/lib/leagues";
import { MatchPageStatsSection } from "@/app/_components/match-page-stats-section";
import { ShareUrlButton } from "@/app/_components/share-url-button";
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
  const filtered = fixtures.filter((f) =>
    isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
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
/** Allow more time for DB/API under load (avoids FUNCTION_INVOCATION_TIMEOUT). */
export const maxDuration = 60;

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

function isPastDateOlderThanDays(dateKey: string, days: number): boolean {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const ageMs = now.getTime() - d.getTime();
  return ageMs > days * 24 * 60 * 60 * 1000;
}

/** API-Football statusShort values that mean the match is finished. */
const FINISHED_STATUS = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function isMatchEnded(statusShort: string): boolean {
  return FINISHED_STATUS.has(statusShort);
}

async function loadInitialFixtureStatsMatchingApiSemantics(
  fixtureId: number,
): Promise<FixtureStatsResponse | null> {
  const now = new Date();
  const fixtureMeta = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { date: true, leagueId: true, _count: { select: { lineups: true } } },
  });
  const kickoffForCache = fixtureMeta?.date ? new Date(fixtureMeta.date) : null;
  const useShortCache =
    kickoffForCache != null &&
    !Number.isNaN(kickoffForCache.getTime()) &&
    isWithinLineupShortCacheWindow(kickoffForCache, now);
  const inLineupWindowEarly =
    kickoffForCache != null &&
    !Number.isNaN(kickoffForCache.getTime()) &&
    isWithinLineupFetchWindow(kickoffForCache, now);
  const hasLineupInDb = (fixtureMeta?._count?.lineups ?? 0) > 0;
  const shouldHaveLineupsForFixture = !isTeamStatsOnlyLeague(fixtureMeta?.leagueId ?? null);
  const bypassCacheForLineup = inLineupWindowEarly && !hasLineupInDb;

  let stats = await withPoolRetry(() =>
    bypassCacheForLineup
      ? getFixtureStats(fixtureId, { sequential: true })
      : useShortCache
        ? getFixtureStatsCachedShort(fixtureId)
        : getFixtureStatsCached(fixtureId),
  );
  if (!stats) return null;

  let lineupByTeam = await getLineupForFixture(fixtureId);
  if (inLineupWindowEarly && shouldHaveLineupsForFixture && !stats.hasLineup && lineupByTeam.size === 0) {
    const fixture = await prisma.fixture.findUnique({
      where: { id: fixtureId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (fixture?.apiId) {
      await ensureLineupIfWithinWindow(
        fixture.id,
        fixture.date,
        fixture.apiId,
        fixture.homeTeamId,
        fixture.awayTeamId,
        fixture.homeTeam.apiId,
        fixture.awayTeam.apiId,
      );
      lineupByTeam = await getLineupForFixture(fixtureId);
    }
  }
  if (lineupByTeam.size > 0 && !stats.hasLineup) {
    stats = await mergeLineupIntoStats(stats, lineupByTeam);
  }

  return stats;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}): Promise<Metadata> {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } =
    await params;

  if (dateKey === todayDateKey()) {
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixturesRequestCached(todayDateKey()));
    const fixture = findTodayFixture(fixtures, leagueSlug, matchSlugParam);
    if (!fixture) {
      return { title: "Fixture not found", robots: { index: false, follow: true } };
    }
    const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
    const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
    const league = fixture.league ?? "Football";
    const year = getYear(dateKey);
    const title = buildIntentTitle({
      intent: "Match preview",
      subject: `${home} vs ${away}`,
      timeframe: `${league} ${year}`,
      keyStat: "form, stats, lineups & AI insights",
    });
    const description = toSnippetDescription([
      `${home} vs ${away} (${league}): team form, match stats and lineups — xG, corners, cards and shots per 90.`,
      "AI-powered bet builder angles and quick comparisons.",
    ]);
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
        images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} — match preview on statsBuildr` }],
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
  const warmedFixtures = await withPoolRetry(() => getFixturesForDateRequestCached(dateKey));
  const warmedFixture = findTodayFixture(warmedFixtures, leagueSlug, matchSlugParam);
  if (warmedFixture) {
    const home = warmedFixture.homeTeam.shortName ?? warmedFixture.homeTeam.name;
    const away = warmedFixture.awayTeam.shortName ?? warmedFixture.awayTeam.name;
    const league = warmedFixture.league ?? "Football";
    const year = getYear(dateKey);
    const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
    const isPast = dateKey < todayDateKey();
    const title = isPast
      ? buildIntentTitle({
          intent: "Match result",
          subject: `${home} vs ${away}`,
          timeframe: `${league} ${year}`,
          keyStat: "final score & lineups",
        })
      : buildIntentTitle({
          intent: "Match preview",
          subject: `${home} vs ${away}`,
          timeframe: `${league} ${year}`,
          keyStat: "form, stats, lineups & AI insights",
        });
    const description = isPast
      ? toSnippetDescription([
          `Final result: ${home} vs ${away} (${league}). Lineups and key match stats.`,
          "Goals, xG, corners, cards and shots context for the full-time score.",
        ])
      : toSnippetDescription([
          `${home} vs ${away} (${league}): team form, match stats and lineups — xG, corners, cards and shots per 90.`,
          "AI-powered bet builder angles and quick comparisons.",
        ]);
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
        images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} — match preview on statsBuildr` }],
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

  const fixture = await getFixturePreviewRequestCached(dateKey, leagueSlug, matchSlugParam);
  if (!fixture) {
    return {
      title: "Fixture not found",
      description: "No fixtures scheduled for this date.",
      robots: { index: false, follow: true },
    };
  }

  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const year = getYear(dateKey);
  const title = buildIntentTitle({
    intent: "Match preview",
    subject: `${home} vs ${away}`,
    timeframe: `${league} ${year}`,
    keyStat: "form, stats, lineups & AI insights",
  });
  const description = toSnippetDescription([
    `${home} vs ${away} (${league}): team form, match stats and lineups — xG, corners, cards and shots per 90.`,
    "AI-powered bet builder angles and quick comparisons.",
  ]);
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
      images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `${home} vs ${away} — match preview on statsBuildr` }],
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
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixturesRequestCached(todayDateKey()));
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
    const showLineupsCopy = !isTeamStatsOnlyLeague(fixture.leagueId ?? null);
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

    const faqEntitiesToday = [
      {
        "@type": "Question",
        name: `What time does ${home} vs ${away} kick off?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The ${home} vs ${away} ${league} match kicks off at ${formatKickoff(kickoff)} on ${displayDate} (Europe/London time).`,
        },
      },
      {
        "@type": "Question",
        name: `What stats can I see for ${home} vs ${away}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This page shows team and player stats for ${home} vs ${away}, including xG, goals, shots, corners, cards and per-90 numbers, plus recent form over the last few matches.`,
        },
      },
      {
        "@type": "Question",
        name: "How should I use these stats for my bet builder?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Use the per-90 player stats, last 5 form and team averages for goals, xG, corners and cards to spot realistic lines for shots, bookings and set-piece markets, instead of guessing from headline form alone.",
        },
      },
    ];

    const faqJsonLdToday = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntitiesToday,
    };

    // Home vs away season profile (today's fixture only).
    // Uses TeamSeasonStats home/away splits so we can show how teams behave in this specific spot.
    const seasonRows = (await prisma.teamSeasonStats.findMany({
      where: {
        teamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] },
        season: API_SEASON,
      },
    })) as any[];

    const pickSeasonRowForTeam = (teamId: number) => {
      const rows = seasonRows.filter((r) => r.teamId === teamId);
      if (rows.length === 0) return null;
      return rows.reduce((best, row) =>
        !best || (row.minutesPlayed ?? 0) > (best.minutesPlayed ?? 0) ? row : best,
      ) as any;
    };

    const homeSeason = pickSeasonRowForTeam(fixture.homeTeam.id);
    const awaySeason = pickSeasonRowForTeam(fixture.awayTeam.id);

    const homeHomeGames = homeSeason?.homeGames ?? 0;
    const awayAwayGames = awaySeason?.awayGames ?? 0;

    const homeHomeGoalsPerMatch =
      homeHomeGames > 0 ? homeSeason!.homeGoalsFor / homeHomeGames : null;
    const homeHomeCornersPerMatch =
      homeHomeGames > 0 ? homeSeason!.homeCorners / homeHomeGames : null;
    const homeHomeCardsPerMatch =
      homeHomeGames > 0
        ? (homeSeason!.homeYellowCards + homeSeason!.homeRedCards) / homeHomeGames
        : null;

    const awayAwayGoalsPerMatch =
      awayAwayGames > 0 ? awaySeason!.awayGoalsFor / awayAwayGames : null;
    const awayAwayCornersPerMatch =
      awayAwayGames > 0 ? awaySeason!.awayCorners / awayAwayGames : null;
    const awayAwayCardsPerMatch =
      awayAwayGames > 0
        ? (awaySeason!.awayYellowCards + awaySeason!.awayRedCards) / awayAwayGames
        : null;

    const showHomeAwayProfile =
      homeSeason &&
      awaySeason &&
      homeHomeGames >= 3 &&
      awayAwayGames >= 3 &&
      (homeHomeGoalsPerMatch !== null ||
        homeHomeCornersPerMatch !== null ||
        homeHomeCardsPerMatch !== null ||
        awayAwayGoalsPerMatch !== null ||
        awayAwayCornersPerMatch !== null ||
        awayAwayCardsPerMatch !== null);

    const homeCrest =
      (fixture.homeTeam as { crestUrl?: string | null }).crestUrl ?? null;
    const awayCrest =
      (fixture.awayTeam as { crestUrl?: string | null }).crestUrl ?? null;

    const standingsSlug = getStandingsSlug(fixture.leagueId ?? null, leagueSlug);
    const initialFixtureStats = await loadInitialFixtureStatsMatchingApiSemantics(
      fixture.id,
    );

    const todayLiveRow = await withPoolRetry(() =>
      prisma.fixture.findUnique({
        where: { id: fixture.id },
        select: { liveScoreCache: { select: { statusShort: true } } },
      }),
    );
    const todayLiveStatusShort = todayLiveRow?.liveScoreCache?.statusShort ?? null;
    const showEndedTodayMatchStatsTab =
      !!todayLiveStatusShort && isMatchEnded(todayLiveStatusShort);
    const todayEndedMatchStatsFromDb = showEndedTodayMatchStatsTab
      ? await loadMatchStatsPairFromDb(
          fixture.id,
          fixture.homeTeam.id,
          fixture.awayTeam.id,
        )
      : null;

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdToday) }}
        />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {standingsSlug ? (
                      <>
                        <NavLinkWithOverlay
                          href={`/leagues/${standingsSlug}/standings`}
                          className="hover:underline focus:underline"
                          message="Loading league table…"
                        >
                          {league ?? "Football"}
                        </NavLinkWithOverlay>
                        {" · "}{displayDate}
                      </>
                    ) : (
                      <>{league ?? "Football"} · {displayDate}</>
                    )}
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    <NavLinkWithOverlay
                      href={`/teams/${makeTeamSlug(home ?? fixture.homeTeam.name)}`}
                      className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                      message="Loading team stats…"
                    >
                      {home}
                    </NavLinkWithOverlay>
                    <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                    <NavLinkWithOverlay
                      href={`/teams/${makeTeamSlug(away ?? fixture.awayTeam.name)}`}
                      className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                      message="Loading team stats…"
                    >
                      {away}
                    </NavLinkWithOverlay>
                  </h1>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Tap or click a team name to see their season stats and form.
                  </p>
                </div>
            <span className="hidden items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900 sm:inline-flex">
              {showLineupsCopy ? "Match stats & lineups" : "Match stats"}
            </span>
              </div>
          <p className="mt-2 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                On {displayDate}, {home} face {away} in the {league}. This page shows match stats,
                {showLineupsCopy && " confirmed lineups,"} xG, corners, cards and player performance numbers to help you build smarter bet builder selections.
              </p>
          <ul className="mt-2 space-y-0.5 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                <li>
                  • Compare full-time xG, goals, corners and cards for both teams in one place.
                </li>
                <li>
                  • Use per 90 player stats and last 5 form to spot trends for your bet builder ideas.
                </li>
            {showLineupsCopy && (
              <li className="hidden sm:list-item">
                • Check live lineups to confirm who is starting before you place a bet.
              </li>
            )}
              </ul>
              {standingsSlug && (
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
              )}
            </header>
            <MatchPageStatsSection
              fixtures={fixtures}
              initialSelectedId={String(fixture.id)}
              last5={{
                homeName: home ?? fixture.homeTeam.name,
                awayName: away ?? fixture.awayTeam.name,
                homeCrest,
                awayCrest,
              }}
              showEndedTodayMatchStatsTab={showEndedTodayMatchStatsTab}
              endedTodayMatchStatsFromDb={todayEndedMatchStatsFromDb}
              matchLivePageHref={`/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}/live`}
              initialFixtureStats={initialFixtureStats}
            />
            {showHomeAwayProfile && (
              <section className="mt-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 text-xs dark:border-neutral-700 dark:bg-neutral-900/70 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300 sm:text-xs">
                      Home vs away profile
                    </h2>
                    <p className="text-[0.7rem] text-neutral-600 dark:text-neutral-400 sm:text-xs">
                      Season averages for this competition only. {home} shows{" "}
                      <span className="font-medium">home</span> matches; {away} shows{" "}
                      <span className="font-medium">away</span> matches.
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5 sm:mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {homeCrest && (
                          <img
                            src={homeCrest}
                            alt=""
                            width={20}
                            height={20}
                            className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                            aria-hidden
                          />
                        )}
                        <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                          {home} at home
                        </p>
                      </div>
                      <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                        {homeHomeGames} home match{homeHomeGames === 1 ? "" : "es"} this season
                      </p>
                    </div>
                    <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Goals
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeGoalsPerMatch != null
                            ? homeHomeGoalsPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Corners
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeCornersPerMatch != null
                            ? homeHomeCornersPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Cards
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeCardsPerMatch != null
                            ? homeHomeCardsPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-dotted border-neutral-200 pt-2.5 dark:border-neutral-700">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {awayCrest && (
                          <img
                            src={awayCrest}
                            alt=""
                            width={20}
                            height={20}
                            className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                            aria-hidden
                          />
                        )}
                        <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                          {away} away from home
                        </p>
                      </div>
                      <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                        {awayAwayGames} away match{awayAwayGames === 1 ? "" : "es"} this season
                      </p>
                    </div>
                    <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Goals
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayGoalsPerMatch != null
                            ? awayAwayGoalsPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Corners
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayCornersPerMatch != null
                            ? awayAwayCornersPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Cards
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayCardsPerMatch != null
                            ? awayAwayCardsPerMatch.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </section>
            )}
              <TeamAndLeagueStatsSection
                home={home ?? fixture.homeTeam.name}
                away={away ?? fixture.awayTeam.name}
                league={league}
                leagueSlug={leagueSlug}
                leagueId={fixture.leagueId ?? null}
              />
              <div className="mt-8 flex justify-center">
                <ShareUrlButton />
              </div>
              <section className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <NavLinkWithOverlay
                  href={`/fixtures/${dateKey}/ai-insights`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300 sm:text-sm"
                  message="Loading insights…"
                  italic={false}
                >
                  AI insights for today&apos;s fixtures
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </NavLinkWithOverlay>
              </section>
              <section className="mt-10 border-t border-neutral-200 pt-8 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                Frequently asked questions about this match
              </h2>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="font-medium">
                    What time does {home} vs {away} kick off?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    The match kicks off at {formatKickoff(kickoff)} on {displayDate} in the {league}.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    What stats can I see for this fixture?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    You can compare team and player stats for both sides, including xG, goals, shots, corners, cards and recent form to understand how the match might play out.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    How can these stats help with a bet builder?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    The per-90 numbers, last 5 form and team averages make it easier to pick realistic lines for shots,
                    goals and cards, and to spot games that suit corners or bookings-based bet builders.
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // Past or upcoming: if this fixture was warmed, show either result+lineups (past) or full dashboard (upcoming)
  const warmedFixtures = await withPoolRetry(() => getFixturesForDateRequestCached(dateKey));
  const warmedFixture = findTodayFixture(warmedFixtures, leagueSlug, matchSlugParam);
  const isPast = dateKey < todayDateKey();

  if (warmedFixture && isPast) {
    if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=past fixtureId=" + warmedFixture.id + " (result + lineups, lightweight server path)");
    // Past fixture: final result + lineups. Lightweight path: findUnique + lineup-only query (no full getFixtureStats).
    // Sequential to avoid holding 2 connections (reduces pool pressure)
    const fixtureWithScore = await withPoolRetry(() =>
      prisma.fixture.findUnique({
        where: { id: warmedFixture.id },
        include: {
          liveScoreCache: true,
          homeTeam: { select: { apiId: true } },
          awayTeam: { select: { apiId: true } },
        },
      }),
    );
    const lineupOnly = await withPoolRetry(() =>
      getPastFixtureLineupOnly(
        warmedFixture.id,
        warmedFixture.homeTeam.id,
        warmedFixture.awayTeam.id,
        warmedFixture.homeTeam.name,
        warmedFixture.homeTeam.shortName ?? null,
        warmedFixture.awayTeam.name,
        warmedFixture.awayTeam.shortName ?? null,
      ),
    );
    const stats = { fixture: warmedFixture, hasLineup: lineupOnly.hasLineup, teams: lineupOnly.teams };
    let score: PastFixtureScore | null =
      fixtureWithScore?.liveScoreCache != null
        ? {
            homeGoals: fixtureWithScore.liveScoreCache.homeGoals,
            awayGoals: fixtureWithScore.liveScoreCache.awayGoals,
            statusShort: fixtureWithScore.liveScoreCache.statusShort,
            penaltyHome: fixtureWithScore.liveScoreCache.penaltyHome ?? null,
            penaltyAway: fixtureWithScore.liveScoreCache.penaltyAway ?? null,
          }
        : null;
    // Older past fixtures are stable: keep this path DB-only to reduce origin CPU under crawler load.
    const isOlderPastFixture = isPastDateOlderThanDays(dateKey, 2);
    // For recent past fixtures only: fetch final score from API when cache is missing or not finished.
    const apiId = fixtureWithScore?.apiId ?? null;
    const needsFinalScore =
      apiId != null && (!score || !isMatchEnded(score.statusShort));
    if (!isOlderPastFixture && needsFinalScore && apiId != null) {
      try {
        const result = await fetchLiveFixture(apiId);
        if (result && isMatchEnded(result.statusShort)) {
          const now = new Date();
          await prisma.liveScoreCache.upsert({
            where: { fixtureId: warmedFixture.id },
            create: {
              fixtureId: warmedFixture.id,
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              penaltyHome: result.penaltyHome,
              penaltyAway: result.penaltyAway,
              elapsedMinutes: result.elapsedMinutes,
              statusShort: result.statusShort,
              cachedAt: now,
            },
            update: {
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              penaltyHome: result.penaltyHome,
              penaltyAway: result.penaltyAway,
              elapsedMinutes: result.elapsedMinutes,
              statusShort: result.statusShort,
              cachedAt: now,
            },
          });
          score = {
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
            statusShort: result.statusShort,
            penaltyHome: result.penaltyHome,
            penaltyAway: result.penaltyAway,
          };
        }
      } catch {
        // Keep existing score or null; UI will show what we have
      }
    }

    let matchStats =
      (await loadMatchStatsPairFromDb(
        warmedFixture.id,
        warmedFixture.homeTeam.id,
        warmedFixture.awayTeam.id,
      )) ?? null;
    if (
      !matchStats &&
      !isOlderPastFixture &&
      apiId != null &&
      fixtureWithScore?.homeTeam?.apiId &&
      fixtureWithScore?.awayTeam?.apiId
    ) {
      matchStats =
        (await resolveMatchStatsForFixture(
          {
            id: warmedFixture.id,
            apiId,
            homeTeamId: warmedFixture.homeTeam.id,
            awayTeamId: warmedFixture.awayTeam.id,
            homeTeamApiId: fixtureWithScore.homeTeam.apiId,
            awayTeamApiId: fixtureWithScore.awayTeam.apiId,
          },
          { refreshFromApi: true },
        )) ?? null;
    }

    const home = warmedFixture.homeTeam.shortName ?? warmedFixture.homeTeam.name;
    const away = warmedFixture.awayTeam.shortName ?? warmedFixture.awayTeam.name;
    const league = warmedFixture.league ?? "Football";
    const displayDate = formatDisplayDate(dateKey);
    const hasLineups = stats.hasLineup;
    const pastDescription = hasLineups
      ? `Full-time result, match stats and confirmed lineups for ${home} vs ${away} in the ${league} on ${displayDate}.`
      : `Full-time result and key match stats for ${home} vs ${away} in the ${league} on ${displayDate}. Lineups are not available for this fixture.`;
    const breadcrumbItems = [
      { href: "/", label: "Home" },
      { href: "/fixtures/past", label: "Past fixtures" },
      { href: `/fixtures/${dateKey}`, label: displayDate },
      { href: `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`, label: `${home} vs ${away}` },
    ];
    const faqEntitiesPast = [
      {
        "@type": "Question",
        name: `What was the final score in ${home} vs ${away}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            score != null
              ? `The final score was ${home} ${score.homeGoals}–${score.awayGoals} ${away}.`
              : `The match between ${home} and ${away} has finished. The final score will appear here once it is confirmed.`,
        },
      },
      {
        "@type": "Question",
        name: `What stats can I see for the ${home} vs ${away} result?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `You can see season and recent form stats for both teams, including goals, xG, corners and cards, plus player-level numbers to understand how ${home} and ${away} have been performing around this fixture.`,
        },
      },
      {
        "@type": "Question",
        name: "Will the stats on this page change after the match?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The final score is fixed once confirmed, but season and form stats will keep evolving as both teams play more matches. The page uses the latest team and player data available in the database.",
        },
      },
    ];

    const faqJsonLdPast = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntitiesPast,
    };

    const standingsSlugPast = getStandingsSlug(warmedFixture.leagueId ?? null, leagueSlug);

    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {standingsSlugPast ? (
                  <>
                    <NavLinkWithOverlay
                      href={`/leagues/${standingsSlugPast}/standings`}
                      className="hover:underline focus:underline"
                      message="Loading league table…"
                    >
                      {league}
                    </NavLinkWithOverlay>
                    {" · "}{displayDate}
                  </>
                ) : (
                  <>{league} · {displayDate}</>
                )}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                <NavLinkWithOverlay
                  href={`/teams/${makeTeamSlug(home ?? warmedFixture.homeTeam.name)}`}
                  className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                  message="Loading team stats…"
                >
                  {home}
                </NavLinkWithOverlay>
                <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                <NavLinkWithOverlay
                  href={`/teams/${makeTeamSlug(away ?? warmedFixture.awayTeam.name)}`}
                  className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                  message="Loading team stats…"
                >
                  {away}
                </NavLinkWithOverlay>
              </h1>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                Tap or click a team name to see their season stats and form.
              </p>
              {standingsSlugPast && (
                <nav
                  className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
                  aria-label="League table"
                >
                  <NavLinkWithOverlay
                    href={`/leagues/${standingsSlugPast}/standings`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league table…"
                  >
                    View {league} league table →
                  </NavLinkWithOverlay>
                </nav>
              )}
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {pastDescription}
              </p>
            </header>
            <PastFixtureView fixture={warmedFixture} score={score} stats={stats} matchStats={matchStats} />
            <TeamAndLeagueStatsSection
              home={home}
              away={away}
              league={league}
              leagueSlug={leagueSlug}
              leagueId={warmedFixture.leagueId ?? null}
            />
            <div className="mt-8 flex justify-center">
              <ShareUrlButton />
            </div>
            <section className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <NavLinkWithOverlay
                href={`/fixtures/${dateKey}/ai-insights`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300 sm:text-sm"
                message="Loading insights…"
                italic={false}
              >
                AI insights for this date
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </NavLinkWithOverlay>
            </section>
            <section className="mt-10 border-t border-neutral-200 pt-8 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                Frequently asked questions about this result
              </h2>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="font-medium">
                    What was the final score in this match?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    {score != null
                      ? `The final score was ${home} ${score.homeGoals}–${score.awayGoals} ${away}.`
                      : `The match has finished; the final score will appear here once it has been confirmed.`}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    What stats can I see for this past fixture?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    You can review team and player stats around the match, including season totals and last 5 form for goals, xG, corners and cards.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    Do these stats update after the game?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    The final score is fixed, but season and form stats will continue to update as both teams play more matches, so you always see the latest context.
                  </dd>
                </div>
              </dl>
            </section>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdPast) }}
            />
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
    const faqEntitiesUpcoming = [
      {
        "@type": "Question" as const,
        name: `What time does ${home} vs ${away} kick off?`,
        acceptedAnswer: {
          "@type": "Answer" as const,
          text: `The ${home} vs ${away} ${league} match kicks off at ${formatKickoff(kickoff)} on ${displayDate} (Europe/London time).`,
        },
      },
      {
        "@type": "Question" as const,
        name: `What stats are available before kick-off for ${home} vs ${away}?`,
        acceptedAnswer: {
          "@type": "Answer" as const,
          text: `This page shows season and recent form for both teams: goals, xG, corners, cards and per-90 player stats. Use them to build bet builder selections ahead of kick-off.`,
        },
      },
      {
        "@type": "Question" as const,
        name: "Will this page update on match day?",
        acceptedAnswer: {
          "@type": "Answer" as const,
          text: "On match day you'll see the full dashboard with live stats, confirmed lineups and in-play data. Refresh the page closer to kick-off for the latest.",
        },
      },
    ];
    const faqJsonLdUpcoming = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntitiesUpcoming,
    };

    // Last 5 and Home vs away (same as today branch — data is in DB for warmed fixtures).
    const seasonRowsUpcoming = (await prisma.teamSeasonStats.findMany({
      where: {
        teamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] },
        season: API_SEASON,
      },
    })) as any[];
    const pickSeasonRowForTeamUpcoming = (teamId: number) => {
      const rows = seasonRowsUpcoming.filter((r: { teamId: number }) => r.teamId === teamId);
      if (rows.length === 0) return null;
      return rows.reduce(
        (best: any, row: any) =>
          !best || (row.minutesPlayed ?? 0) > (best.minutesPlayed ?? 0) ? row : best,
      ) as any;
    };
    const homeSeasonUpcoming = pickSeasonRowForTeamUpcoming(fixture.homeTeam.id);
    const awaySeasonUpcoming = pickSeasonRowForTeamUpcoming(fixture.awayTeam.id);
    const homeHomeGamesUpcoming = homeSeasonUpcoming?.homeGames ?? 0;
    const awayAwayGamesUpcoming = awaySeasonUpcoming?.awayGames ?? 0;
    const homeHomeGoalsPerMatchUpcoming =
      homeHomeGamesUpcoming > 0 ? homeSeasonUpcoming!.homeGoalsFor / homeHomeGamesUpcoming : null;
    const homeHomeCornersPerMatchUpcoming =
      homeHomeGamesUpcoming > 0 ? homeSeasonUpcoming!.homeCorners / homeHomeGamesUpcoming : null;
    const homeHomeCardsPerMatchUpcoming =
      homeHomeGamesUpcoming > 0
        ? (homeSeasonUpcoming!.homeYellowCards + homeSeasonUpcoming!.homeRedCards) / homeHomeGamesUpcoming
        : null;
    const awayAwayGoalsPerMatchUpcoming =
      awayAwayGamesUpcoming > 0 ? awaySeasonUpcoming!.awayGoalsFor / awayAwayGamesUpcoming : null;
    const awayAwayCornersPerMatchUpcoming =
      awayAwayGamesUpcoming > 0 ? awaySeasonUpcoming!.awayCorners / awayAwayGamesUpcoming : null;
    const awayAwayCardsPerMatchUpcoming =
      awayAwayGamesUpcoming > 0
        ? (awaySeasonUpcoming!.awayYellowCards + awaySeasonUpcoming!.awayRedCards) / awayAwayGamesUpcoming
        : null;
    const showHomeAwayProfileUpcoming =
      homeSeasonUpcoming &&
      awaySeasonUpcoming &&
      homeHomeGamesUpcoming >= 3 &&
      awayAwayGamesUpcoming >= 3 &&
      (homeHomeGoalsPerMatchUpcoming !== null ||
        homeHomeCornersPerMatchUpcoming !== null ||
        homeHomeCardsPerMatchUpcoming !== null ||
        awayAwayGoalsPerMatchUpcoming !== null ||
        awayAwayCornersPerMatchUpcoming !== null ||
        awayAwayCardsPerMatchUpcoming !== null);
    const homeCrestUpcoming =
      (fixture.homeTeam as { crestUrl?: string | null }).crestUrl ?? null;
    const awayCrestUpcoming =
      (fixture.awayTeam as { crestUrl?: string | null }).crestUrl ?? null;

    const standingsSlugUpcoming = getStandingsSlug(fixture.leagueId ?? null, leagueSlug);
      const initialFixtureStatsUpcoming =
        await loadInitialFixtureStatsMatchingApiSemantics(fixture.id);

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdUpcoming) }}
        />
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div>
            <Breadcrumbs items={breadcrumbItems} className="mb-3" />
            <header className="mb-5 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {standingsSlugUpcoming ? (
                      <>
                        <NavLinkWithOverlay
                          href={`/leagues/${standingsSlugUpcoming}/standings`}
                          className="hover:underline focus:underline"
                          message="Loading league table…"
                        >
                          {league ?? "Football"}
                        </NavLinkWithOverlay>
                        {" · "}{displayDate}
                      </>
                    ) : (
                      <>{league ?? "Football"} · {displayDate}</>
                    )}
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    <NavLinkWithOverlay
                      href={`/teams/${makeTeamSlug(home ?? fixture.homeTeam.name)}`}
                      className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                      message="Loading team stats…"
                    >
                      {home}
                    </NavLinkWithOverlay>
                    <span className="mx-2 text-neutral-400 dark:text-neutral-500">vs</span>
                    <NavLinkWithOverlay
                      href={`/teams/${makeTeamSlug(away ?? fixture.awayTeam.name)}`}
                      className="text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                      message="Loading team stats…"
                    >
                      {away}
                    </NavLinkWithOverlay>
                  </h1>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Tap or click a team name to see their season stats and form.
                  </p>
                </div>
                <span className="hidden items-center rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900 sm:inline-flex">
                  {isTeamStatsOnlyLeague(fixture.leagueId ?? null) ? "Match stats" : "Match stats & lineups"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                On {displayDate}, {home} face {away} in the {league}. This page shows match stats,
                {!isTeamStatsOnlyLeague(fixture.leagueId ?? null) && " confirmed lineups,"} xG, corners, cards and player performance numbers to help you build smarter bet builder selections.
              </p>
              <ul className="mt-2 space-y-0.5 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                <li>
                  • See season and recent form for goals, xG, corners and cards for both teams.
                </li>
                <li>
                  • Use per 90 player stats to highlight key attacking and card-prone players.
                </li>
                <li className="hidden sm:list-item">
                  • Build more informed bet builders with data on shots, cards and set-piece threat.
                </li>
              </ul>
              {standingsSlugUpcoming && (
                <nav
                  className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
                  aria-label="League table"
                >
                  <NavLinkWithOverlay
                    href={`/leagues/${standingsSlugUpcoming}/standings`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                    message="Loading league table…"
                  >
                    View {league} league table →
                  </NavLinkWithOverlay>
                </nav>
              )}
            </header>
            <MatchPageStatsSection
              fixtures={fixtures}
              initialSelectedId={String(fixture.id)}
              last5={{
                homeName: home ?? fixture.homeTeam.name,
                awayName: away ?? fixture.awayTeam.name,
                homeCrest: homeCrestUpcoming,
                awayCrest: awayCrestUpcoming,
              }}
              initialFixtureStats={initialFixtureStatsUpcoming}
            />
            {showHomeAwayProfileUpcoming && (
              <section className="mt-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 text-xs dark:border-neutral-700 dark:bg-neutral-900/70 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300 sm:text-xs">
                      Home vs away profile
                    </h2>
                    <p className="text-[0.7rem] text-neutral-600 dark:text-neutral-400 sm:text-xs">
                      Season averages for this competition only. {home} shows{" "}
                      <span className="font-medium">home</span> matches; {away} shows{" "}
                      <span className="font-medium">away</span> matches.
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5 sm:mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {homeCrestUpcoming && (
                          <img
                            src={homeCrestUpcoming}
                            alt=""
                            width={20}
                            height={20}
                            className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                            aria-hidden
                          />
                        )}
                        <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                          {home} at home
                        </p>
                      </div>
                      <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                        {homeHomeGamesUpcoming} home match{homeHomeGamesUpcoming === 1 ? "" : "es"} this season
                      </p>
                    </div>
                    <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Goals
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeGoalsPerMatchUpcoming != null
                            ? homeHomeGoalsPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Corners
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeCornersPerMatchUpcoming != null
                            ? homeHomeCornersPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Cards
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {homeHomeCardsPerMatchUpcoming != null
                            ? homeHomeCardsPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-dotted border-neutral-200 pt-2.5 dark:border-neutral-700">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {awayCrestUpcoming && (
                          <img
                            src={awayCrestUpcoming}
                            alt=""
                            width={20}
                            height={20}
                            className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                            aria-hidden
                          />
                        )}
                        <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                          {away} away from home
                        </p>
                      </div>
                      <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                        {awayAwayGamesUpcoming} away match{awayAwayGamesUpcoming === 1 ? "" : "es"} this season
                      </p>
                    </div>
                    <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Goals
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayGoalsPerMatchUpcoming != null
                            ? awayAwayGoalsPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Corners
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayCornersPerMatchUpcoming != null
                            ? awayAwayCornersPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          Cards
                        </dt>
                        <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                          {awayAwayCardsPerMatchUpcoming != null
                            ? awayAwayCardsPerMatchUpcoming.toFixed(2)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </section>
            )}
            <TeamAndLeagueStatsSection
              home={home}
              away={away}
              league={league}
              leagueSlug={leagueSlug}
              leagueId={fixture.leagueId ?? null}
            />
            <div className="mt-8 flex justify-center">
              <ShareUrlButton />
            </div>
            <section className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <NavLinkWithOverlay
                href={`/fixtures/${dateKey}/ai-insights`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300 sm:text-sm"
                message="Loading insights…"
                italic={false}
              >
                AI insights for this date
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </NavLinkWithOverlay>
            </section>

            <section className="mt-10 border-t border-neutral-200 pt-8 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                Frequently asked questions about this fixture
              </h2>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="font-medium">
                    What time does {home} vs {away} kick off?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    The {home} vs {away} {league} match kicks off at {formatKickoff(kickoff)} on {displayDate} (Europe/London time).
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    What stats are available before kick-off?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    This page shows season and recent form for both teams: goals, xG, corners, cards and per-90 player stats. Use them to build bet builder selections ahead of kick-off.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">
                    Will this page update on match day?
                  </dt>
                  <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                    On match day you&apos;ll see the full dashboard with live stats, confirmed lineups and in-play data. Refresh the page closer to kick-off for the latest.
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // No warmed data: generic preview (UpcomingFixture or API)
  if (DEBUG_FIXTURE) console.log("[fixture-debug] branch=preview (no warmed fixture for date, will try getFixturePreview)");
  const fixture = await getFixturePreviewRequestCached(dateKey, leagueSlug, matchSlugParam);

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

  const displayDatePreview = formatDisplayDate(dateKey);
  const faqEntitiesPreview = [
    {
      "@type": "Question" as const,
      name: `When does ${home} vs ${away} kick off?`,
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: kickoffPreview
          ? `The ${home} vs ${away} ${league} match is scheduled for ${displayDatePreview} (${formatKickoff(kickoffPreview)}, Europe/London). Check back closer to kick-off for full stats and lineups.`
          : `The ${home} vs ${away} ${league} match is scheduled for ${displayDatePreview}. This page will show full stats and lineups once the fixture is loaded – check back closer to kick-off.`,
      },
    },
    {
      "@type": "Question" as const,
      name: "What will I see on this page on match day?",
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: "On match day this page will show the full dashboard: team and player per-90 stats, last 5 form, confirmed lineups when available, and live match stats. Use today's fixtures to open the full view.",
      },
    },
    {
      "@type": "Question" as const,
      name: "How can I use stats for bet builders?",
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: "Once the fixture is warmed, you'll see goals, xG, corners, cards and shots per 90 for both teams and key players. Use these with the form table and AI insights for smarter bet builder selections.",
      },
    },
  ];
  const faqJsonLdPreview = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntitiesPreview,
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventJsonLdPreview) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdPreview) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <FixturePreviewContent fixture={fixture} dateKey={dateKey} leagueSlug={leagueSlug} matchSlugParam={matchSlugParam} />
          <TeamAndLeagueStatsSection
            home={home}
            away={away}
            league={league}
            leagueSlug={leagueSlug}
            leagueId={fixture.leagueId ?? null}
          />
          <div className="mt-8 flex justify-center">
            <ShareUrlButton />
          </div>
          <section className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <NavLinkWithOverlay
              href={`/fixtures/${dateKey}/ai-insights`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300 sm:text-sm"
              message="Loading insights…"
              italic={false}
            >
              AI insights for this date
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
          </section>
          <section className="mt-10 border-t border-neutral-200 pt-8 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Frequently asked questions about this match
            </h2>
            <dl className="mt-3 space-y-4">
              <div>
                <dt className="font-medium">
                  When does {home} vs {away} kick off?
                </dt>
                <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                  {kickoffPreview
                    ? `The ${home} vs ${away} ${league} match is scheduled for ${displayDatePreview} (${formatKickoff(kickoffPreview)}, Europe/London). Check back closer to kick-off for full stats and lineups.`
                    : `The ${home} vs ${away} ${league} match is scheduled for ${displayDatePreview}. This page will show full stats and lineups once the fixture is loaded – check back closer to kick-off.`}
                </dd>
              </div>
              <div>
                <dt className="font-medium">
                  What will I see on this page on match day?
                </dt>
                <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                  On match day this page will show the full dashboard: team and player per-90 stats, last 5 form, confirmed lineups when available, and live match stats. Use today&apos;s fixtures to open the full view.
                </dd>
              </div>
              <div>
                <dt className="font-medium">
                  How can I use stats for bet builders?
                </dt>
                <dd className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
                  Once the fixture is warmed, you&apos;ll see goals, xG, corners, cards and shots per 90 for both teams and key players. Use these with the form table and AI insights for smarter bet builder selections.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}

function TeamAndLeagueStatsSection({
  home,
  away,
  league,
  leagueSlug,
  leagueId,
}: {
  home: string;
  away: string;
  league: string;
  leagueSlug: string;
  leagueId: number | null;
}) {
  const leagueSlugForLinks =
    leagueId != null && STANDINGS_LEAGUE_SLUG_BY_ID[leagueId]
      ? STANDINGS_LEAGUE_SLUG_BY_ID[leagueId]
      : leagueSlug;
  const hasLeagueMarkets = leagueId != null && STANDINGS_LEAGUE_SLUG_BY_ID[leagueId] != null;
  const linkClass =
    "inline-flex items-center gap-1 text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300";
  const disabledClass =
    "inline-flex items-center gap-1 text-neutral-400 dark:text-neutral-500";
  const arrow = (
    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
  return (
    <section
      className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
      aria-label="Team and league stats for bet builders"
    >
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Team &amp; league stats for bet builders
      </h2>
      <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
        Season stats and market trends for both sides and the {league}.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{home}</span>
            <NavLinkWithOverlay
              href={`/teams/${makeTeamSlug(home)}`}
              className="text-xs font-medium text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
              message="Loading team…"
            >
              Team stats →
            </NavLinkWithOverlay>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-700">
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(home)}/markets/btts`} className={linkClass} message="Loading…"><span>BTTS</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(home)}/markets/total-goals`} className={linkClass} message="Loading…"><span>Total goals</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(home)}/markets/corners`} className={linkClass} message="Loading…"><span>Corners</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(home)}/markets/cards`} className={linkClass} message="Loading…"><span>Cards</span>{arrow}</NavLinkWithOverlay>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{away}</span>
            <NavLinkWithOverlay
              href={`/teams/${makeTeamSlug(away)}`}
              className="text-xs font-medium text-violet-600 underline-offset-2 hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
              message="Loading team…"
            >
              Team stats →
            </NavLinkWithOverlay>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-700">
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(away)}/markets/btts`} className={linkClass} message="Loading…"><span>BTTS</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(away)}/markets/total-goals`} className={linkClass} message="Loading…"><span>Total goals</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(away)}/markets/corners`} className={linkClass} message="Loading…"><span>Corners</span>{arrow}</NavLinkWithOverlay>
            <NavLinkWithOverlay href={`/teams/${makeTeamSlug(away)}/markets/cards`} className={linkClass} message="Loading…"><span>Cards</span>{arrow}</NavLinkWithOverlay>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-800/40 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {hasLeagueMarkets ? (
              <NavLinkWithOverlay
                href={`/leagues/${leagueSlugForLinks}/standings`}
                className="text-sm font-medium text-neutral-800 hover:underline dark:text-neutral-100 dark:hover:underline"
                message="Loading league table…"
              >
                {league}
              </NavLinkWithOverlay>
            ) : (
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{league}</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-700">
            {hasLeagueMarkets ? (
              <>
                <NavLinkWithOverlay href={`/leagues/${leagueSlugForLinks}/markets/btts`} className={linkClass} message="Loading…"><span>BTTS</span>{arrow}</NavLinkWithOverlay>
                <NavLinkWithOverlay href={`/leagues/${leagueSlugForLinks}/markets/total-goals`} className={linkClass} message="Loading…"><span>Total goals</span>{arrow}</NavLinkWithOverlay>
                <NavLinkWithOverlay href={`/leagues/${leagueSlugForLinks}/markets/corners`} className={linkClass} message="Loading…"><span>Corners</span>{arrow}</NavLinkWithOverlay>
                <NavLinkWithOverlay href={`/leagues/${leagueSlugForLinks}/markets/cards`} className={linkClass} message="Loading…"><span>Cards</span>{arrow}</NavLinkWithOverlay>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className={disabledClass}>BTTS</span>
                  <span className={disabledClass}>Total goals</span>
                  <span className={disabledClass}>Corners</span>
                  <span className={disabledClass}>Cards</span>
                </div>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  League market pages for this competition are coming soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
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
  const leagueId = typeof fixture.leagueId === "number" ? fixture.leagueId : null;
  const standingsSlugPreview = getStandingsSlug(leagueId, leagueSlug);

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
              {standingsSlugPreview ? (
                <>
                  <NavLinkWithOverlay
                    href={`/leagues/${standingsSlugPreview}/standings`}
                    className="hover:underline focus:underline"
                    message="Loading league table…"
                  >
                    {league}
                  </NavLinkWithOverlay>
                  {" · "}{displayDate}
                </>
              ) : (
                <>{league} · {displayDate}</>
              )}
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
        {standingsSlugPreview && (
          <nav
            className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700"
            aria-label="League table"
          >
            <NavLinkWithOverlay
              href={`/leagues/${standingsSlugPreview}/standings`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
              message="Loading league table…"
            >
              View {league} league table →
            </NavLinkWithOverlay>
          </nav>
        )}
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
