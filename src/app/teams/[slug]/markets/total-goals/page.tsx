import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTeamPageData,
  getTeamIdBySlug,
  type TeamPageData,
  type TeamPageFixtureSummary,
} from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";
import { makeTeamSlug } from "@/lib/teamSlugs";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

type RouteParams = { params: Promise<{ slug: string }> };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function totalGoalsFromFixture(f: TeamPageFixtureSummary): number | null {
  if (f.homeGoals == null || f.awayGoals == null) return null;
  return f.homeGoals + f.awayGoals;
}

function computeTotalGoalsStats(data: TeamPageData) {
  const withScores = data.recentFixtures.filter(
    (f) => f.homeGoals != null && f.awayGoals != null,
  );
  const totals = withScores.map((f) => f.homeGoals! + f.awayGoals!);
  const over15 = totals.filter((t) => t > 1.5).length;
  const over25 = totals.filter((t) => t > 2.5).length;
  const over35 = totals.filter((t) => t > 3.5).length;
  const n = totals.length;
  const pctOver15 = n > 0 ? (over15 / n) * 100 : null;
  const pctOver25 = n > 0 ? (over25 / n) * 100 : null;
  const pctOver35 = n > 0 ? (over35 / n) * 100 : null;
  const homeFixtures = data.recentFixtures.filter((f) => f.isHome && f.homeGoals != null && f.awayGoals != null);
  const awayFixtures = data.recentFixtures.filter((f) => !f.isHome && f.homeGoals != null && f.awayGoals != null);
  const homeTotals = homeFixtures.map((f) => f.homeGoals! + f.awayGoals!);
  const awayTotals = awayFixtures.map((f) => f.homeGoals! + f.awayGoals!);
  const homeAvg = homeTotals.length > 0 ? homeTotals.reduce((a, b) => a + b, 0) / homeTotals.length : null;
  const awayAvg = awayTotals.length > 0 ? awayTotals.reduce((a, b) => a + b, 0) / awayTotals.length : null;
  return {
    pctOver15,
    pctOver25,
    pctOver35,
    over15,
    over25,
    over35,
    totalGames: n,
    homeAvg,
    awayAvg,
    homeGames: homeTotals.length,
    awayGames: awayTotals.length,
  };
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return { title: "Team not found", robots: { index: false, follow: false } };
  const data = await getTeamPageData(teamId);
  if (!data) return { title: "Team not found", robots: { index: false, follow: false } };
  const displayName = data.shortName ?? data.name;
  const title = `${displayName} total goals stats & over 2.5 tips | ${data.leagueName} ${data.season}`;
  const description = `See ${displayName}'s total goals record in ${data.leagueName} ${data.season}: % of games over 1.5, 2.5 and 3.5 goals, recent results, and home vs away goal averages. Use for over 2.5 goals, over 1.5 and bet builder picks.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, url: `${BASE_URL}/teams/${makeTeamSlug(displayName)}/markets/total-goals` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamTotalGoalsPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();
  const data = await getTeamPageData(teamId);
  if (!data) notFound();
  const canonicalSlug = makeTeamSlug(data.shortName ?? data.name);
  const displayName = data.shortName ?? data.name;
  const stats = computeTotalGoalsStats(data);

  const leagueIdEntry = Object.entries(LEAGUE_DISPLAY_NAMES).find(([, name]) => name === data.leagueName);
  const leagueId = leagueIdEntry ? Number(leagueIdEntry[0]) : undefined;
  const leagueSlug = leagueId != null ? STANDINGS_LEAGUE_SLUG_BY_ID[leagueId] : null;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` } : null,
    { href: `/teams/${canonicalSlug}`, label: displayName },
    { href: `/teams/${canonicalSlug}/markets/total-goals`, label: "Total goals" },
  ].filter(Boolean) as { href: string; label: string }[];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What are total goals (over/under) markets?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Total goals is the combined number of goals scored by both teams. Over 2.5 goals means 3 or more goals in the match; over 1.5 means 2 or more; over 3.5 means 4 or more. These are common bet builder and accumulator markets.",
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${displayName}'s total goals stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This page shows what share of ${displayName}'s games this season had over 1.5, 2.5 and 3.5 total goals, and how that splits between home and away. Use it to compare with odds and build over/under bets.`,
        },
      },
      {
        "@type": "Question",
        name: `Are ${displayName}'s matches usually high scoring?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The percentages for over 1.5, 2.5 and 3.5 goals give a quick view of how often ${displayName}'s games are high scoring compared to a typical fixture in their league. Higher over 2.5 and over 3.5 rates indicate more open, goal-heavy matches.`,
        },
      },
      {
        "@type": "Question",
        name: `What does over 2.5 goals mean for ${displayName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Over 2.5 goals means there must be at least 3 total goals in the match, regardless of which side scores them. This page shows how often ${displayName}'s games clear that line so you can judge whether over 2.5 goals is a realistic outcome for upcoming fixtures.`,
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-3" />
        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex items-center gap-3">
            {data.crestUrl ? (
              <img src={data.crestUrl} alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 object-contain" />
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {data.leagueName} · {data.season}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                {displayName} – Total goals
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Total goals is the combined score (both teams). This page looks at roughly the last 10 games from {displayName}&apos;s current season
            to show how often their matches go over 1.5, 2.5 and 3.5 goals and how that varies at home vs away for over/under and bet builder tips.
          </p>
        </header>

        {/* Over 1.5, 2.5, 3.5 % */}
        <section
          id="total-goals-season-stats"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Total goals this season
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Share of {displayName}&apos;s games (in tracked competitions) that went over each line.
          </p>
          {stats.totalGames === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No completed games with results yet.</p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 1.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.pctOver15 != null ? `${stats.pctOver15.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{stats.over15} of {stats.totalGames} games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 2.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.pctOver25 != null ? `${stats.pctOver25.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{stats.over25} of {stats.totalGames} games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 3.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.pctOver35 != null ? `${stats.pctOver35.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{stats.over35} of {stats.totalGames} games</p>
              </div>
            </div>
          )}
        </section>

        {/* Recent results + total goals */}
        <section
          id="total-goals-recent-results"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Recent results & total goals
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Last results and total goals (combined score) in each match.
          </p>
          {data.recentFixtures.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No recent fixtures yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentFixtures.map((f) => {
                const total = totalGoalsFromFixture(f);
                const score = f.homeGoals != null && f.awayGoals != null ? `${f.homeGoals}–${f.awayGoals}` : (f.statusShort ?? "—");
                return (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {f.isHome ? `${displayName} vs ${f.opponentName}` : `${f.opponentName} vs ${displayName}`}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatDate(f.date)}{f.league ? ` · ${f.league}` : null}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-50">{score}</span>
                      {total != null && (
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                          {total} goals
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Home vs Away total goals */}
        {stats.homeGames > 0 || stats.awayGames > 0 ? (
          <section
            id="total-goals-home-away"
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Home vs away total goals
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Average total goals per match when {displayName} play at home vs away (from recent results).
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">At home</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.homeAvg != null ? stats.homeAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg total goals · {stats.homeGames} games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Away</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.awayAvg != null ? stats.awayAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg total goals · {stats.awayGames} games</p>
              </div>
            </div>
          </section>
        ) : null}

        <section
          id="total-goals-about"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            About total goals and this page
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <strong>Total goals</strong> is the combined number of goals scored by both teams. Over/under 2.5 is one of the
            most popular football bets: over 2.5 wins if there are 3 or more goals. This page uses {displayName}&apos;s results
            in our tracked competitions for {data.season} to show how often their games go over 1.5, 2.5 and 3.5 goals.
            Home and away averages help you see whether their matches tend to be higher or lower scoring in different venues.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            For more stats and form, see the main team page and use today&apos;s fixtures for live match data. You can also{" "}
            <Link
              href={`/teams/${canonicalSlug}/markets/btts`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              check {displayName}&apos;s BTTS (both teams to score) stats
            </Link>{" "}
            to see whether their matches combine high goal counts with both sides getting on the scoresheet.
          </p>
          <Link
            href={`/teams/${canonicalSlug}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {displayName} stats & form
            <span aria-hidden>→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}
