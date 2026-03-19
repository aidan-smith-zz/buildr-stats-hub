import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getTeamPageData, getTeamIdBySlug, getTeamIdentityById, getTeamUpcomingFixtures } from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { makeTeamSlug, normalizeTeamSlug } from "@/lib/teamSlugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";

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

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return { title: "Team not found", robots: { index: false, follow: false } };
  const data = await getTeamPageData(teamId);
  if (!data) return { title: "Team not found", robots: { index: false, follow: false } };
  const displayName = data.shortName ?? data.name;
  const title = buildIntentTitle({
    intent: "Corners stats",
    subject: displayName,
    timeframe: `${data.leagueName} ${data.season}`,
    keyStat: "Over 3.5, 4.5 & 5.5",
  });
  const description = toSnippetDescription([
    `Team corners stats for ${displayName} in ${data.leagueName} ${data.season}.`,
    "See over 3.5, 4.5 and 5.5 rates in recent games, plus home/away corner averages.",
    "Use for team corners and bet builder picks.",
  ]);
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, url: `${BASE_URL}/teams/${makeTeamSlug(displayName)}/markets/corners` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamCornersPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();
  const normalizedSlug = normalizeTeamSlug(slug);
  const identity = await getTeamIdentityById(teamId);
  if (!identity) notFound();
  const canonicalSlug = makeTeamSlug(identity.shortName ?? identity.name);
  if (normalizedSlug !== canonicalSlug) {
    permanentRedirect(`/teams/${canonicalSlug}/markets/corners`);
  }
  const data = await getTeamPageData(teamId);
  if (!data) notFound();
  const displayName = data.shortName ?? data.name;
  const recentWithCorners = data.recentFixtures.filter((f) => f.teamCorners != null);
  const sampleSize = recentWithCorners.length;
  const over35Count = recentWithCorners.filter((f) => (f.teamCorners ?? 0) > 3.5).length;
  const over45Count = recentWithCorners.filter((f) => (f.teamCorners ?? 0) > 4.5).length;
  const over55Count = recentWithCorners.filter((f) => (f.teamCorners ?? 0) > 5.5).length;
  const over35Pct = sampleSize > 0 ? (over35Count / sampleSize) * 100 : null;
  const over45Pct = sampleSize > 0 ? (over45Count / sampleSize) * 100 : null;
  const over55Pct = sampleSize > 0 ? (over55Count / sampleSize) * 100 : null;
  const homeAvg = data.homeAwayProfile?.homeCornersPerMatch ?? null;
  const awayAvg = data.homeAwayProfile?.awayCornersPerMatch ?? null;
  const homeGames = data.homeAwayProfile?.homeGames ?? 0;
  const awayGames = data.homeAwayProfile?.awayGames ?? 0;

  const upcoming = await getTeamUpcomingFixtures(teamId);
  const likelihoodOutOf10 = (pct: number | null): number | null =>
    pct == null ? null : Math.round((pct / 100) * 10);
  const over45Likelihood = likelihoodOutOf10(over45Pct);

  const leagueIdEntry = Object.entries(LEAGUE_DISPLAY_NAMES).find(([, name]) => name === data.leagueName);
  const leagueId = leagueIdEntry ? Number(leagueIdEntry[0]) : undefined;
  const leagueSlug = leagueId != null ? STANDINGS_LEAGUE_SLUG_BY_ID[leagueId] : null;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` } : null,
    { href: `/teams/${canonicalSlug}`, label: displayName },
    { href: `/teams/${canonicalSlug}/markets/corners`, label: "Corners" },
  ].filter(Boolean) as { href: string; label: string }[];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `${BASE_URL}${item.href}`,
    })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What are team corners markets?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Team corners markets focus on how many corners one team is expected to win (for example, over 4.5 corners).",
        },
      },
      {
        "@type": "Question",
        name: `What does over 4.5 corners likelihood out of 10 mean for ${displayName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `It&apos;s a 1–10 guide based mainly on ${displayName}&apos;s recent over-4.5 corners rate (with home/away context where available).`,
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${displayName}'s corners stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Use the over-3.5/4.5/5.5 rates (plus home/away splits) to compare with odds and build team corners bets.`,
        },
      },
      {
        "@type": "Question",
        name: `Where do these corners numbers come from?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The rates are calculated from ${displayName}&apos;s recent games in tracked competitions for the current season.`,
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
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
                {displayName} – Team corners
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Team corners focus on how many corners {displayName} win in a match. This page looks at roughly the last 10 games from
            their current season (in tracked competitions) to show how often they go over 3.5, 4.5 and 5.5 team corners and how their
            corner output differs at home vs away.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            At a glance: Over 3.5 corners {over35Pct != null ? `${over35Pct.toFixed(1)}%` : "—"} ({over35Count} of {sampleSize}),
            Over 4.5 corners {over45Pct != null ? `${over45Pct.toFixed(1)}%` : "—"} ({over45Count} of {sampleSize}),
            and Over 5.5 corners {over55Pct != null ? `${over55Pct.toFixed(1)}%` : "—"} ({over55Count} of {sampleSize}).
          </p>
        </header>

        {/* Upcoming + likelihood */}
        <section
          id="corners-upcoming"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Upcoming fixtures &amp; corners likelihood
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Next fixtures and a simple “over 4.5 corners” likelihood score (1–10) based on {displayName}&apos;s recent over 4.5
            team corner rate. This is a basic indicator, not betting advice.
          </p>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">No upcoming fixtures in the next 14 days.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {upcoming.map((u, i) => (
                <li
                  key={`${u.dateKey}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {u.isHome ? `${displayName} vs ${u.opponentName}` : `${u.opponentName} vs ${displayName}`}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(u.kickoff)}
                      {u.league ? ` · ${u.league}` : null} · {formatKickoff(u.kickoff)}
                    </p>
                  </div>
                  {over45Likelihood != null && (
                    <span className="rounded bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      Over 4.5 corners {over45Likelihood}/10
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Over 3.5, 4.5, 5.5 team corners (last ~10 games) */}
        <section
          id="corners-season-stats"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Over 3.5, 4.5 and 5.5 team corners (last {sampleSize || "0"} games)
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Share of {displayName}&apos;s recent games (up to the last 10) where <strong>their own</strong> corners total went over each team corners line (opponent corners are not included).
          </p>
          {sampleSize === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              No recent games with team corners data yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 3.5 corners</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over35Pct != null ? `${over35Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over35Count} of {sampleSize} games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 4.5 corners</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over45Pct != null ? `${over45Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over45Count} of {sampleSize} games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 5.5 corners</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over55Pct != null ? `${over55Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over55Count} of {sampleSize} games
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Home vs Away corners */}
        {homeGames > 0 || awayGames > 0 ? (
          <section
            id="corners-home-away"
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Home vs away team corners
            </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Average <strong>corners won by {displayName}</strong> per match at home vs away (from recent results). This does not include opponent corners.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">At home</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {homeAvg != null ? homeAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg corners · {homeGames} games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Away</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {awayAvg != null ? awayAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg corners · {awayGames} games</p>
              </div>
            </div>
          </section>
        ) : null}

        <section
          id="corners-about"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            About team corners and this page
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <strong>Team corners</strong> track how many corners a single team wins in a match. Markets like over 4.5 or over 5.5 <strong>{displayName} corners</strong>
            are common in bet builders, especially for attacking sides who pin opponents back. This page only looks at corners taken by {displayName} in our
            tracked competitions for {data.season} to show how often they clear popular corners lines and how their corner output shifts between home and away matches.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Estimates are based on season averages and are for information only, not a prediction model or betting advice.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Related markets:{" "}
            <Link
              href={`/teams/${canonicalSlug}/markets/btts`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              BTTS
            </Link>
            ,{" "}
            <Link
              href={`/teams/${canonicalSlug}/markets/total-goals`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              total goals
            </Link>
            , and{" "}
            <Link
              href={`/teams/${canonicalSlug}/markets/cards`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              cards
            </Link>
            .
          </p>
          <Link
            href={`/teams/${canonicalSlug}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {displayName} stats &amp; form
            <span aria-hidden>→</span>
          </Link>
        </section>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">FAQs</h2>
          <dl className="mt-2 space-y-3 text-sm text-neutral-700 dark:text-neutral-200">
            <div>
              <dt className="font-medium">What are team corners markets?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Team corners markets focus on how many corners one team is expected to win (for example, over 4.5 corners).</dd>
            </div>
            <div>
              <dt className="font-medium">What does the over 4.5 likelihood out of 10 mean?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                It&apos;s a 1–10 guide based mainly on {displayName}&apos;s recent over-4.5 corners rate (with home/away context where available).
              </dd>
            </div>
            <div>
              <dt className="font-medium">How do I use the corners stats for betting?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Use the over-3.5/4.5/5.5 rates (plus home/away splits) to compare with odds and build team corners bets.</dd>
            </div>
            <div>
              <dt className="font-medium">Where do these corners numbers come from?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                The rates are calculated from {displayName}&apos;s recent games in tracked competitions for the current season.
              </dd>
            </div>
          </dl>
        </section>

      </main>
    </div>
  );
}

