import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTeamPageData,
  getTeamIdBySlug,
  getTeamUpcomingFixtures,
  type TeamPageData,
  type TeamPageFixtureSummary,
  type TeamUpcomingFixture,
} from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
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

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

function bttsFromFixture(f: TeamPageFixtureSummary, teamIsHome: boolean): boolean | null {
  if (f.homeGoals == null || f.awayGoals == null) return null;
  return f.homeGoals > 0 && f.awayGoals > 0;
}

function computeBttsStats(data: TeamPageData) {
  const withScores = data.recentFixtures.filter(
    (f) => f.homeGoals != null && f.awayGoals != null,
  );
  const bttsCount = withScores.filter((f) => bttsFromFixture(f, f.isHome) === true).length;
  const pct = withScores.length > 0 ? (bttsCount / withScores.length) * 100 : null;
  const homeFixtures = data.recentFixtures.filter((f) => f.isHome && f.homeGoals != null && f.awayGoals != null);
  const awayFixtures = data.recentFixtures.filter((f) => !f.isHome && f.homeGoals != null && f.awayGoals != null);
  const homeBtts = homeFixtures.filter((f) => f.homeGoals! > 0 && f.awayGoals! > 0).length;
  const awayBtts = awayFixtures.filter((f) => f.homeGoals! > 0 && f.awayGoals! > 0).length;
  const homePct = homeFixtures.length > 0 ? (homeBtts / homeFixtures.length) * 100 : null;
  const awayPct = awayFixtures.length > 0 ? (awayBtts / awayFixtures.length) * 100 : null;
  return { pct, bttsCount, totalWithScores: withScores.length, homePct, awayPct, homeGames: homeFixtures.length, awayGames: awayFixtures.length };
}

function likelihoodOutOf10(bttsPct: number | null): number | null {
  if (bttsPct == null) return null;
  return Math.round((bttsPct / 100) * 10);
}

