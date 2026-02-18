import Link from "next/link";
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
  const sizeClass = "h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 object-contain";
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
      <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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

export function TodayFixturesList({ fixtures, showHero = true }: Props) {
  const todayKey = todayDateKey();
  const byLeague = groupByLeague(fixtures);
  const displayDate = formatDisplayDate(todayKey);

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
                    return (
                      <li key={f.id}>
                        <Link
                          href={href}
                          className="group flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 sm:px-5 sm:py-4"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                            <TeamCrest
                              crestUrl={f.homeTeam.crestUrl}
                              alt={home}
                            />
                            <span className="truncate text-left font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
                              {home}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-neutral-400 dark:text-neutral-500 sm:text-sm">
                              vs
                            </span>
                            <TeamCrest
                              crestUrl={f.awayTeam.crestUrl}
                              alt={away}
                            />
                            <span className="truncate text-left font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
                              {away}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="hidden text-sm text-neutral-500 dark:text-neutral-400 sm:inline">
                              {koTime}
                            </span>
                            <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors group-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:bg-neutral-700">
                              View Stats
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
