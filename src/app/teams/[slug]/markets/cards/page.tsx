import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTeamPageData, getTeamIdBySlug } from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { makeTeamSlug } from "@/lib/teamSlugs";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

type RouteParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return { title: "Team not found", robots: { index: false, follow: false } };
  const data = await getTeamPageData(teamId);
  if (!data) return { title: "Team not found", robots: { index: false, follow: false } };
  const displayName = data.shortName ?? data.name;
  const title = `${displayName} cards stats & over 2.5 cards | ${data.leagueName} ${data.season}`;
  const description = `See ${displayName}'s team cards stats in ${data.leagueName} ${data.season}: how often they receive over 1.5, 2.5 and 3.5 cards in recent games, plus home vs away card averages. Use for team cards and bet builder bookings.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, url: `${BASE_URL}/teams/${makeTeamSlug(displayName)}/markets/cards` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamCardsPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();
  const data = await getTeamPageData(teamId);
  if (!data) notFound();
  const canonicalSlug = makeTeamSlug(data.shortName ?? data.name);
  const displayName = data.shortName ?? data.name;
  const recentWithCards = data.recentFixtures.filter((f) => f.teamCards != null);
  const sampleSize = recentWithCards.length;
  const over15Count = recentWithCards.filter((f) => (f.teamCards ?? 0) > 1.5).length;
  const over25Count = recentWithCards.filter((f) => (f.teamCards ?? 0) > 2.5).length;
  const over35Count = recentWithCards.filter((f) => (f.teamCards ?? 0) > 3.5).length;
  const over15Pct = sampleSize > 0 ? (over15Count / sampleSize) * 100 : null;
  const over25Pct = sampleSize > 0 ? (over25Count / sampleSize) * 100 : null;
  const over35Pct = sampleSize > 0 ? (over35Count / sampleSize) * 100 : null;
  const homeAvg = data.homeAwayProfile?.homeCardsPerMatch ?? null;
  const awayAvg = data.homeAwayProfile?.awayCardsPerMatch ?? null;
  const homeGames = data.homeAwayProfile?.homeGames ?? 0;
  const awayGames = data.homeAwayProfile?.awayGames ?? 0;

  const leagueIdEntry = Object.entries(LEAGUE_DISPLAY_NAMES).find(([, name]) => name === data.leagueName);
  const leagueId = leagueIdEntry ? Number(leagueIdEntry[0]) : undefined;
  const leagueSlug = leagueId != null ? STANDINGS_LEAGUE_SLUG_BY_ID[leagueId] : null;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` } : null,
    { href: `/teams/${canonicalSlug}`, label: displayName },
    { href: `/teams/${canonicalSlug}/markets/cards`, label: "Cards" },
  ].filter(Boolean) as { href: string; label: string }[];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What are team cards bookings markets?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Team cards markets look at how many cards (bookings) one side will receive in a match. Markets like over 1.5 or over 2.5 team cards are often used in bet builders and cards specials.",
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${displayName}'s cards stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This page estimates how often ${displayName} receive over 1.5, 2.5 and 3.5 cards in a match using their season averages, and shows home vs away card figures. You can use this to find likely team bookings legs in your bet builder and compare them to the available odds.`,
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
                {displayName} – Team cards
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Team cards track how often {displayName} are booked in a match. This page looks at roughly the last 10 games from their current
            season (in tracked competitions) to show how often they go over 1.5, 2.5 and 3.5 team cards and how their card counts differ
            at home vs away.
          </p>
        </header>

        {/* Over 1.5, 2.5, 3.5 team cards (last ~10 games) */}
        <section
          id="cards-season-stats"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Over 1.5, 2.5 and 3.5 team cards (last {sampleSize || "0"} games)
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Share of {displayName}&apos;s recent games (up to the last 10) where <strong>{displayName}</strong> were shown over each team cards line (opponent cards are not included).
          </p>
          {sampleSize === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              No recent games with team cards data yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 1.5 cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over15Pct != null ? `${over15Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over15Count} of {sampleSize} games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 2.5 cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over25Pct != null ? `${over25Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over25Count} of {sampleSize} games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 3.5 cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {over35Pct != null ? `${over35Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {over35Count} of {sampleSize} games
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Home vs Away cards */}
        {homeGames > 0 || awayGames > 0 ? (
          <section
            id="cards-home-away"
            className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Home vs away team cards
            </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Average <strong>cards shown to {displayName}</strong> per match at home vs away (from recent results). This does not include bookings for the opposition.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">At home</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {homeAvg != null ? homeAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg cards · {homeGames} games</p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Away</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {awayAvg != null ? awayAvg.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">avg cards · {awayGames} games</p>
              </div>
            </div>
          </section>
        ) : null}

        <section
          id="cards-about"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            About team cards and this page
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <strong>Team cards</strong> measure how often a single team is booked by the referee. Markets like over 1.5 or 2.5 <strong>{displayName} cards</strong>
            are often used for aggressive or foul-prone sides. This page only looks at cards shown to {displayName} in our tracked competitions for{" "}
            {data.season} to show how often they clear popular cards lines and how their card counts change between home and away.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Estimates are based on season averages and are provided for information only, not as a prediction model or betting advice.
          </p>
          <Link
            href={`/teams/${canonicalSlug}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {displayName} stats &amp; form
            <span aria-hidden>→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

