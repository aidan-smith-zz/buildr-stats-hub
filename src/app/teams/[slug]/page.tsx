import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTeamIdBySlug, getTeamIdentityById, getTeamPageData, type TeamPageData } from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { getOrRefreshStandings, type StandingsData } from "@/lib/standingsService";
import { makeTeamSlug, normalizeTeamSlug } from "@/lib/teamSlugs";
import { buildIntentTitle, toSnippetDescription } from "@/lib/seoMetadata";
import { TeamPlayersTable } from "./TeamPlayersTable";

type RouteParams = {
  params: Promise<{
    slug: string;
  }>;
};

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

/** ISR: repeat crawler hits serve from CDN; data layer uses unstable_cache as well. */
export const revalidate = 3600;

function leagueSlugForName(name: string): string | null {
  for (const [id, displayName] of Object.entries(LEAGUE_DISPLAY_NAMES)) {
    if (displayName === name) {
      const slug = STANDINGS_LEAGUE_SLUG_BY_ID[Number(id)];
      return slug ?? null;
    }
  }
  return null;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) {
    return {
      title: "Team not found",
      robots: { index: false, follow: false },
    };
  }

  const data = await getTeamPageData(teamId);
  if (!data) {
    return {
      title: "Team not found",
      robots: { index: false, follow: false },
    };
  }

  const displayName = data.shortName ?? data.name;
  const canonical = `${BASE_URL}/teams/${makeTeamSlug(displayName)}`;
  const title = buildIntentTitle({
    intent: `${displayName} stats & form`,
    timeframe: `${data.leagueName} ${data.season}`,
    keyStat: "goals, xG, corners & cards per 90",
  });
  const description = toSnippetDescription([
    `${displayName} stats and recent form in ${data.leagueName} ${data.season}.`,
    "Per-90 goals, xG, corners and cards, plus results and key player numbers for bet builders.",
  ]);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function TeamPage({ params }: RouteParams) {
  const { slug } = await params;
  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) notFound();

  const identity = await getTeamIdentityById(teamId);
  if (!identity) notFound();
  const normalizedSlug = normalizeTeamSlug(slug);
  const canonicalSlug = makeTeamSlug(identity.shortName ?? identity.name);
  if (normalizedSlug !== canonicalSlug) {
    permanentRedirect(`/teams/${canonicalSlug}`);
  }

  const data = await getTeamPageData(teamId);
  if (!data) notFound();

  // Map league name back to leagueId for standings (only for known leagues).
  const leagueIdEntry = Object.entries(LEAGUE_DISPLAY_NAMES).find(
    ([, name]) => name === data.leagueName,
  );
  const leagueId = leagueIdEntry ? Number(leagueIdEntry[0]) : undefined;
  const standings: StandingsData | null =
    leagueId !== undefined ? await getOrRefreshStandings(leagueId) : null;

  return <TeamPageView data={data} slug={canonicalSlug} standings={standings} />;
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

