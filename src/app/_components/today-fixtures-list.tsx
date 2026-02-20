import Link from "next/link";
import { FixtureRowLink } from "@/app/_components/fixture-row-link";
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

function groupByLeague(fixtures: FixtureSummary[]): Map<string, FixtureSummary[]> {
  const filtered = fixtures.filter(
    (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
  );
  const map = new Map<string, FixtureSummary[]>();
  for (const f of filtered) {
    const league = f.league ?? "Other";
    if (!map.has(league)) map.set(league, []);
    map.get(league)!.push(f);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return map;
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
};

function getFixtureUrl(fixture: FixtureSummary): string {
  const dateKey = new Date(fixture.date).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const leagueSlug = leagueToSlug(fixture.league);
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  return `/fixtures/${dateKey}/${leagueSlug}/${matchSlug(home, away)}`;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  if (arr.length === 0) return [];
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.floor(Math.random() * arr.length)]);
  }
  return result;
}

export function TodayFixturesList({ fixtures, showHero = true }: Props) {
  const todayKey = todayDateKey();
  const byLeague = groupByLeague(fixtures);
  const displayDate = formatDisplayDate(todayKey);
  const filteredFixtures = Array.from(byLeague.values()).flat();
  const [randomFixture1, randomFixture2] = pickRandom(filteredFixtures, 2);

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

        {byLeague.size === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No fixtures for today in the selected leagues.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(byLeague.entries()).map(([league, leagueFixtures]) => (
              <section key={league}>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {league}
                </h2>
                <ul className="space-y-2">
                  {leagueFixtures.map((f) => {
                    const home = f.homeTeam.shortName ?? f.homeTeam.name;
                    const away = f.awayTeam.shortName ?? f.awayTeam.name;
                    const slug = leagueToSlug(f.league);
                    const match = matchSlug(home, away);
                    const href = `/fixtures/${todayKey}/${slug}/${match}`;
                    const koTime = formatKoTime(new Date(f.date));
                    const now = new Date();
                    const kickoff = new Date(f.date);
                    const twoAndHalfHoursMs = 2.5 * 60 * 60 * 1000;
                    const isLive =
                      kickoff <= now && now.getTime() - kickoff.getTime() < twoAndHalfHoursMs;
                    return (
                      <FixtureRowLink
                        key={f.id}
                        href={href}
                        className="group flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 sm:gap-4 sm:px-5 sm:py-4"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                          <TeamCrest
                            crestUrl={f.homeTeam.crestUrl}
                            alt={home}
                          />
                          <span className="truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm md:text-base">
                            {home}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 sm:text-sm">
                            vs
                          </span>
                          <TeamCrest
                            crestUrl={f.awayTeam.crestUrl}
                            alt={away}
                          />
                          <span className="truncate text-left text-xs font-semibold text-neutral-900 dark:text-neutral-50 sm:text-sm md:text-base">
                            {away}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
                            {koTime}
                          </span>
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
                      </FixtureRowLink>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <section className="mt-14 border-t border-neutral-200 pt-12 dark:border-neutral-800">
          <h2 className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Explore more
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Season Player Performance Stats
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Detailed player statistics including shots per 90, goals, assists, and disciplinary records
              </p>
              {randomFixture1 && (
                <Link
                  href={getFixtureUrl(randomFixture1)}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  View match stats →
                </Link>
              )}
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:shadow-neutral-800/50">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Team Averages & Match Trends
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Compare team averages/patterns for goals, corners, and cards across the season
              </p>
              {randomFixture2 && (
                <Link
                  href={getFixtureUrl(randomFixture2)}
                  className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  Today's stats →
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
