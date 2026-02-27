import { FixtureRowLink, NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
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

/** Default order within each KO time: SPFL → EPL → Championship → League One → League Two → UCL → UEL → FA Cup. */
const LEAGUE_ORDER: number[] = [179, 39, 40, 41, 42, 2, 3, 45];

/** Order when grouping by league on busy days (many fixtures). */
const LEAGUE_GROUP_ORDER: number[] = [39, 40, 179, 41, 42, 2, 3, 45];

/** Consistent display names for competitions (professional, no acronyms). */
const LEAGUE_DISPLAY_NAMES: Record<number, string> = {
  39: "Premier League",
  40: "Championship",
  41: "League One",
  42: "League Two",
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

function leagueGroupSortIndex(leagueId: number | null): number {
  if (leagueId == null) return LEAGUE_GROUP_ORDER.length;
  const i = LEAGUE_GROUP_ORDER.indexOf(leagueId);
  return i === -1 ? LEAGUE_GROUP_ORDER.length : i;
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

/** Group fixtures by league for busy days (many fixtures). */
function groupByLeague(fixtures: FixtureSummary[]): { leagueId: number | null; leagueName: string; fixtures: FixtureSummary[] }[] {
  const map = new Map<number | null, FixtureSummary[]>();
  for (const f of fixtures) {
    const key = f.leagueId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return Array.from(map.entries())
    .sort(([aId], [bId]) => leagueGroupSortIndex(aId) - leagueGroupSortIndex(bId))
    .map(([leagueId, groupFixtures]) => ({
      leagueId,
      leagueName: leagueDisplayName(groupFixtures[0]?.league ?? null, groupFixtures[0]?.leagueId ?? null),
      fixtures: groupFixtures.slice().sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
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

function renderFixtureCard(fixture: FixtureSummary, todayKey: string) {
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const slug = leagueToSlug(fixture.league);
  const match = matchSlug(home, away);
  const href = `/fixtures/${todayKey}/${slug}/${match}`;
  const koTime = formatKoTime(new Date(fixture.date));
  const now = new Date();
  const kickoff = new Date(fixture.date);
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const withinLiveWindow =
    kickoff <= now && now.getTime() - kickoff.getTime() < twoHoursMs;
  const isFinished =
    fixture.statusShort != null && LIVE_FINISHED_STATUSES.has(fixture.statusShort);
  const isLive = withinLiveWindow && !isFinished;
  const competitionName = leagueDisplayName(fixture.league, fixture.leagueId);

  return (
    <FixtureRowLink
      key={fixture.id}
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
          <TeamCrest crestUrl={fixture.homeTeam.crestUrl} alt={home} />
          <span className="min-w-0 truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm md:text-base">
            {home}
          </span>
          <span className="shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 sm:text-sm">
            vs
          </span>
          <TeamCrest crestUrl={fixture.awayTeam.crestUrl} alt={away} />
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
}

export function TodayFixturesList({ fixtures, showHero = true, todayKey: todayKeyProp }: Props) {
  const todayKey = todayKeyProp ?? todayDateKey();
  const sortedFixtures = fixturesByKickOff(fixtures);
  const timeGroups = groupByKickOffTime(sortedFixtures);
  const leagueGroups = sortedFixtures.length > 15 ? groupByLeague(sortedFixtures) : null;
  const displayDate = formatDisplayDate(todayKey);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          {showHero ? (
            <section className="mb-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src="/stats-buildr-mini.png"
                    alt="statsBuildr"
                    className="h-11 w-11 rounded-full shadow-md sm:h-12 sm:w-12"
                  />
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
                      statsBuildr
                    </h1>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500 sm:text-[13px]">
                      Football stats for smarter bet builders
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 via-emerald-400 to-violet-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm sm:text-xs">
                    {displayDate}
                  </span>
                  <NavLinkWithOverlay
                    href="/fixtures/upcoming"
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
                  >
                    Upcoming fixtures (14 days) →
                  </NavLinkWithOverlay>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-neutral-600 dark:text-neutral-400 sm:text-sm">
                Explore team season averages, player performance and xG-based insights before you build your bet.
              </p>
            </section>
          ) : null}

          {sortedFixtures.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No fixtures for today in the selected leagues.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50 sm:text-lg">
              Today&apos;s fixtures
            </h2>
            {leagueGroups ? (
              <div className="space-y-8">
                {leagueGroups.map(({ leagueId, leagueName, fixtures: groupFixtures }) => (
                  <section key={leagueId ?? leagueName} className="space-y-3">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
                      {leagueName}
                    </h3>
                    <ul className="space-y-2">
                      {groupFixtures.map((f) => renderFixtureCard(f, todayKey))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              timeGroups.map(({ timeKey, fixtures: groupFixtures }) => (
                <ul key={timeKey} className="space-y-2">
                  {groupFixtures.map((f) => renderFixtureCard(f, todayKey))}
                </ul>
              ))
            )}
          </div>
          )}
        </div>

        <section className="mt-14 border-t border-neutral-200 pt-12 dark:border-neutral-800">
          <h2 className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore more
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <NavLinkWithOverlay
              href={`/fixtures/${todayKey}/ai-insights`}
              className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-violet-800/50 dark:bg-neutral-900 dark:hover:shadow-violet-900/20 dark:hover:border-violet-700/50 sm:col-span-2"
              message="Loading insights…"
              italic={false}
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                New AI insights
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                We scan today's fixtures & stats then we surface the trends that matter
              </p>
              <span className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400">
                See AI insights →
              </span>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href={`/fixtures/${todayKey}/matchday-insights`}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Matchday insights
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Which players average the most yellow cards? Which teams have the highest xG or corners per match? Data leaders across today&apos;s fixtures.
              </p>
              <span className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200">
                View matchday insights →
              </span>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href={`/fixtures/${todayKey}/form`}
              className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50"
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Form table
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Last 5, last 10 and season form for all teams playing today. Sortable by goals, corners, cards and more.
              </p>
              <span className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200">
                View form table →
              </span>
            </NavLinkWithOverlay>
          </div>
        </section>
      </main>
    </div>
  );
}
