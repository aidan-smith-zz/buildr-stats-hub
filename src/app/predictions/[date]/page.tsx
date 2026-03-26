import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { getDateMarketPredictions } from "@/lib/predictionsService";
import { toSnippetDescription } from "@/lib/seoMetadata";
import { matchSlug, leagueToSlug, todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { dateContextLabel, normalizeDateKey, shortDateLabel } from "@/app/predictions/date-utils";
import { TopPicksSection } from "@/app/predictions/_components/top-picks-section";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

export const revalidate = 3600;

function matchHref(dateKey: string, row: Awaited<ReturnType<typeof getDateMarketPredictions>>["rows"][number]): string {
  const home = row.fixture.homeTeam.shortName ?? row.fixture.homeTeam.name;
  const away = row.fixture.awayTeam.shortName ?? row.fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueToSlug(row.fixture.leagueName)}/${matchSlug(home, away)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: rawDate } = await params;
  const dateKey = normalizeDateKey(rawDate);
  const context = dateContextLabel(dateKey);
  const shortDate = shortDateLabel(dateKey);
  const canonical = `${BASE_URL}/predictions/${dateKey}`;
  const title =
    context === "today"
      ? `Football predictions today (${shortDate}) | BTTS, goals, corners, cards | statsBuildr`
      : context === "tomorrow"
        ? `Football predictions tomorrow (${shortDate}) | BTTS, goals, corners, cards | statsBuildr`
        : `Football predictions ${shortDate} | BTTS, goals, corners, cards | statsBuildr`;

  const description = toSnippetDescription([
    context === "today"
      ? `Today's football predictions for ${shortDate}: BTTS, total goals, corners and cards.`
      : context === "tomorrow"
        ? `Tomorrow's football predictions for ${shortDate}: BTTS, total goals, corners and cards.`
        : `Football predictions for ${shortDate}: BTTS, total goals, corners and cards.`,
    "Last-10 form, confidence ratings and line likelihoods from warmed stats — bet builder friendly.",
  ]);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    keywords: [
      "football predictions",
      "BTTS predictions",
      "both teams to score tips",
      "over 2.5 goals predictions",
      "corners predictions",
      "cards predictions",
      "today football tips",
      "tomorrow football predictions",
      shortDate,
    ],
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      images: [{ url: `${BASE_URL}/stats-buildr.png`, width: 512, height: 160, alt: `Football predictions for ${shortDate} on statsBuildr` }],
      locale: "en_GB",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/stats-buildr.png`],
    },
  };
}

export default async function PredictionsDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: rawDate } = await params;
  const dateKey = normalizeDateKey(rawDate);
  const context = dateContextLabel(dateKey);
  const [btts, goals, corners, cards] = await Promise.all([
    getDateMarketPredictions(dateKey, "btts"),
    getDateMarketPredictions(dateKey, "total-goals"),
    getDateMarketPredictions(dateKey, "corners"),
    getDateMarketPredictions(dateKey, "cards"),
  ]);

  const today = todayDateKey();
  const tomorrow = tomorrowDateKey();
  const canonical = `${BASE_URL}/predictions/${dateKey}`;
  const shortDate = shortDateLabel(dateKey);
  const dayLabel =
    context === "today" ? "today" : context === "tomorrow" ? "tomorrow" : "this date";

  const marketCards = [
    {
      key: "btts",
      href: `/predictions/${dateKey}/btts`,
      title: "BTTS predictions",
      subtitle: "Both Teams To Score",
      description:
        "BTTS means both teams to score at least once in 90 minutes. We grade each fixture from last-10 scoring and conceding trends.",
      highCount: btts.rows.filter((r) => r.confidence === "High").length,
    },
    {
      key: "total-goals",
      href: `/predictions/${dateKey}/total-goals`,
      title: "Total goals predictions",
      subtitle: "Over 1.5, 2.5 and 3.5",
      description:
        "Goal-lines model showing over 1.5, over 2.5 and over 3.5 likelihood from recent match totals and attacking profiles.",
      highCount: goals.rows.filter((r) => r.confidence === "High").length,
    },
    {
      key: "corners",
      href: `/predictions/${dateKey}/corners`,
      title: "Corners predictions",
      subtitle: "Over 3.5, 4.5 and 5.5",
      description:
        "Corners market view based on each side's recent corner outputs, with confidence levels and line-by-line percentages.",
      highCount: corners.rows.filter((r) => r.confidence === "High").length,
    },
    {
      key: "cards",
      href: `/predictions/${dateKey}/cards`,
      title: "Cards predictions",
      subtitle: "Over 1.5, 2.5 and 3.5",
      description:
        "Cards view built from yellow/red trends in the last 10 matches, surfacing high-intensity fixtures by confidence tier.",
      highCount: cards.rows.filter((r) => r.confidence === "High").length,
    },
  ] as const;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name:
      context === "today"
        ? `Football predictions today (${shortDate})`
        : context === "tomorrow"
          ? `Football predictions tomorrow (${shortDate})`
          : `Football predictions ${shortDate}`,
    description: toSnippetDescription([
      `Market hub for ${shortDate}: BTTS, total goals, corners and cards from last-10 warmed data.`,
      "Confidence tiers and line percentages for bet builder research.",
    ]),
    url: canonical,
    isPartOf: { "@type": "WebSite", name: "statsBuildr", url: BASE_URL },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Predictions", item: `${BASE_URL}/predictions` },
      {
        "@type": "ListItem",
        position: 3,
        name: shortDate,
        item: canonical,
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What does BTTS mean in football predictions?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "BTTS means Both Teams To Score. A BTTS prediction estimates the likelihood that both clubs score at least once in the match.",
        },
      },
      {
        "@type": "Question",
        name: "How are these predictions calculated?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Predictions are generated from warmed data, using each team's last 10 matches to produce confidence levels and line percentages across BTTS, goals, corners and cards.",
        },
      },
      {
        "@type": "Question",
        name: "Are the pages updated daily for today and tomorrow?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. The predictions hub updates date routes daily for today's and tomorrow's fixtures, and each market page only covers fixtures on that selected date.",
        },
      },
    ],
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{btts.displayDate}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-[1.65rem]">
          {context === "today"
            ? `Today's football predictions (${shortDate})`
            : context === "tomorrow"
              ? `Tomorrow's football predictions (${shortDate})`
              : `Football predictions (${shortDate})`}{" "}
          — BTTS, goals, corners &amp; cards
        </h1>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>
            Your <strong>matchday predictions hub</strong> for this date only: open BTTS (both teams to score), total goals
            lines, corner counts and cards — each ranked with confidence from each team&apos;s <strong>last 10</strong>{" "}
            warmed matches.
          </p>
          <p>
            Use the market cards for quick definitions, or jump straight to top picks below. Every fixture links to{" "}
            <strong>match previews</strong> for lineups and deeper stats.
          </p>
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap gap-2">
        <NavLinkWithOverlay href={`/predictions/${today}`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Today</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${tomorrow}`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Tomorrow</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${dateKey}/btts`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">BTTS</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${dateKey}/total-goals`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Total goals</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${dateKey}/corners`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Corners</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${dateKey}/cards`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Cards</NavLinkWithOverlay>
      </nav>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Pick a market</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {marketCards.map((card) => (
            <NavLinkWithOverlay
              key={card.key}
              href={card.href}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-violet-500/60"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{card.subtitle}</p>
              <h3 className="mt-1 text-base font-semibold text-neutral-900 dark:text-neutral-50">{card.title}</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{card.description}</p>
              <p className="mt-3 text-xs font-medium text-violet-700 dark:text-violet-300">
                {card.highCount} high-confidence fixtures {dayLabel} in this market
              </p>
            </NavLinkWithOverlay>
          ))}
        </div>
      </section>

      <div className="mt-6">
        <TopPicksSection title="Top BTTS picks" rows={btts.rows} market="btts" matchHref={(row) => matchHref(dateKey, row)} />
        <TopPicksSection title="Top total goals picks" rows={goals.rows} market="total-goals" matchHref={(row) => matchHref(dateKey, row)} />
        <TopPicksSection title="Top corners picks" rows={corners.rows} market="corners" matchHref={(row) => matchHref(dateKey, row)} />
        <TopPicksSection title="Top cards picks" rows={cards.rows} market="cards" matchHref={(row) => matchHref(dateKey, row)} />
      </div>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">How to use this predictions hub</h2>
        <ul className="mt-2 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
          <li>Start with the market that matches your bet angle: BTTS, goals, corners or cards.</li>
          <li>Use confidence as a quick filter, then open each market page for line-specific percentages.</li>
          <li>Open match previews from top picks to combine these signals with fixture-level context and lineups.</li>
        </ul>
      </section>
    </main>
  );
}
