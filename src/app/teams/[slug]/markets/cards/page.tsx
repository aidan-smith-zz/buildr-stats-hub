import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getTeamIdBySlug, getTeamIdentityById, getTeamPageData, getTeamUpcomingFixtures } from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { makeTeamSlug, normalizeTeamSlug } from "@/lib/teamSlugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const revalidate = 86400;

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
    intent: "Cards stats",
    subject: displayName,
    timeframe: `${data.leagueName} ${data.season}`,
    keyStat: "Over 1.5, 2.5 & 3.5",
  });
  const description = toSnippetDescription([
    `Team cards stats for ${displayName} in ${data.leagueName} ${data.season}.`,
    "See over 1.5, 2.5 and 3.5 rates in recent games, plus home/away card averages.",
    "Use for team cards and bet builder bookings.",
  ]);
  const canonical = `${BASE_URL}/teams/${makeTeamSlug(displayName)}/markets/cards`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TeamCardsPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();
  const normalizedSlug = normalizeTeamSlug(slug);
  const identity = await getTeamIdentityById(teamId);
  if (!identity) notFound();
  const canonicalSlug = makeTeamSlug(identity.shortName ?? identity.name);
  if (normalizedSlug !== canonicalSlug) {
    permanentRedirect(`/teams/${canonicalSlug}/markets/cards`);
  }
  const data = await getTeamPageData(teamId);
  if (!data) notFound();
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

  const upcoming = await getTeamUpcomingFixtures(teamId);
  const likelihoodOutOf10 = (pct: number | null): number | null => (pct == null ? null : Math.round((pct / 100) * 10));
  // Simple bookings likelihood based on the team's overall over-2.5 cards rate.
  const over25Likelihood = likelihoodOutOf10(over25Pct);

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` } : null,
    { href: `/teams/${canonicalSlug}`, label: displayName },
    { href: `/teams/${canonicalSlug}/markets/cards`, label: "Cards" },
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
        name: "What are team cards bookings markets?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Team cards markets estimate how many cards one team is booked for in a match (for example, over 2.5 team cards).",
        },
      },
      {
        "@type": "Question",
        name: `What does over 2.5 cards likelihood out of 10 mean for ${displayName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `It&apos;s a 1–10 guide based mainly on ${displayName}&apos;s season over-2.5 cards rate, with home/away context where available.`,
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${displayName}'s cards stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Use the over 1.5/2.5/3.5 cards rates (plus home/away splits) to compare with odds and build bet builder cards legs.`,
        },
      },
      {
        "@type": "Question",
        name: `Where do these cards numbers come from?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `These rates are calculated from ${displayName}&apos;s recent games in tracked competitions for the current season.`,
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
                {displayName} – Team cards
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Team cards track how often {displayName} are booked in a match. This page looks at roughly the last 10 games from their current
            season (in tracked competitions) to show how often they go over 1.5, 2.5 and 3.5 team cards and how their card counts differ
            at home vs away.
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            At a glance: Over 1.5 cards {over15Pct != null ? `${over15Pct.toFixed(1)}%` : "—"} ({over15Count} of {sampleSize}),
            Over 2.5 cards {over25Pct != null ? `${over25Pct.toFixed(1)}%` : "—"} ({over25Count} of {sampleSize}),
            and Over 3.5 cards {over35Pct != null ? `${over35Pct.toFixed(1)}%` : "—"} ({over35Count} of {sampleSize}).
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

        {/* Upcoming + likelihood */}
        <section
          id="cards-upcoming"
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Upcoming fixtures &amp; bookings likelihood
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Next fixtures and a simple “over 2.5 cards” likelihood score (1–10) based on {displayName}&apos;s overall over-2.5
            team cards rate. This is a basic indicator, not betting advice.
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
                  {over25Likelihood != null && (
                    <span className="rounded bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      Over 2.5 cards {over25Likelihood}/10
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

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
              href={`/teams/${canonicalSlug}/markets/corners`}
              className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              corners
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
              <dt className="font-medium">What are team cards markets?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Team cards markets estimate how many cards one team is booked for in a match (for example, over 2.5 team cards).</dd>
            </div>
            <div>
              <dt className="font-medium">What does over 2.5 likelihood out of 10 mean?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                It&apos;s a 1–10 guide based mainly on {displayName}&apos;s season over-2.5 cards rate, with home/away context where available.
              </dd>
            </div>
            <div>
              <dt className="font-medium">How do I use the cards stats for betting?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Use the over 1.5/2.5/3.5 cards rates (plus home/away splits) to compare with odds and build bet builder legs.</dd>
            </div>
            <div>
              <dt className="font-medium">Where do these numbers come from?</dt>
              <dd className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                These rates are calculated from {displayName}&apos;s recent games in tracked competitions for the current season.
              </dd>
            </div>
          </dl>
        </section>

      </main>
    </div>
  );
}

