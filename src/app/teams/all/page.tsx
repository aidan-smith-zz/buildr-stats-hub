import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import {
  LEAGUE_DISPLAY_NAMES,
  LEAGUE_GROUP_ORDER,
} from "@/lib/leagues";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { makeTeamSlug } from "@/lib/teamSlugs";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

/** Leagues we create dedicated team pages for (must stay in sync with teamPageService / sitemap). */
const TOP_TEAM_LEAGUE_IDS = [39, 40, 179, 2, 3] as const;

export type TeamAllEntry = {
  id: number;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  slug: string;
  hasPage: boolean;
};

export type TeamsByLeague = {
  leagueId: number;
  leagueName: string;
  teams: TeamAllEntry[];
};

const getTeamsAllPageData = unstable_cache(
  async () => {
    const [teams, seasonRows] = await Promise.all([
      prisma.team.findMany({
        select: { id: true, name: true, shortName: true, crestUrl: true },
        orderBy: { name: "asc" },
      }),
      prisma.teamSeasonStats.findMany({
        where: { season: API_SEASON },
        select: { teamId: true, leagueId: true },
      }),
    ]);

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const teamIdsWithPage = new Set(
      seasonRows
        .filter(
          (r) =>
            r.leagueId != null &&
            (TOP_TEAM_LEAGUE_IDS as readonly number[]).includes(r.leagueId),
        )
        .map((r) => r.teamId),
    );

    const teamsByLeagueId = new Map<number, typeof teams>();
    for (const row of seasonRows) {
      const leagueId = row.leagueId ?? 0;
      if (!teamsByLeagueId.has(leagueId)) {
        teamsByLeagueId.set(leagueId, []);
      }
      const team = teamById.get(row.teamId);
      if (team && !teamsByLeagueId.get(leagueId)!.some((t) => t.id === team.id)) {
        teamsByLeagueId.get(leagueId)!.push(team);
      }
    }

    const teamIdsInAnyLeague = new Set(seasonRows.map((r) => r.teamId));
    const otherTeams = teams.filter((t) => !teamIdsInAnyLeague.has(t.id));

    const toEntry = (t: { id: number; name: string; shortName: string | null; crestUrl: string | null }): TeamAllEntry => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      crestUrl: t.crestUrl,
      slug: makeTeamSlug(t.shortName ?? t.name),
      hasPage: teamIdsWithPage.has(t.id),
    });

    const groups: TeamsByLeague[] = [];

    for (const leagueId of LEAGUE_GROUP_ORDER) {
      const list = teamsByLeagueId.get(leagueId) ?? [];
      if (list.length === 0) continue;
      const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? `League ${leagueId}`;
      const entries = list
        .map(toEntry)
        .sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name));
      groups.push({ leagueId, leagueName, teams: entries });
    }

    if (otherTeams.length > 0) {
      groups.push({
        leagueId: 0,
        leagueName: "Other teams",
        teams: otherTeams
          .map(toEntry)
          .sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name)),
      });
    }

    return { groups };
  },
  ["teams-all-page-data"],
  { revalidate: 60 * 60 * 12 },
);

export const metadata: Metadata = {
  title: "Football teams | Premier League, Championship & more | statsBuildr",
  description:
    "Browse all football teams: Premier League, Championship, Scottish Premiership, League One, League Two, Champions League and Europa League. Team stats, form and fixtures.",
  alternates: { canonical: `${BASE_URL}/teams/all` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Football teams | Premier League, Championship & more | statsBuildr",
    description:
      "Browse all football teams across Premier League, Championship, Scottish Premiership and more. Team stats, form and fixtures.",
    url: `${BASE_URL}/teams/all`,
    siteName: "statsBuildr",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Football teams | Premier League, Championship & more | statsBuildr",
    description:
      "Browse all football teams. Team stats, form and fixtures for bet builders.",
  },
};

export default async function TeamsAllPage() {
  const { groups } = await getTeamsAllPageData();
  const totalTeams = groups.reduce((acc, g) => acc + g.teams.length, 0);

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/teams/all", label: "Teams" },
  ];

  const teamsWithPages = groups.flatMap((g) => g.teams.filter((t) => t.hasPage));
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Football teams",
    description: "All football teams in supported competitions.",
    numberOfItems: teamsWithPages.length,
    itemListElement: teamsWithPages.map((t, index) => ({
      "@type": "ListItem" as const,
      position: index + 1,
      name: t.shortName ?? t.name,
      url: `${BASE_URL}/teams/${t.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-8 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Team stats & form
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                All teams
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Browse teams by competition. Teams with a dedicated page have full season stats, key players and recent results.
              </p>
            </div>
            <span className="mt-2 inline-flex flex-shrink-0 items-center rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900 sm:mt-0">
              {totalTeams} teams
            </span>
          </div>
        </header>

        <section className="space-y-8" aria-label="Teams by league">
          <h2 className="sr-only">Teams by competition</h2>
          {groups.map(({ leagueId, leagueName, teams }) => (
            <div key={leagueId}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {leagueName}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {teams.map((team) => {
                  const displayName = team.shortName ?? team.name;
                  const tileBaseClass =
                    "flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6";
                  const tileHoverClass =
                    "transition-all hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700 dark:hover:shadow-neutral-800/50";

                  if (team.hasPage) {
                    return (
                      <div
                        key={team.id}
                        className={`${tileBaseClass} ${tileHoverClass}`}
                      >
                        <NavLinkWithOverlay
                          href={`/teams/${team.slug}`}
                          className="group flex flex-col"
                          message="Loading team…"
                        >
                          <div className="flex items-center gap-3">
                            {team.crestUrl ? (
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-11 sm:w-11"
                                aria-hidden
                              >
                                <img
                                  src={team.crestUrl}
                                  alt=""
                                  width={40}
                                  height={40}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            ) : (
                              <span
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 sm:h-11 sm:w-11"
                                aria-hidden
                              >
                                {displayName.slice(0, 1)}
                              </span>
                            )}
                            <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                              {displayName}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400">
                            View stats
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </NavLinkWithOverlay>
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
                          <Link
                            href={`/teams/${team.slug}/markets/btts`}
                            className="font-medium text-neutral-600 hover:text-violet-600 dark:text-neutral-400 dark:hover:text-violet-400"
                          >
                            BTTS
                          </Link>
                          <Link
                            href={`/teams/${team.slug}/markets/total-goals`}
                            className="font-medium text-neutral-600 hover:text-violet-600 dark:text-neutral-400 dark:hover:text-violet-400"
                          >
                            Total goals
                          </Link>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={team.id}
                      className={tileBaseClass}
                      aria-label={`${displayName} (team page coming soon)`}
                    >
                      <div className="flex items-center gap-3">
                        {team.crestUrl ? (
                          <div
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-11 sm:w-11"
                            aria-hidden
                          >
                            <img
                              src={team.crestUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <span
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 sm:h-11 sm:w-11"
                            aria-hidden
                          >
                            {displayName.slice(0, 1)}
                          </span>
                        )}
                        <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                          {displayName}
                        </span>
                      </div>
                      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
                        Team page coming soon
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800">
          <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NavLinkWithOverlay
              href="/leagues/all"
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
              message="Loading…"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                League tables
              </span>
              <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/"
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
              message="Loading…"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Today&apos;s fixtures
              </span>
              <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/fixtures/upcoming"
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
              message="Loading…"
            >
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                Upcoming fixtures
              </span>
              <svg className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </NavLinkWithOverlay>
          </div>
          <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500">
            League tables, match previews and team stats
          </p>
        </section>
      </main>
    </div>
  );
}
