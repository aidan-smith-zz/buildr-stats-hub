import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  STANDINGS_LEAGUE_SLUG_BY_ID,
  LEAGUE_DISPLAY_NAMES,
  standingsSlugToLeagueId,
} from "@/lib/leagues";
import { todayDateKey } from "@/lib/slugs";
import { getLeagueCrestUrl } from "@/lib/crestsService";
import { getOrRefreshStandings } from "@/lib/standingsService";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { ShareUrlButton } from "@/app/_components/share-url-button";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

type Props = { params: Promise<{ league: string }> };

function normalizeSlug(slug: string | undefined): string {
  if (!slug || typeof slug !== "string") return "";
  return slug.trim().toLowerCase();
}

/** Current football season string for metadata (e.g. 2024/25). */
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
    return { title: "League not found | statsBuildr" };
  }
  const season = getCurrentSeasonString();
  const title = `${leagueName} Table ${season} | Live Standings, Points & Form | statsBuildr`;
  const description = `Current ${leagueName} league table and standings ${season}. Points, goal difference, wins, draws, losses. Free football stats and bet builder analytics.`;
  const canonical = `${BASE_URL}/leagues/${slug}/standings`;
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

function CrestCell({ logo, teamName }: { logo: string | null; teamName: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 flex-shrink-0 object-contain"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700"
      aria-hidden
    >
      <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
        {teamName.slice(0, 1)}
      </span>
    </span>
  );
}

export default async function LeagueStandingsPage({ params }: Props) {
  const slug = normalizeSlug((await params).league);
  const leagueId = standingsSlugToLeagueId(slug);

  if (leagueId === undefined) {
    notFound();
  }

  const [standings, leagueCrestUrl] = await Promise.all([
    getOrRefreshStandings(leagueId),
    getLeagueCrestUrl(leagueId),
  ]);
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? "League";

  const breadcrumbItems = [
    { href: "/", label: "Home" },
    { href: "/fixtures", label: "Fixtures" },
    { href: `/leagues/${slug}/standings`, label: `${leagueName} standings` },
  ];

  const jsonLd =
    standings?.tables?.length && standings.tables[0].rows?.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${leagueName} league table ${standings.season ?? ""}`.trim(),
          description: `Current ${leagueName} standings: points, goal difference, wins, draws, losses.`,
          numberOfItems: standings.tables[0].rows.length,
          itemListElement: standings.tables[0].rows.map((row) => ({
            "@type": "ListItem",
            position: row.rank,
            name: row.teamName,
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        ) : null}

        <main>
          <header className="mb-6 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {leagueCrestUrl ? (
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/80 sm:h-12 sm:w-12"
                    aria-hidden
                  >
                    <img
                      src={leagueCrestUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {standings?.season ?? "2025"} season
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
                    {leagueName} standings
                  </h1>
                  <p className="mt-0.5 text-xs font-medium text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
                    statsBuildr · League table
                  </p>
                </div>
              </div>
              <span className="inline-flex flex-shrink-0 items-center rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-50 shadow-sm dark:bg-neutral-100 dark:text-neutral-900">
                P · Pts · GD · W · L · D
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Official {leagueName} league table: current points, goal difference, wins, draws and
              losses. Use with today&apos;s fixtures and form for bet builder stats.
            </p>
          </header>

          {!standings || !standings.tables.length ? (
            <div
              className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-800 dark:bg-neutral-900"
              role="region"
              aria-label="No standings"
            >
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Standings are not available for this league right now. Cup competitions (e.g. FA
                Cup, Scottish Cup) do not have a league table.
              </p>
              <NavLinkWithOverlay
                href="/fixtures"
                className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
              >
                View fixtures →
              </NavLinkWithOverlay>
            </div>
          ) : (
            <article aria-label={`${leagueName} league table`}>
              {standings.tables.map((table, idx) => (
                <section
                  key={table.group ?? idx}
                  className="mb-8 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  aria-label={table.group ?? `${leagueName} standings`}
                >
                  {table.group ? (
                    <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
                      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        {table.group}
                      </h2>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-800/50">
                          <th className="sticky left-0 z-20 w-8 min-w-[2rem] max-w-[2rem] bg-neutral-100 py-3 pl-2 pr-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)]">
                            #
                          </th>
                          <th className="sticky left-8 z-20 w-24 max-w-[6rem] border-r border-neutral-200 bg-neutral-100 py-3 pl-1.5 pr-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)]">
                            Team
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            P
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Pts
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            GD
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            W
                          </th>
                          <th className="py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            L
                          </th>
                          <th className="py-3 pl-2 pr-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            D
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row) => (
                          <tr
                            key={row.teamId}
                            className="group border-b border-neutral-100 transition-colors hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
                          >
                            <td className="sticky left-0 z-10 w-8 min-w-[2rem] max-w-[2rem] bg-white py-2.5 pl-2 pr-1 font-medium text-neutral-600 transition-colors group-hover:bg-neutral-50/60 dark:bg-neutral-900 dark:text-neutral-400 dark:group-hover:bg-neutral-800/40">
                              {row.rank}
                            </td>
                            <td className="sticky left-8 z-10 w-24 max-w-[6rem] border-r border-neutral-200 bg-white py-2.5 pl-1.5 pr-2 transition-colors group-hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900 dark:group-hover:bg-neutral-800/40">
                              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                <CrestCell logo={row.logo} teamName={row.teamName} />
                                <span className="min-w-0 truncate font-medium text-neutral-900 dark:text-neutral-50" title={row.teamName}>
                                  {row.teamName}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                              {row.played}
                            </td>
                            <td className="py-2.5 px-2 text-center font-semibold text-neutral-900 dark:text-neutral-50">
                              {row.points}
                            </td>
                            <td
                              className={`py-2.5 px-2 text-center font-medium ${
                                row.goalsDiff > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : row.goalsDiff < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-neutral-500 dark:text-neutral-400"
                              }`}
                            >
                              {row.goalsDiff > 0 ? "+" : ""}
                              {row.goalsDiff}
                            </td>
                            <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                              {row.win}
                            </td>
                            <td className="py-2.5 px-2 text-center text-neutral-700 dark:text-neutral-300">
                              {row.lose}
                            </td>
                            <td className="py-2.5 pl-2 pr-4 text-center text-neutral-700 dark:text-neutral-300">
                              {row.draw}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              {standings.updatedAt ? (
                <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
                  Table updated{" "}
                  {standings.updatedAt.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </p>
              ) : null}

              <section
                className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                aria-label="Related links"
              >
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  For match previews, team form and player stats, see{" "}
                  <NavLinkWithOverlay
                    href="/fixtures"
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    today&apos;s fixtures
                  </NavLinkWithOverlay>
                  {" "}and the{" "}
                  <NavLinkWithOverlay
                    href={`/fixtures/${todayDateKey()}/form`}
                    className="font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    form table
                  </NavLinkWithOverlay>
                  .
                </p>
              </section>
            </article>
          )}

          <div className="mt-6 flex justify-end">
            <ShareUrlButton className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700" />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Generate static params for known standings leagues so paths are known at build time. */
export function generateStaticParams() {
  return Object.entries(STANDINGS_LEAGUE_SLUG_BY_ID).map(([, slug]) => ({ league: slug }));
}
