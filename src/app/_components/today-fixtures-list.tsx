import { FixtureRowLink, FixtureStatsLink, NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";

const TIMEZONE = "Europe/London";

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE,
  });
}

function formatKoTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  });
}

/** statusShort values that mean the match has finished (don't show "Live" badge). */
const LIVE_FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

/** Default order within each KO time: SPFL → EPL → Championship → UCL → UEL → FA Cup. */
const LEAGUE_ORDER: number[] = [179, 39, 40, 2, 3, 45];

/** Consistent display names for competitions (professional, no acronyms). */
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

/** Filter to required leagues and sort by kick-off time (earliest first). */
function fixturesByKickOff(fixtures: FixtureSummary[]): FixtureSummary[] {
  const filtered = fixtures.filter(
    (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
  );
  return filtered.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Group fixtures by kick-off time (same time = same group) for spacing between time slots. */
function groupByKickOffTime(fixtures: FixtureSummary[]): { timeKey: string; fixtures: FixtureSummary[] }[] {
  const map = new Map<number, FixtureSummary[]>();
  for (const f of fixtures) {
    const d = new Date(f.date);
    const startOfMinute = new Date(d);
    startOfMinute.setSeconds(0, 0);
    const key = startOfMinute.getTime();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([timeKey, fixtures]) => ({
      timeKey: String(timeKey),
      fixtures: fixtures.slice().sort(
        (a, b) => leagueSortIndex(a.leagueId) - leagueSortIndex(b.leagueId)
      ),
    }));
}

function TeamCrest({
  crestUrl,
  alt,
  className = "",
}: {
  crestUrl: string | null;
  alt: string;
  className?: string;
}) {
  const sizeClass = "h-6 w-6 sm:h-8 sm:w-8 md:h-9 md:w-9 flex-shrink-0 object-contain";
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={36}
        height={36}
        className={`${sizeClass} ${className}`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${className}`}
      aria-hidden
    >
      <svg className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
      </svg>
    </span>
  );
}

type Props = {
  fixtures: FixtureSummary[];
  /** Show hero (title + description). Default true for homepage. */
  showHero?: boolean;
  /** Today's date key (YYYY-MM-DD) from server to avoid hydration mismatch. */
  todayKey?: string;
};

function getFixtureUrl(fixture: FixtureSummary): string {
  const dateKey = new Date(fixture.date).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const leagueSlug = leagueToSlug(fixture.league);
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueSlug}/${matchSlug(home, away)}`;
}

/** Deterministic "random" pick so server and client render the same (avoids hydration mismatch). */
function pickDeterministic<T>(arr: T[], count: number, seed: string): T[] {
  if (arr.length === 0) return [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const next = () => {
    h = (Math.imul(16807, h) | 0) % 2147483647;
    return (h >>> 0) / 2147483647;
  };
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.floor(next() * arr.length)]);
  }
  return result;
}

export function TodayFixturesList({ fixtures, showHero = true, todayKey: todayKeyProp }: Props) {
  const todayKey = todayKeyProp ?? todayDateKey();
  const sortedFixtures = fixturesByKickOff(fixtures);
  const timeGroups = groupByKickOffTime(sortedFixtures);
  const displayDate = formatDisplayDate(todayKey);
  const [randomFixture1, randomFixture2] = pickDeterministic(sortedFixtures, 2, todayKey);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {showHero && (
          <section className="mb-10">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
              Football Stats & Player Data
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400 sm:text-base">
              {displayDate}
            </p>
            <p className="mt-3 text-neutral-600 dark:text-neutral-400 sm:text-lg leading-relaxed">
              Explore team season averages and in-depth player statistics to uncover meaningful
              trends and make informed, data-driven match insights.
            </p>
          </section>
        )}

        {sortedFixtures.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No fixtures for today in the selected leagues.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {timeGroups.map(({ timeKey, fixtures: groupFixtures }) => (
              <ul key={timeKey} className="space-y-2">
                {groupFixtures.map((f) => {
              const home = f.homeTeam.shortName ?? f.homeTeam.name;
              const away = f.awayTeam.shortName ?? f.awayTeam.name;
              const slug = leagueToSlug(f.league);
              const match = matchSlug(home, away);
              const href = `/fixtures/${todayKey}/${slug}/${match}`;
              const koTime = formatKoTime(new Date(f.date));
              const now = new Date();
              const kickoff = new Date(f.date);
              const twoHoursMs = 2 * 60 * 60 * 1000;
              const withinLiveWindow =
                kickoff <= now && now.getTime() - kickoff.getTime() < twoHoursMs;
              const isFinished =
                f.statusShort != null && LIVE_FINISHED_STATUSES.has(f.statusShort);
              const isLive = withinLiveWindow && !isFinished;
              const competitionName = leagueDisplayName(f.league, f.leagueId);
              return (
                <FixtureRowLink
                  key={f.id}
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
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      {isLive && (
                        <span
                          className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300 sm:text-xs"
                          aria-label="Match live"
                        >
                          Live
                        </span>
                      )}
                      <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors group-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:bg-neutral-700 sm:px-3 sm:py-1.5 sm:text-sm">
                        View Stats
                      </span>
                    </div>
                  </div>
                </FixtureRowLink>
              );
                })}
              </ul>
            ))}
          </div>
        )}

        <section className="mt-14 border-t border-neutral-200 pt-12 dark:border-neutral-800">
          <h2 className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore more
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <NavLinkWithOverlay
              href={`/${todayKey}/ai/insights`}
              className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-violet-800/50 dark:bg-neutral-900 dark:hover:shadow-violet-900/20 dark:hover:border-violet-700/50 sm:col-span-2"
              message="Loading insights…"
              italic={false}
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                New AI Insights
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                We scan today's fixtures & stats then we surface the trends that matter
              </p>
              <span className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400">
                See AI Insights →
              </span>
            </NavLinkWithOverlay>
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Season Player Performance Stats
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Detailed player statistics including shots per 90, goals, assists, and disciplinary records
              </p>
              {randomFixture1 ? (
                <FixtureStatsLink
                  href={getFixtureUrl(randomFixture1)}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  View match stats →
                </FixtureStatsLink>
              ) : (
                <NavLinkWithOverlay
                  href={`/fixtures/${todayKey}`}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  View fixtures →
                </NavLinkWithOverlay>
              )}
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Team Averages & Match Trends
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Compare team averages/patterns for goals, corners, and cards across the season
              </p>
              {randomFixture2 ? (
                <FixtureStatsLink
                  href={getFixtureUrl(randomFixture2)}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Today's stats →
                </FixtureStatsLink>
              ) : (
                <NavLinkWithOverlay
                  href={`/fixtures/${todayKey}`}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  View fixtures →
                </NavLinkWithOverlay>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
