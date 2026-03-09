import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LEAGUE_DISPLAY_NAMES,
  STANDINGS_LEAGUE_SLUG_BY_ID,
  standingsSlugToLeagueId,
} from "@/lib/leagues";
import { getLeagueStatsHubData } from "@/lib/leagueStatsService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { LeagueStatsTable } from "./league-stats-table";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

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
    return { title: "League stats not found | statsBuildr" };
  }

  const seasonString = getCurrentSeasonString();
  const title = `${leagueName} stats ${seasonString} | Goals, xG, corners & cards per 90 | statsBuildr`;
  const description = `Team stats for the ${leagueName} ${seasonString} season: goals for and against per 90, corners per match and cards per match. Use these league stats for bet builder research.`;
  const canonical = `${BASE_URL}/leagues/${slug}/stats`;

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
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function LeagueStatsPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);

  if (leagueId === undefined) {
    notFound();
  }

  const data = await getLeagueStatsHubData(leagueId);
  if (!data) {
    notFound();
  }

  const leagueName = data.leagueName;
  const season = data.season;
  const slugById = STANDINGS_LEAGUE_SLUG_BY_ID;

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/leagues/all", label: "Leagues" },
    { href: `/leagues/${slugById[leagueId]}/standings`, label: `${leagueName} table` },
    { href: `/leagues/${slugById[leagueId]}/stats`, label: `${leagueName} stats` },
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

  const itemListJsonLd =
    data.teams.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${leagueName} stats ${season}`,
          description: `Per 90 stats for ${leagueName}: goals for and against, corners and cards per match.`,
          numberOfItems: data.teams.length,
          itemListElement: data.teams.map((row, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: row.shortName ?? row.name,
          })),
        }
      : null;

  const seasonString = getCurrentSeasonString();
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${leagueName} stats ${seasonString} | Goals, corners & cards per 90`,
    description: `Team stats for the ${leagueName} ${seasonString} season: goals for and against per 90, corners per match and cards per match. Use these league stats for bet builder research.`,
    url: `${BASE_URL}/leagues/${slugById[leagueId]}/stats`,
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                League stats · {season}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                {leagueName} stats – goals, corners &amp; cards per 90
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                See how every team in the {leagueName} performs for goals scored and conceded per 90,
                corners per match and cards per match. Use these league-wide stats to spot trends for
                bet builders.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 sm:items-end">
              <NavLinkWithOverlay
                href={`/leagues/${slugById[leagueId]}/standings`}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
                message="Loading league table…"
              >
                View league table
              </NavLinkWithOverlay>
            </div>
          </div>
          {data.updatedAt ? (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Stats last updated{" "}
              {data.updatedAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </p>
          ) : null}
        </header>

        {data.teams.length === 0 ? (
          <section
            className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
            aria-label="No stats"
          >
            <p>
              We don&apos;t have season stats for teams in this league yet. Once league stats have been
              warmed, this page will show goals, corners and cards per 90 for every team.
            </p>
          </section>
        ) : (
          <section
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
            aria-label={`${leagueName} team stats`}
          >
            <LeagueStatsTable teams={data.teams} leagueName={leagueName} />
          </section>
        )}
      </main>
    </div>
  );
}

