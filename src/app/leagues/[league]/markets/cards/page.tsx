import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { standingsSlugToLeagueId, LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { getLeagueCardsMarketData } from "@/lib/leagueMarketsService";
import { getLeagueCrestUrl } from "@/lib/crestsService";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

type Props = { params: Promise<{ league: string }> };

function normalizeSlug(slug: string | undefined): string {
  if (!slug || typeof slug !== "string") return "";
  return slug.trim().toLowerCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  const leagueName = leagueId != null ? LEAGUE_DISPLAY_NAMES[leagueId] : null;
  if (!leagueName) {
    return { title: "League team cards stats not found | statsBuildr" };
  }

  const title = buildIntentTitle({
    intent: "Team cards stats",
    subject: leagueName,
    timeframe: "this season",
    keyStat: "Over 1.5, 2.5 & 3.5",
  });
  const description = toSnippetDescription([
    `Team cards stats for ${leagueName}.`,
    "See over 1.5, 2.5 and 3.5 team-cards rates plus recent high booking results.",
    "Useful for cards and bet builder picks.",
  ]);
  const canonical = `${BASE_URL}/leagues/${slug}/markets/cards`;

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

export default async function LeagueCardsPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  if (leagueId === undefined) notFound();

  const [data, crestUrl] = await Promise.all([
    getLeagueCardsMarketData(leagueId),
    getLeagueCrestUrl(leagueId),
  ]);
  if (!data) notFound();

  const leagueName = data.leagueName;
  const season = data.season;
  const slugById = STANDINGS_LEAGUE_SLUG_BY_ID;
  const leagueSlug = slugById[leagueId];

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/leagues/all", label: "Leagues" },
    { href: `/leagues/${leagueSlug}/standings`, label: `${leagueName} table` },
    { href: `/leagues/${leagueSlug}/markets/cards`, label: "Team cards stats" },
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
        name: `What are ${leagueName} team cards stats?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Team cards stats for ${leagueName} show how often each team receives over markets like 1.5, 2.5 and 3.5 cards in league matches. You can also see which sides are booked most frequently.`,
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${leagueName} team cards stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Use the league-wide over 1.5, 2.5 and 3.5 team cards rates and team rankings to find aggressive or foul-prone sides. Combine this with fixture odds and team pages on statsBuildr when building team cards legs in your bet builder.`,
        },
      },
    ],
  };

  const itemListJsonLd =
    data.teams.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${leagueName} team cards stats ${season}`,
          description: `Team over 1.5 cards percentages for ${leagueName} in the ${season} season.`,
          numberOfItems: data.teams.length,
          itemListElement: data.teams.map((team, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: team.shortName ?? team.name,
          })),
        }
      : null;

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${leagueName} team cards stats ${season} | Over 1.5, 2.5, 3.5`,
    description: `League-wide team cards trends for ${leagueName}: over 1.5, 2.5 and 3.5 team cards rates, team rankings and recent high card-count performances for ${season}.`,
    url: `${BASE_URL}/leagues/${leagueSlug}/markets/cards`,
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              {crestUrl ? (
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-12 sm:w-12"
                  aria-hidden
                >
                  <img
                    src={crestUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {season} season
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                  {leagueName} team cards stats
                </h1>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  League-wide team cards trends for {leagueName}: over 1.5, 2.5 and 3.5 team cards rates, team rankings and recent high card-count performances.
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            League over 1.5, 2.5 and 3.5 team cards this season
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            How often <strong>individual team cards</strong> lines of 1.5, 2.5 and 3.5 have landed across {leagueName} team-games we&apos;ve tracked in {season}
            (each row is cards <strong>for one team</strong> in a match, not both sides combined).
          </p>
          {data.totalRows === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              We don&apos;t have team cards data for this league yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 1.5 team cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over15Pct != null ? `${data.over15Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over15} of {data.totalRows} team-games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 2.5 team cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over25Pct != null ? `${data.over25Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over25} of {data.totalRows} team-games
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 3.5 team cards</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over35Pct != null ? `${data.over35Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over35} of {data.totalRows} team-games
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Team over 1.5 cards percentages
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Percentage of league matches where each team&apos;s <strong>own cards total</strong> went over 1.5. Sorted by highest over 1.5 rate.
          </p>
          {data.teams.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              We don&apos;t have team cards data for this league yet.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900/60">
              <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
                <thead className="bg-neutral-100/70 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">
                      Team
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Over 1.5 %
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Over 1.5 (team-games)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900/40">
                  {data.teams.map((team) => (
                    <tr key={team.teamId} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/60">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {team.crestUrl ? (
                            <img
                              src={team.crestUrl}
                              alt=""
                              width={20}
                              height={20}
                              className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                              aria-hidden
                            />
                          ) : null}
                          <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            {team.shortName ?? team.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {team.over15Pct != null ? `${team.over15Pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                        {team.over15} of {team.matches}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Recent high team cards performances in {leagueName}
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Recent league team-games where a single team received notable numbers of cards (cards for that team only, not both sides).
          </p>
          {data.recentRows.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              No recent league fixtures with team cards data yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentRows.map((r) => (
                <li
                  key={`${r.apiFixtureId}-${r.teamName}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {r.teamName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(r.date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      {r.cards} cards
                    </span>
                    {r.cards >= 2 ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        2+ cards
                      </span>
                    ) : null}
                    {r.cards >= 3 ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-100">
                        3+ cards
                      </span>
                    ) : null}
                    {r.cards >= 4 ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-100">
                        4+ cards
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.teams.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Top 5 over 1.5 cards teams in {leagueName}
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Teams with the highest share of league matches where their team cards went over 1.5 this season.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {data.teams.slice(0, 5).map((team, index) => (
                <li
                  key={team.teamId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {team.shortName ?? team.name}
                    </span>
                  </div>
                  <div className="text-right text-xs text-neutral-600 dark:text-neutral-400">
                    <p className="tabular-nums text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {team.over15Pct != null ? `${team.over15Pct.toFixed(1)}%` : "—"}
                    </p>
                    <p className="tabular-nums">
                      {team.over15} of {team.matches} team-games
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex justify-center">
          <ShareUrlButton
            title={`${leagueName} team cards stats ${season} | statsBuildr`}
            text={`${leagueName} team cards stats for the ${season} season: over 1.5, 2.5 and 3.5 team cards rates, team rankings and recent high card-count performances on statsBuildr.`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          />
        </div>
      </main>
    </div>
  );
}

