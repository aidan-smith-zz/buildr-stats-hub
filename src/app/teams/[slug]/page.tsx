import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTeamPageData, type TeamPageData } from "@/lib/teamPageService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { LEAGUE_DISPLAY_NAMES, STANDINGS_LEAGUE_SLUG_BY_ID } from "@/lib/leagues";
import { getOrRefreshStandings, type StandingsData } from "@/lib/standingsService";
import { TeamPlayersTable } from "./TeamPlayersTable";

type RouteParams = {
  params: Promise<{
    slug: string;
  }>;
};

function extractTeamId(slug: string): number {
  const match = slug.match(/-(\d+)$/);
  if (!match) return NaN;
  return Number(match[1]);
}

function teamSlug(name: string, id: number): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `${base}-${id}`;
}

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
  const teamId = extractTeamId(slug);
  if (!Number.isFinite(teamId) || teamId <= 0) {
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
  const title = `${displayName} stats & form | ${data.leagueName} ${data.season}`;
  const description = `See ${displayName}'s ${data.leagueName} ${data.season} stats: goals, xG, corners and cards per 90, recent results and key player numbers.`;

  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
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
  const teamId = extractTeamId(slug);
  if (!Number.isFinite(teamId) || teamId <= 0) notFound();

  const data = await getTeamPageData(teamId);
  if (!data) notFound();

  const canonicalSlug = teamSlug(data.shortName ?? data.name, data.teamId);

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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
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
      </main>
    </div>
  );
}

