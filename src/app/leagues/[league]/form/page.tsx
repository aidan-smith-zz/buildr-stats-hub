import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LEAGUE_DISPLAY_NAMES,
  STANDINGS_LEAGUE_SLUG_BY_ID,
  standingsSlugToLeagueId,
} from "@/lib/leagues";
import { getLeagueCrestUrl } from "@/lib/crestsService";
import { getCachedLeagueFormPageData } from "@/lib/leagueFormService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import { LeagueFormTableClient } from "./league-form-table-client";
import { LeagueFormSpotlight } from "./league-form-spotlight";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

/** Align page ISR with `getCachedLeagueFormPageData` (24h). */
export const revalidate = 60 * 60 * 24;

type Props = { params: Promise<{ league: string }> };

function normalizeSlug(slug: string | undefined): string {
  if (!slug || typeof slug !== "string") return "";
  return slug.trim().toLowerCase();
}

function getCurrentSeasonString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 6) return `${year}/${String(year + 1).slice(-2)}`;
  return `${year - 1}/${String(year).slice(-2)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  const leagueName = leagueId != null ? LEAGUE_DISPLAY_NAMES[leagueId] : null;
  if (!leagueName) {
    return { title: "League form table not found | statsBuildr", robots: { index: false, follow: false } };
  }

  const season = getCurrentSeasonString();
  const monthYear = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const title = buildIntentTitle({
    intent: `${leagueName} form table`,
    timeframe: `${season} · ${monthYear}`,
    keyStat: "last 5 & last 10 — goals, corners & cards",
  });
  const description = toSnippetDescription([
    `${leagueName} form table: last 5 and last 10 league games.`,
    "Sortable team stats — goals for and against, corners and cards per 90.",
    "See who is in form and who is struggling before you build accas and bet builders.",
  ]);

  const canonical = `${BASE_URL}/leagues/${slug}/form`;

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
      locale: "en_GB",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LeagueFormPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  if (leagueId === undefined) notFound();

  const [data, crestUrl] = await Promise.all([
    getCachedLeagueFormPageData(leagueId),
    getLeagueCrestUrl(leagueId),
  ]);
  if (!data) notFound();

  const leagueName = data.leagueName;
  const season = data.season;
  const leagueSlug = STANDINGS_LEAGUE_SLUG_BY_ID[leagueId];
  const canonicalPath = `/leagues/${leagueSlug}/form`;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/leagues/all", label: "Leagues" },
    { href: `/leagues/${leagueSlug}/standings`, label: `${leagueName} table` },
    { href: canonicalPath, label: "Form table" },
  ];

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
        name: `What is the ${leagueName} form table?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The ${leagueName} form table ranks every team by recent league performance using the last five and last ten completed matches. You can compare goals for and against, corners and cards on a per-90 basis, and switch between home, away or combined samples.`,
        },
      },
      {
        "@type": "Question",
        name: "How is “in form” calculated?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Spotlight boxes rank teams by league points (three for a win, one for a draw) and goal difference from the same last-five or last-ten match sample. Teams need at least three completed games in that window.",
        },
      },
      {
        "@type": "Question",
        name: `How often is the ${leagueName} form table updated?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: "Numbers update as new league results are played. This page refreshes regularly so you see current form.",
        },
      },
    ],
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${leagueName} form table ${season}`,
    description: `Last 5 and last 10 form for ${leagueName}: goals, corners and cards per 90, with in-form and struggling team spotlights.`,
    url: `${BASE_URL}${canonicalPath}`,
  };

  const updatedLabel = data.updatedAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              {crestUrl ? (
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-12 sm:w-12"
                  aria-hidden
                >
                  <img src={crestUrl} alt="" width={40} height={40} className="h-full w-full object-contain" />
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {season} · Form analysis
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                  {leagueName} form table
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Last 5 and last 10 league games: compare goals, corners and cards per 90, sort any column, and see which
                  sides are flying — and which need a result — as the season unfolds.
                </p>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">Standings data refreshed {updatedLabel}</p>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2 sm:pt-1">
              <ShareUrlButton className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700" />
            </div>
          </div>
        </header>

        <LeagueFormSpotlight
          leagueName={leagueName}
          hotLast5={data.hotLast5}
          coldLast5={data.coldLast5}
          hotLast10={data.hotLast10}
          coldLast10={data.coldLast10}
        />

        <section className="mb-8" aria-labelledby="form-table-heading">
          <h2 id="form-table-heading" className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-50 sm:text-lg">
            Full league form table
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Toggle last five or last ten games and sort by the metric you care about for bet builders and acca research.
          </p>
          <LeagueFormTableClient last5={data.last5} last10={data.last10} />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">More {leagueName} hubs</h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Cross-link to standings, season stats and league betting markets.
          </p>
          <nav className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2" aria-label="League pages">
            <Link
              href={`/leagues/${leagueSlug}/standings`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              League table &amp; standings
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/stats`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Season stats hub
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/markets/btts`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              BTTS markets
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/markets/total-goals`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Total goals
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/markets/corners`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Corners
            </Link>
            <Link
              href={`/leagues/${leagueSlug}/markets/cards`}
              className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
            >
              Cards
            </Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