function fixtureLikelihoodOutOf10(
  stats: ReturnType<typeof computeBttsStats>,
  isHome: boolean,
  opponentBttsPct: number | null,
): number | null {
  if (stats.pct == null) return null;
  let base = stats.pct;
  const venuePct = isHome ? stats.homePct : stats.awayPct;
  if (venuePct != null) {
    base = base * 0.7 + venuePct * 0.3;
  }
  let combined = base;
  if (opponentBttsPct != null) {
    combined = combined * 0.6 + opponentBttsPct * 0.4;
  }
  return likelihoodOutOf10(combined);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return { title: "Team not found", robots: { index: false, follow: false } };
  const data = await getTeamPageData(teamId);
  if (!data) return { title: "Team not found", robots: { index: false, follow: false } };
  const displayName = data.shortName ?? data.name;
  const title = `${displayName} BTTS stats & predictions | Both teams to score | ${data.leagueName} ${data.season}`;
  const description = `See ${displayName}'s both teams to score (BTTS) stats in ${data.leagueName} ${data.season}: BTTS percentage, last 10 games and home vs away splits. Use for BTTS tips, bet builders and accumulators.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, url: `${BASE_URL}/teams/${makeTeamSlug(displayName)}/markets/btts` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamBttsPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();
  const data = await getTeamPageData(teamId);
  if (!data) notFound();
  const upcoming = await getTeamUpcomingFixtures(teamId);
  const canonicalSlug = makeTeamSlug(data.shortName ?? data.name);
  const displayName = data.shortName ?? data.name;
  const stats = computeBttsStats(data);
  const likelihood = likelihoodOutOf10(stats.pct);

  const leagueIdEntry = Object.entries(LEAGUE_DISPLAY_NAMES).find(([, name]) => name === data.leagueName);
  const leagueId = leagueIdEntry ? Number(leagueIdEntry[0]) : undefined;
  const leagueSlug = leagueId != null ? STANDINGS_LEAGUE_SLUG_BY_ID[leagueId] : null;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` } : null,
    { href: `/teams/${canonicalSlug}`, label: displayName },
    { href: `/teams/${canonicalSlug}/markets/btts`, label: "BTTS" },
  ].filter(Boolean) as { href: string; label: string }[];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is BTTS (Both Teams To Score)?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "BTTS means both teams score at least one goal in the match. A bet on BTTS yes wins if the final score is 1-1, 2-1, 3-2, etc. It loses if one team keeps a clean sheet.",
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${displayName}'s BTTS stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Use this page to see what share of ${displayName}'s games this season had both teams scoring, and how that splits between home and away. Combine with upcoming fixtures to gauge BTTS likelihood, compare to BTTS odds and build bet builders.`,
        },
      },
      {
        "@type": "Question",
        name: `Is ${displayName} a good BTTS team?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The BTTS percentage and recent results on this page show whether ${displayName}'s matches regularly see both teams scoring. A consistently high BTTS rate suggests they are a strong candidate for BTTS yes selections in coupons and bet builders.`,
        },
      },
      {
        "@type": "Question",
        name: `How often do ${displayName}'s home games land BTTS?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Home vs away BTTS splits on this page highlight whether ${displayName}'s home matches behave differently to their away games. You can use this when deciding if BTTS is stronger at home, away or in neutral fixtures for this team.`,
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
                {displayName} – BTTS (Both Teams To Score)
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Both teams to score (BTTS) means each side scores at least one goal. This page uses roughly the last 10 games from {displayName}&apos;s
            current season in tracked competitions to show how often their matches land BTTS and how that varies at home vs away for bet builders and BTTS tips.
          </p>
        </header>

        {/* Season BTTS % */}
        <section
          id="btts-season-stats"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            BTTS this season
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Share of {displayName}&apos;s games (in tracked competitions) where both teams scored.
          </p>
          {stats.totalWithScores === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No completed games with results yet.</p>
          ) : (
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                {stats.pct != null ? stats.pct.toFixed(1) : "—"}%
              </span>
              <span className="text-sm text-neutral-500 dark:text-neutral-500">
                ({stats.bttsCount} of {stats.totalWithScores} games)
              </span>
            </div>
          )}
        </section>

        {/* Recent results + BTTS */}
        <section
          id="btts-recent-results"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Recent results & BTTS
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Last results and whether both teams scored (BTTS yes).
          </p>
          {data.recentFixtures.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No recent fixtures yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentFixtures.map((f) => {
                const btts = bttsFromFixture(f, f.isHome);
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
                      {btts === true && (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                          BTTS
                        </span>
                      )}
                      {btts === false && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-500">No BTTS</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Home vs Away BTTS */}
        {stats.homeGames > 0 || stats.awayGames > 0 ? (
          <section
            id="btts-home-away"
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Home vs away BTTS
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              BTTS rate in {displayName}&apos;s home and away games (from recent results).
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">At home</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.homePct != null ? `${stats.homePct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{stats.homeGames} home games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Away</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {stats.awayPct != null ? `${stats.awayPct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">{stats.awayGames} away games</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Upcoming + likelihood */}
        <section
          id="btts-upcoming"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Upcoming fixtures & BTTS likelihood
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Next fixtures and a simple BTTS likelihood score (1–10) based on {displayName}&apos;s overall and home/away BTTS rates
            and, when available, the opponent&apos;s BTTS record. This is a basic indicator, not betting advice.
          </p>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No upcoming fixtures in the next 14 days.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {upcoming.map((u, i) => {
                // For now we only adjust by venue (home/away). Opponent BTTS can be folded in later when available.
                const fixtureScore = fixtureLikelihoodOutOf10(stats, u.isHome, null);
                return (
                  <li key={`${u.dateKey}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {u.isHome ? `${displayName} vs ${u.opponentName}` : `${u.opponentName} vs ${displayName}`}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatDate(u.kickoff)}{u.league ? ` · ${u.league}` : null} · {formatKickoff(u.kickoff)}
                      </p>
                    </div>
                    {fixtureScore != null && (
                      <span className="rounded bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                        BTTS {fixtureScore}/10
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          id="btts-about"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            About BTTS and this page
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <strong>Both teams to score (BTTS)</strong> is a popular bet where you win if each side scores at least one goal.
            This page uses {displayName}&apos;s results in our tracked competitions for {data.season} to show how often their
            games land BTTS. Home and away splits can help you spot whether they tend to produce BTTS more at home or on the road.
            The &quot;BTTS out of 10&quot; for upcoming games is a simple guide based on the team&apos;s season rate, not a prediction model.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            For more stats and form, see the main team page and use today&apos;s fixtures for live match data. You can also look at{" "}
            <Link
              href={`/teams/${canonicalSlug}/markets/total-goals`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              {displayName}&apos;s total goals (over/under) stats
            </Link>{" "}
            to understand whether their matches are generally high-scoring as well as BTTS-friendly.
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