function TeamPageView({
  data,
  slug,
  standings,
}: {
  data: TeamPageData;
  slug: string;
  standings: StandingsData | null;
}) {
  const displayName = data.shortName ?? data.name;
  const per90 = data.per90;
  const leagueSlug = leagueSlugForName(data.leagueName);

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    leagueSlug
      ? { href: `/leagues/${leagueSlug}/standings`, label: `${data.leagueName} table` }
      : null,
    { href: `/teams/${slug}`, label: displayName },
  ].filter(Boolean) as { href: string; label: string }[];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com"}${item.href}`,
    })),
  };

  const faqEntitiesTeam = [
    {
      "@type": "Question" as const,
      name: `What stats can I see for ${displayName}?`,
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: `${displayName}'s page shows ${data.leagueName} ${data.season} stats: goals, conceded, corners and cards per 90, recent results and key player numbers. Use these for bet builder and form analysis.`,
      },
    },
    {
      "@type": "Question" as const,
      name: "Where does this team's data come from?",
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: "Stats are based on matches we track in the supported competitions. Season and per-90 numbers update as new fixtures are played and warmed on statsBuildr.",
      },
    },
    {
      "@type": "Question" as const,
      name: "How can I use this for bet builders?",
      acceptedAnswer: {
        "@type": "Answer" as const,
        text: "Use the per-90 team and player stats together with the recent results and league table to spot trends for goals, corners, cards and shots markets before placing bet builder selections.",
      },
    },
  ];
  const faqJsonLdTeam = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntitiesTeam,
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLdTeam) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-3" />
        <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex items-center gap-3">
            {data.crestUrl ? (
              <img
                src={data.crestUrl}
                alt={displayName}
                width={40}
                height={40}
                className="h-10 w-10 flex-shrink-0 object-contain"
              />
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {data.leagueName} · {data.season}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                {displayName} stats &amp; form
              </h1>
            </div>
          </div>
          {per90 && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-300 sm:grid-cols-4 sm:text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Goals scored
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-50">
                  {per90.goalsPer90.toFixed(2)} <span className="font-normal text-neutral-500 dark:text-neutral-400">per 90</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Goals conceded
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-50">
                  {per90.concededPer90.toFixed(2)} <span className="font-normal text-neutral-500 dark:text-neutral-400">per 90</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Corners won
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-50">
                  {per90.cornersPer90.toFixed(2)} <span className="font-normal text-neutral-500 dark:text-neutral-400">per 90</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Cards
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900 dark:text-neutral-50">
                  {per90.cardsPer90.toFixed(2)} <span className="font-normal text-neutral-500 dark:text-neutral-400">per 90</span>
                </p>
              </div>
            </div>
          )}
        </header>

        {data.homeAwayProfile ? (
          <section className="mt-6 mb-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 text-xs dark:border-neutral-700 dark:bg-neutral-900/70 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300 sm:text-xs">
                  Home vs away profile
                </h2>
                <p className="text-[0.7rem] text-neutral-600 dark:text-neutral-400 sm:text-xs">
                  {data.leagueName} {data.season}: average per match at home and away.
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 sm:mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {data.crestUrl ? (
                      <img
                        src={data.crestUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                        aria-hidden
                      />
                    ) : null}
                    <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                      {displayName} at home
                    </p>
                  </div>
                  <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                    {data.homeAwayProfile.homeGames} home match{data.homeAwayProfile.homeGames === 1 ? "" : "es"} this season
                  </p>
                </div>
                <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Goals
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.homeGoalsPerMatch.toFixed(2)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Corners
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.homeCornersPerMatch.toFixed(2)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Cards
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.homeCardsPerMatch.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-dotted border-neutral-200 pt-2.5 dark:border-neutral-700">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {data.crestUrl ? (
                      <img
                        src={data.crestUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900"
                        aria-hidden
                      />
                    ) : null}
                    <p className="truncate text-[0.7rem] font-medium text-neutral-800 dark:text-neutral-100 sm:text-xs">
                      {displayName} away from home
                    </p>
                  </div>
                  <p className="text-[0.7rem] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                    {data.homeAwayProfile.awayGames} away match{data.homeAwayProfile.awayGames === 1 ? "" : "es"} this season
                  </p>
                </div>
                <dl className="flex flex-1 justify-end gap-4 sm:gap-6">
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Goals
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.awayGoalsPerMatch.toFixed(2)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Corners
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.awayCornersPerMatch.toFixed(2)}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[0.65rem] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      Cards
                    </dt>
                    <dd className="tabular-nums text-[0.8rem] font-semibold text-neutral-900 dark:text-neutral-50">
                      {data.homeAwayProfile.awayCardsPerMatch.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
            Team markets for bet builders
          </h2>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Deep-dive into {displayName}&apos;s stats for popular bet builder markets using last games from this season.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/teams/${slug}/markets/btts`}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-800 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/40"
            >
              BTTS (Both teams to score)
            </a>
            <a
              href={`/teams/${slug}/markets/total-goals`}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-800 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/40"
            >
              Total goals (over X.5)
            </a>
            <a
              href={`/teams/${slug}/markets/corners`}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-800 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/40"
            >
              Team corners
            </a>
            <a
              href={`/teams/${slug}/markets/cards`}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-800 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/40"
            >
              Team cards
            </a>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Recent results
            </h2>
            {data.recentFixtures.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                We don&apos;t have recent fixtures for this team yet in the tracked competitions.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                {data.recentFixtures.map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {f.isHome ? `${displayName} vs ${f.opponentName}` : `${f.opponentName} vs ${displayName}`}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatDate(f.date)}
                        {f.league ? ` · ${f.league}` : null}
                      </p>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {f.homeGoals != null && f.awayGoals != null ? (
                        <>
                          {f.homeGoals}
                          <span className="mx-0.5 text-neutral-400 dark:text-neutral-500">–</span>
                          {f.awayGoals}
                        </>
                      ) : (
                        <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                          {f.statusShort ?? "—"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Key players this season
            </h2>
            {data.keyPlayers.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                We don&apos;t have player stats for this team yet in the tracked competitions.
              </p>
            ) : (
              <TeamPlayersTable players={data.keyPlayers} />
            )}
          </section>
        </div>

        {standings?.tables?.length ? (
          <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              {data.leagueName} league table
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
              Current {data.leagueName} standings for the {standings.season} season.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-xs text-neutral-700 dark:text-neutral-300 sm:text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/80 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                    <th className="py-2 pl-2 pr-1 text-left">#</th>
                    <th className="py-2 px-2 text-left">Team</th>
                    <th className="py-2 px-2 text-center">P</th>
                    <th className="py-2 px-2 text-center">Pts</th>
                    <th className="py-2 px-2 text-center">GD</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.tables[0]?.rows.map((row) => {
                    const normalizedTeamName = displayName.toLowerCase().trim();
                    const isThisTeam =
                      (data.teamApiId != null && String(row.teamId) === data.teamApiId) ||
                      row.teamName.toLowerCase().trim() === normalizedTeamName;
                    return (
                      <tr
                        key={row.teamId}
                        className={`border-b border-neutral-100 dark:border-neutral-800 ${
                          isThisTeam
                            ? "bg-violet-50/80 font-semibold text-neutral-900 dark:bg-violet-950/40 dark:text-neutral-50"
                            : "bg-white text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                        }`}
                      >
                        <td className="py-2 pl-2 pr-1 text-left tabular-nums">{row.rank}</td>
                        <td className="py-2 px-2 text-left">
                          <span className="truncate">{row.teamName}</span>
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.played}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.points}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.goalsDiff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section
          className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          aria-label="Frequently asked questions"
        >
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            Frequently asked questions about {displayName}
          </h2>
          <dl className="mt-3 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                What stats can I see for {displayName}?
              </dt>
              <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                {displayName}&apos;s page shows {data.leagueName} {data.season} stats: goals, conceded, corners and cards per 90, recent results and key player numbers. Use these for bet builder and form analysis.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                Where does this team&apos;s data come from?
              </dt>
              <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                Stats are based on matches we track in the supported competitions. Season and per-90 numbers update as new fixtures are played and warmed on statsBuildr.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-800 dark:text-neutral-200">
                How can I use this for bet builders?
              </dt>
              <dd className="mt-1 leading-snug text-neutral-600 dark:text-neutral-400">
                Use the per-90 team and player stats together with the recent results and league table to spot trends for goals, corners, cards and shots markets before placing bet builder selections.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}

