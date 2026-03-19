import { FixtureRowLink, NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import Image from "next/image";
import { TodayTomorrowTabs } from "@/app/_components/today-tomorrow-tabs";
import { fixtureDateKey, leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { isFixtureInRequiredLeagues, LEAGUE_DISPLAY_NAMES, LEAGUE_GROUP_ORDER, LEAGUE_ORDER } from "@/lib/leagues";

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

/** True if the fixture's date (in Europe/London) falls on the given dateKey (YYYY-MM-DD). */
function fixtureOnDateKey(fixture: FixtureSummary, dateKey: string): boolean {
  return fixtureDateKey(fixture.date) === dateKey;
}

/** Filter to required leagues and sort by kick-off time (earliest first). Uses isFixtureInRequiredLeagues so La Liga and others show even when leagueId is null (API omitted id). */
function fixturesByKickOff(fixtures: FixtureSummary[]): FixtureSummary[] {
  const filtered = fixtures.filter((f) =>
    isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league })
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
  /** When set, show "Tomorrow's Fixtures" section (only after warm-tomorrow has run). */
  tomorrowFixtures?: FixtureSummary[];
  /** Tomorrow's date key (YYYY-MM-DD); required when tomorrowFixtures is set. */
  tomorrowKey?: string;
  /** When true, today tab uses league grouping (section per league). From server to avoid hydration mismatch. */
  useLeagueGroupsForToday?: boolean;
  /** When true, tomorrow tab uses league grouping. From server to avoid hydration mismatch. */
  useLeagueGroupsForTomorrow?: boolean;
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

export function TodayFixturesList({
  fixtures,
  showHero = true,
  todayKey: todayKeyProp,
  tomorrowFixtures,
  tomorrowKey,
  useLeagueGroupsForToday,
  useLeagueGroupsForTomorrow,
}: Props) {
  const todayKey = todayKeyProp ?? todayDateKey();
  /** Today tab: only fixtures whose date (Europe/London) is today. */
  const todayOnly = tomorrowKey != null ? fixtures.filter((f) => fixtureOnDateKey(f, todayKey)) : fixtures;
  const sortedFixtures = fixturesByKickOff(todayOnly);
  const timeGroups = groupByKickOffTime(sortedFixtures);
  const leagueGroups = sortedFixtures.length > 15 ? groupByLeague(sortedFixtures) : null;
  /** Use server-provided decision when available to avoid hydration mismatch; otherwise fall back to local. */
  const useLeagueToday = useLeagueGroupsForToday ?? (sortedFixtures.length > 15);
  const displayDate = formatDisplayDate(todayKey);

  /** Show Tomorrow tab whenever we have a tomorrow key (e.g. on homepage); panel can be empty. */
  const showTomorrowTab = tomorrowKey != null;
  /** Tomorrow tab: only fixtures whose date (Europe/London) is tomorrow. */
  const tomorrowOnly =
    showTomorrowTab && tomorrowFixtures?.length
      ? tomorrowFixtures.filter((f) => fixtureOnDateKey(f, tomorrowKey!))
      : [];
  const hasTomorrowFixtures = tomorrowOnly.length > 0;
  const sortedTomorrow = fixturesByKickOff(tomorrowOnly);
  const tomorrowTimeGroups = sortedTomorrow.length > 0 ? groupByKickOffTime(sortedTomorrow) : [];
  const tomorrowLeagueGroups =
    sortedTomorrow.length > 15 ? groupByLeague(sortedTomorrow) : null;
  const useLeagueTomorrow = useLeagueGroupsForTomorrow ?? (sortedTomorrow.length > 15);
  const tomorrowDisplayDate = showTomorrowTab && tomorrowKey ? formatDisplayDate(tomorrowKey) : "";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          {showHero ? (
            <section className="mb-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/80 px-3 py-2 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/70 sm:px-4 sm:py-3">
                  <Image
                    src="/stats-buildr-mini.png"
                    alt="statsBuildr"
                    width={44}
                    height={44}
                    className="h-10 w-10 rounded-2xl border border-neutral-200 bg-neutral-900 p-1 shadow-md sm:h-11 sm:w-11 dark:border-neutral-600"
                    priority
                  />
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                      statsBuildr
                    </span>
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
                      Today&apos;s Football Fixtures &amp; Player Stats
                    </h1>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 sm:text-[13px]">
                      Football stats for smarter bet builders
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 via-emerald-400 to-violet-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm sm:text-xs">
                    {displayDate}
                  </span>
                  <div className="flex flex-col gap-2">
                    <NavLinkWithOverlay
                      href="/fixtures/upcoming"
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
                    >
                      Upcoming fixtures (14 days) →
                    </NavLinkWithOverlay>
                    <NavLinkWithOverlay
                      href="/fixtures/past"
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
                    >
                      ← Past fixtures (14 days)
                    </NavLinkWithOverlay>
                    <NavLinkWithOverlay
                      href="/fixtures/live"
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-200 dark:hover:border-emerald-500 sm:text-sm"
                    >
                      Live scores &amp; in-play stats →
                    </NavLinkWithOverlay>
                  </div>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-neutral-600 dark:text-neutral-400 sm:text-sm">
                See today&apos;s football fixtures with team form, detailed player stats – goals, assists, xG, corners and cards – plus confirmed lineups as they are released before kick-off, so you can build sharper bet builder selections.
              </p>
            </section>
          ) : null}

          <section className="mb-10">
            <TodayTomorrowTabs
              hasTomorrow={showTomorrowTab}
            tomorrowLabel="Tomorrow's fixtures"
            todayLabel="Today's fixtures"
            tomorrowContent={
              <section className="mb-4">
                <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                  {tomorrowDisplayDate}
                </p>
                {!hasTomorrowFixtures ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:border-neutral-900">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      No fixtures avaiable for tomorrow yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {tomorrowLeagueGroups ? (
                      <div className="space-y-8">
                        {tomorrowLeagueGroups.map(({ leagueId, leagueName, fixtures: groupFixtures }) => (
                          <section key={leagueId ?? leagueName} className="space-y-3">
                            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
                              {leagueName}
                            </h3>
                            <ul className="space-y-2">
                              {groupFixtures.map((f) => renderFixtureCard(f, tomorrowKey!))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {tomorrowTimeGroups.map(({ timeKey, fixtures: groupFixtures }) => (
                          <section key={timeKey} className="space-y-3">
                            <h3 className="sr-only">
                              {groupFixtures[0]
                                ? formatKoTime(new Date(groupFixtures[0].date))
                                : timeKey}
                            </h3>
                            <ul className="space-y-2">
                              {groupFixtures.map((f) => renderFixtureCard(f, tomorrowKey!))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            }
            todayContent={
              <>
                <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                  {displayDate}
                </p>
                {sortedFixtures.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      No fixtures for {displayDate} in the selected leagues.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {useLeagueToday && leagueGroups ? (
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
                      <div className="space-y-3">
                        {timeGroups.map(({ timeKey, fixtures: groupFixtures }) => (
                          <section key={timeKey} className="space-y-3">
                            <h3 className="sr-only">
                              {groupFixtures[0]
                                ? formatKoTime(new Date(groupFixtures[0].date))
                                : timeKey}
                            </h3>
                            <ul className="space-y-2">
                              {groupFixtures.map((f) => renderFixtureCard(f, todayKey))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            }
            />
          </section>

          <section className="mb-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Explore today&apos;s stats hubs
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Move quickly between fixture analysis, form and market pages.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm">
              <NavLinkWithOverlay
                href={`/fixtures/${todayKey}/form`}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Form table
              </NavLinkWithOverlay>
              <NavLinkWithOverlay
                href={`/fixtures/${todayKey}/ai-insights`}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                AI insights
              </NavLinkWithOverlay>
              <NavLinkWithOverlay
                href={`/fixtures/${todayKey}/matchday-insights`}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Matchday insights
              </NavLinkWithOverlay>
              <NavLinkWithOverlay
                href="/leagues/all"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                League hubs
              </NavLinkWithOverlay>
              <NavLinkWithOverlay
                href="/teams/all"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Team hubs
              </NavLinkWithOverlay>
            </div>
          </section>
        </div>

        <section className="max-w-2xl space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <p>
            <strong>statsBuildr</strong> is a data-driven football stats tool for bet builders. We combine team form, player season numbers and xG-based metrics so you can see how a match usually plays before you place a bet.
          </p>
          <p>
            For every fixture today you can view goals scored and conceded, shots, xG, corners, cards and player contribution stats to help build smarter shots, cards and goals selections.
          </p>
          <p>
            Looking for a summary view?{" "}
            <a
              href={`/fixtures/${todayKey}/matchday-insights`}
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"
            >
              See today&apos;s match insights
            </a>{" "}
            or{" "}
            <a
              href={`/fixtures/${todayKey}/form`}
              className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"
            >
              view the form table for today&apos;s fixtures
            </a>
            .
          </p>
        </section>

        <section className="mt-14 border-t border-neutral-200 pt-12 dark:border-neutral-800">
          <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore more with <span className="font-semibold">stats</span>Buildr
          </h2>
          <p className="mb-6 text-center text-xs text-neutral-500 dark:text-neutral-400 sm:text-[13px]">
            Go beyond the fixture list: see today&apos;s leaders, form, league tables and deeper stats to support your bet builder ideas.
          </p>
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
                Which players average the most yellow cards? Which teams have the highest xG or corners per match? See today&apos;s leaders across key stats.
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
                Last 5, last 10 and season form for all teams playing today. Quickly compare goals, corners, cards and more between sides.
              </p>
              <span className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200">
                View form table →
              </span>
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/leagues/all"
              className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-sky-800/50 dark:bg-neutral-900 dark:hover:shadow-sky-900/20 dark:hover:border-sky-700/50 sm:col-span-2"
              message="Loading…"
              italic={false}
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                League tables &amp; stats hubs
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Premier League, Championship, Scottish Premiership, League One, League Two, Champions League and Europa League. Standings, stats hubs and links to league markets.
              </p>
              <span className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400">
                View league stats &amp; tables →
              </span>
            </NavLinkWithOverlay>
          </div>
        </section>

        <section className="mt-10 space-y-3 text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            More from <span className="font-semibold">stats</span>Buildr
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            <NavLinkWithOverlay
              href="/teams/all"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
            >
              Team stats &amp; markets
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/leagues/all"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
            >
              League stats &amp; markets
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/about"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
            >
              About <span className="font-semibold">stats</span>Buildr
            </NavLinkWithOverlay>
            <NavLinkWithOverlay
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-sky-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-emerald-400 sm:text-sm"
            >
              Contact <span className="font-semibold">stats</span>Buildr
            </NavLinkWithOverlay>
          </div>
        </section>
      </main>
    </div>
  );
}
