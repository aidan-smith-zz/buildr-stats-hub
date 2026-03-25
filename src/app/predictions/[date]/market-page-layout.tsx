import type { Metadata } from "next";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { MatchList } from "@/app/predictions/_components/match-list";
import { TopPicksSection } from "@/app/predictions/_components/top-picks-section";
import { dateContextLabel, normalizeDateKey, shortDateLabel } from "@/app/predictions/date-utils";
import { getDateMarketPredictions, type PredictionMarket } from "@/lib/predictionsService";
import { toSnippetDescription } from "@/lib/seoMetadata";
import { leagueToSlug, matchSlug, todayDateKey, tomorrowDateKey } from "@/lib/slugs";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

const MARKET_TEXT: Record<
  PredictionMarket,
  {
    title: string;
    keyLine: string;
    metaTitlePrefix: string;
    keywords: string[];
    intro: string[];
  }
> = {
  btts: {
    title: "BTTS predictions",
    metaTitlePrefix: "BTTS predictions (both teams to score)",
    keyLine:
      "BTTS YES/NO angles from each team's last 10 matches — both teams must score at least once for a YES.",
    keywords: [
      "BTTS predictions",
      "both teams to score tips",
      "BTTS today",
      "football BTTS predictions",
    ],
    intro: [
      "BTTS (both teams to score) means both clubs score at least once in 90 minutes. We show YES likelihood from each side's last-10 scoring and conceding trends, plus a simple YES/NO call.",
      "Use top picks for the strongest signals, then open match previews for lineups and full stats.",
    ],
  },
  "total-goals": {
    title: "Total goals predictions",
    metaTitlePrefix: "Total goals & over 1.5 / 2.5 / 3.5",
    keyLine:
      "Over 1.5, 2.5 and 3.5 goals likelihood per fixture — combined from recent match totals and attacking form.",
    keywords: [
      "over 2.5 goals predictions",
      "over 1.5 goals tips",
      "total goals football",
      "goals predictions today",
    ],
    intro: [
      "Total goals predictions compare how often each side's recent games have gone over common lines. Combined averages feed our confidence tier; the grid shows over 1.5, 2.5 and 3.5 hit rates.",
      "Ideal for overs and bet builder legs when you want goal-heavy fixtures.",
    ],
  },
  corners: {
    title: "Corners predictions",
    metaTitlePrefix: "Corners — over 3.5 / 4.5 / 5.5",
    keyLine:
      "Corner market signals from each team's last 10 — over 3.5, 4.5 and 5.5 combined corner counts.",
    keywords: [
      "corners predictions",
      "over corners football",
      "corner count tips",
      "bet builder corners",
    ],
    intro: [
      "Corners predictions use recent corner data per team, then combine both sides for line likelihoods. Higher combined averages mean stronger corner angles.",
      "Pair with match previews when you need set-piece or tactical context.",
    ],
  },
  cards: {
    title: "Cards predictions",
    metaTitlePrefix: "Cards & bookings — over 1.5 / 2.5 / 3.5",
    keyLine:
      "Yellow and red card trends from the last 10 — over 1.5, 2.5 and 3.5 card lines for referee-heavy fixtures.",
    keywords: [
      "cards predictions football",
      "booking points tips",
      "yellow cards betting",
      "cards bet builder",
    ],
    intro: [
      "Cards predictions look at how often each team's recent games have seen bookings stack up. We combine both sides for line percentages and confidence.",
      "Use this page when you want aggressive, high-foul matches for cards markets.",
    ],
  },
};

function matchHref(dateKey: string, row: Awaited<ReturnType<typeof getDateMarketPredictions>>["rows"][number]): string {
  const home = row.fixture.homeTeam.shortName ?? row.fixture.homeTeam.name;
  const away = row.fixture.awayTeam.shortName ?? row.fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueToSlug(row.fixture.leagueName)}/${matchSlug(home, away)}`;
}

export async function buildPredictionMarketMetadata(
  rawDate: string,
  market: PredictionMarket,
): Promise<Metadata> {
  const dateKey = normalizeDateKey(rawDate);
  const shortDate = shortDateLabel(dateKey);
  const context = dateContextLabel(dateKey);
  const marketBlock = MARKET_TEXT[market];
  const contextLabel = context === "today" ? "today" : context === "tomorrow" ? "tomorrow" : shortDate;
  const canonical = `${BASE_URL}/predictions/${dateKey}/${market}`;
  const title = `${marketBlock.metaTitlePrefix} ${contextLabel} (${shortDate}) | statsBuildr`;
  const description = toSnippetDescription([
    context === "today"
      ? `${marketBlock.title} for today's fixtures (${shortDate}). ${marketBlock.keyLine}`
      : context === "tomorrow"
        ? `${marketBlock.title} for tomorrow (${shortDate}). ${marketBlock.keyLine}`
        : `${marketBlock.title} for ${shortDate}. ${marketBlock.keyLine}`,
    "Last-10 warmed data on statsBuildr — confidence ratings and line likelihoods.",
  ]);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    keywords: [...marketBlock.keywords, shortDate, "statsBuildr predictions"],
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      images: [
        {
          url: `${BASE_URL}/stats-buildr.png`,
          width: 512,
          height: 160,
          alt: `${marketBlock.title} ${shortDate} | statsBuildr`,
        },
      ],
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

export async function PredictionMarketPage({
  rawDate,
  market,
}: {
  rawDate: string;
  market: PredictionMarket;
}) {
  const dateKey = normalizeDateKey(rawDate);
  const data = await getDateMarketPredictions(dateKey, market);
  const marketText = MARKET_TEXT[market];
  const context = dateContextLabel(dateKey);
  const today = todayDateKey();
  const tomorrow = tomorrowDateKey();
  const shortDate = shortDateLabel(dateKey);
  const hubUrl = `${BASE_URL}/predictions/${dateKey}`;
  const canonical = `${BASE_URL}/predictions/${dateKey}/${market}`;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${marketText.title} ${shortDate}`,
    description: toSnippetDescription([marketText.keyLine, ...marketText.intro]),
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
        item: hubUrl,
      },
      { "@type": "ListItem", position: 4, name: marketText.title, item: canonical },
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
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{data.displayDate}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-[1.65rem]">
          {context === "today"
            ? `Today's ${marketText.title.toLowerCase()}`
            : context === "tomorrow"
              ? `Tomorrow's ${marketText.title.toLowerCase()}`
              : `${marketText.title} (${shortDate})`}
        </h1>
        <p className="mt-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">{marketText.keyLine}</p>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {marketText.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap gap-2">
        <NavLinkWithOverlay href={`/predictions/${today}`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Today</NavLinkWithOverlay>
        <NavLinkWithOverlay href={`/predictions/${tomorrow}`} className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-violet-500 dark:hover:text-violet-300">Tomorrow</NavLinkWithOverlay>
      </nav>

      <div className="mt-6">
        <TopPicksSection
          title={`Top ${marketText.title}`}
          rows={data.rows}
          market={market}
          matchHref={(row) => matchHref(dateKey, row)}
        />
        <MatchList rows={data.rows} market={market} matchHref={(row) => matchHref(dateKey, row)} />
      </div>
    </main>
  );
}
