import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { ShareUrlButton } from "@/app/_components/share-url-button";
import { standingsSlugToLeagueId, LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { getLeagueTotalGoalsMarketData } from "@/lib/leagueMarketsService";
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
    return { title: "League total goals stats not found | statsBuildr" };
  }

  const title = buildIntentTitle({
    intent: "Total goals stats",
    subject: leagueName,
    timeframe: "this season",
    keyStat: "Over 2.5, 3.5 & 4.5",
  });
  const description = toSnippetDescription([
    `Total goals stats for ${leagueName}.`,
    "Track over 2.5, 3.5 and 4.5 rates, team over-2.5 records and recent high-scoring results.",
    "Useful for over/under and bet builder picks.",
  ]);
  const canonical = `${BASE_URL}/leagues/${slug}/markets/total-goals`;

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

export default async function LeagueTotalGoalsPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);
  if (leagueId === undefined) notFound();

  const [data, crestUrl] = await Promise.all([
    getLeagueTotalGoalsMarketData(leagueId),
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
    { href: `/leagues/${leagueSlug}/markets/total-goals`, label: "Total goals stats" },
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
        name: `What are ${leagueName} total goals stats?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Total goals stats for ${leagueName} show how often league matches finish over popular lines like over 2.5, over 3.5 and over 4.5 goals. You can also see which teams are involved in the highest-scoring matches.`,
        },
      },
      {
        "@type": "Question",
        name: `How can I use ${leagueName} total goals stats for betting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Use the league-wide over 2.5, 3.5 and 4.5 goal rates and team over 2.5 rankings to spot fixtures that regularly produce high goal counts. Combine this with odds and team pages on statsBuildr when building over/under and bet builder selections.`,
        },
      },
    ],
  };

  const itemListJsonLd =
    data.teams.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${leagueName} over 2.5 team stats ${season}`,
          description: `Team over 2.5 goals percentages for ${leagueName} in the ${season} season.`,
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
    name: `${leagueName} total goals stats ${season} | Over 2.5, 3.5, 4.5`,
    description: `League-wide total goals trends for ${leagueName}: over 2.5, over 3.5 and over 4.5 goal rates, team over 2.5 percentages and recent high-scoring results for ${season}.`,
    url: `${BASE_URL}/leagues/${leagueSlug}/markets/total-goals`,
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
                  {leagueName} total goals stats
                </h1>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  League-wide total goals trends for {leagueName}: over 2.5, over 3.5 and over 4.5 goal rates, team over 2.5 percentages and recent high-scoring results.
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            League over 2.5, 3.5 and 4.5 this season
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            How often {leagueName} matches we&apos;ve tracked for {season} finished over each <strong>combined total goals</strong> line (goals for both teams together).
          </p>
          {data.totalMatches === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              We don&apos;t have total goals data for this league yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 2.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over25Pct != null ? `${data.over25Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over25} of {data.totalMatches} matches
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 3.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over35Pct != null ? `${data.over35Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over35} of {data.totalMatches} matches
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Over 4.5 goals</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                  {data.over45Pct != null ? `${data.over45Pct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
                  {data.over45} of {data.totalMatches} matches
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Team over 2.5 goals percentages
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Percentage of league matches where each team&apos;s games finished over 2.5 <strong>combined goals</strong> (home + away). Sorted by highest over 2.5 rate.
          </p>
          {data.teams.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              We don&apos;t have team total goals data for this league yet.
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
                      Over 2.5 %
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Over 2.5 (games)
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
                        {team.over25Pct != null ? `${team.over25Pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                        {team.over25} of {team.matches}
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
            Recent high-scoring results in {leagueName}
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Recent league matches with total goals (home + away) and whether they cleared the over 2.5 line.
          </p>
          {data.recentFixtures.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-500">
              No recent league fixtures with total goals data yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.recentFixtures.map((f) => (
                <li
                  key={f.apiFixtureId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-800/50"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {f.homeTeamName} vs {f.awayTeamName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(f.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-50">
                      {f.homeGoals}–{f.awayGoals}
                    </span>
                    <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      {f.totalGoals} goals
                    </span>
                    {f.over25 ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        Over 2.5
                      </span>
                    ) : (
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700/60 dark:text-neutral-200">
                        Under 2.5
                      </span>
                    )}
                    {f.totalGoals > 3.5 && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        Over 3.5
                      </span>
                    )}
                    {f.totalGoals > 4.5 && (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/50 dark:text-rose-200">
                        Over 4.5
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.teams.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Top 5 over 2.5 teams in {leagueName}
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Teams with the highest share of league matches finishing over 2.5 goals this season.
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
                      {team.over25Pct != null ? `${team.over25Pct.toFixed(1)}%` : "—"}
                    </p>
                    <p className="tabular-nums">
                      {team.over25} of {team.matches} games
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 flex justify-center">
          <ShareUrlButton
            title={`${leagueName} total goals stats ${season} | statsBuildr`}
            text={`${leagueName} total goals stats for the ${season} season: over 2.5, 3.5 and 4.5 goal rates, team over 2.5 percentages and recent high-scoring results on statsBuildr.`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          />
        </div>
      </main>
    </div>
  );
}

