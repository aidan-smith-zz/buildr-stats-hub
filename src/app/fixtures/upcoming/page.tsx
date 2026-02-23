import type { Metadata } from "next";
import { getUpcomingFixturesFromDb } from "@/lib/fixturesService";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import type { RawFixture } from "@/lib/footballApi";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Upcoming fixtures | Next 14 days",
  description:
    "Fixture previews for the next 14 days. View match previews, team stats and AI-powered insights before kick-off.",
};

/** Format date key for display. Uses UTC components so server and client match (avoids hydration mismatch from locale). */
function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const weekday = weekdays[date.getUTCDay()];
  return `${weekday}, ${day} ${month} ${year}`;
}

/** Format kickoff time from ISO string. Uses UTC so server and client match (avoids hydration mismatch). */
function formatKoTime(isoDate: string): string {
  const d = new Date(isoDate);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const LEAGUE_ORDER: number[] = [179, 39, 40, 2, 3, 45];
const LEAGUE_DISPLAY_NAMES: Record<number, string> = {
  39: "Premier League",
  40: "Championship",
  2: "Champions League",
  3: "Europa League",
  179: "Scottish Premiership",
  45: "FA Cup",
};

function leagueDisplayName(league: string | null, leagueId: number | null): string {
  if (leagueId != null && LEAGUE_DISPLAY_NAMES[leagueId]) return LEAGUE_DISPLAY_NAMES[leagueId];
  return league ?? "Other";
}

function leagueSortIndex(leagueId: number | null): number {
  if (leagueId == null) return LEAGUE_ORDER.length;
  const i = LEAGUE_ORDER.indexOf(leagueId);
  return i === -1 ? LEAGUE_ORDER.length : i;
}

function TeamCrest({
  crestUrl,
  alt,
}: {
  crestUrl: string | null | undefined;
  alt: string;
}) {
  const sizeClass = "h-6 w-6 sm:h-8 sm:w-8 md:h-9 md:w-9 flex-shrink-0 object-contain";
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={36}
        height={36}
        className={sizeClass}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400`}
      aria-hidden
    >
      <svg className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
      </svg>
    </span>
  );
}

export default async function UpcomingPage() {
  const byDate = await getUpcomingFixturesFromDb();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8">
          <NavLinkWithOverlay
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back to today
          </NavLinkWithOverlay>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
          Upcoming fixtures
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Next 14 days · Preview pages with match info and AI insights
        </p>

        {byDate.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No upcoming fixtures in the next 14 days.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {byDate.map(({ dateKey, fixtures }) => {
              const sorted = [...fixtures].sort(
                (a, b) => leagueSortIndex(a.leagueId ?? null) - leagueSortIndex(b.leagueId ?? null)
              );
              if (sorted.length === 0) return null;
              return (
                <section key={dateKey}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {formatDisplayDate(dateKey)}
                  </h2>
                  <ul className="space-y-2">
                    {sorted.map((f, index) => {
                      const home = f.homeTeam.shortName ?? f.homeTeam.name;
                      const away = f.awayTeam.shortName ?? f.awayTeam.name;
                      const leagueSlug = leagueToSlug(f.league ?? null);
                      const match = matchSlug(home, away);
                      const href = `/fixtures/${dateKey}/${leagueSlug}/${match}`;
                      const koTime = formatKoTime(f.date);
                      const competitionName = leagueDisplayName(f.league ?? null, f.leagueId ?? null);
                      const itemKey = `${dateKey}-${String(f.id)}-${home}-${away}-${index}`;
                      return (
                        <li key={itemKey} className="relative">
                          <NavLinkWithOverlay
                            href={href}
                            className="group flex flex-col gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 sm:gap-2 sm:px-5 sm:py-4"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 sm:text-xs"
                                aria-label={`Competition: ${competitionName}`}
                              >
                                {competitionName}
                              </span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
                                {koTime}
                              </span>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 sm:gap-4">
                              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                                <TeamCrest crestUrl={f.homeTeam.crestUrl} alt={home} />
                                <span className="min-w-0 truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm md:text-base">
                                  {home}
                                </span>
                                <span className="shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 sm:text-sm">
                                  vs
                                </span>
                                <TeamCrest crestUrl={f.awayTeam.crestUrl} alt={away} />
                                <span className="min-w-0 truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm md:text-base">
                                  {away}
                                </span>
                              </div>
                              <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors group-hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:group-hover:bg-violet-800/50 sm:px-3 sm:py-1.5 sm:text-sm">
                                View preview
                              </span>
                            </div>
                          </NavLinkWithOverlay>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
