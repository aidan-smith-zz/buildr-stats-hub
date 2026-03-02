"use client";

import { useMemo, useState } from "react";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import { LEAGUE_DISPLAY_NAMES, LEAGUE_ORDER } from "@/lib/leagues";
import type { UpcomingFixtureByDate, UpcomingFixtureWithCrests } from "@/lib/fixturesService";

/** Serialized FixtureSummary (date becomes string over the wire). */
export type WarmedFixtureSnapshot = {
  date: string;
  statusShort?: string | null;
  league: string | null;
  leagueId: number | null;
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
};

const LIVE_FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${weekdays[date.getUTCDay()]}, ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatKoTime(isoDate: string): string {
  const d = new Date(isoDate);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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

type Props = {
  byDate: UpcomingFixtureByDate[];
  warmedByKey: Record<string, WarmedFixtureSnapshot>;
};

export function UpcomingFixturesList({ byDate, warmedByKey }: Props) {
  const [leagueFilter, setLeagueFilter] = useState<number | "">("");
  const [teamFilter, setTeamFilter] = useState<string>("");

  const warmedMap = useMemo(() => new Map<string, WarmedFixtureSnapshot>(Object.entries(warmedByKey)), [warmedByKey]);

  const { leagues, teams } = useMemo(() => {
    const leagueSet = new Map<number, string>();
    const teamSet = new Set<string>();
    for (const { fixtures } of byDate) {
      for (const f of fixtures) {
        if (f.leagueId != null) {
          const name = LEAGUE_DISPLAY_NAMES[f.leagueId] ?? f.league ?? "Other";
          if (!leagueSet.has(f.leagueId)) leagueSet.set(f.leagueId, name);
        }
        const home = f.homeTeam.shortName ?? f.homeTeam.name;
        const away = f.awayTeam.shortName ?? f.awayTeam.name;
        teamSet.add(home);
        teamSet.add(away);
      }
    }
    const leagues = Array.from(leagueSet.entries())
      .sort(([a], [b]) => leagueSortIndex(a) - leagueSortIndex(b))
      .map(([id, name]) => ({ id, name }));
    const teams = Array.from(teamSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return { leagues, teams };
  }, [byDate]);

  const filteredByDate = useMemo(() => {
    const leagueId = leagueFilter === "" ? null : leagueFilter;
    const team = teamFilter === "" ? null : teamFilter;

    return byDate
      .map(({ dateKey, fixtures }) => {
        const filtered = fixtures.filter((f) => {
          if (leagueId != null && (f.leagueId ?? null) !== leagueId) return false;
          if (team != null) {
            const home = f.homeTeam.shortName ?? f.homeTeam.name;
            const away = f.awayTeam.shortName ?? f.awayTeam.name;
            if (home !== team && away !== team) return false;
          }
          return true;
        });
        return { dateKey, fixtures: filtered };
      })
      .filter((g) => g.fixtures.length > 0);
  }, [byDate, leagueFilter, teamFilter]);

  const hasActiveFilters = leagueFilter !== "" || teamFilter !== "";
  const totalFiltered = filteredByDate.reduce((acc, g) => acc + g.fixtures.length, 0);

  if (byDate.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No upcoming fixtures in the next 14 days.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Filter bar – compact, minimal */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <select
          id="upcoming-league-filter"
          value={leagueFilter}
          onChange={(e) => setLeagueFilter(e.target.value === "" ? "" : Number(e.target.value))}
          className="flex-1 min-w-[8rem] rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-600 sm:text-sm"
          aria-label="Filter by competition"
        >
          <option value="">All leagues</option>
          {leagues.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          id="upcoming-team-filter"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="flex-1 min-w-[8rem] rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-600 sm:text-sm"
          aria-label="Filter by team"
        >
          <option value="">All teams</option>
          {teams.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setLeagueFilter("");
              setTeamFilter("");
            }}
            className="text-[11px] font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 sm:text-xs"
            aria-label="Clear all filters"
          >
            Clear
          </button>
        )}
      </div>
      {hasActiveFilters && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 sm:text-xs">
          Showing {totalFiltered} fixture{totalFiltered !== 1 ? "s" : ""}
        </p>
      )}

      {/* Fixture list */}
      {filteredByDate.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No fixtures match the current filters. Try changing league or team.
          </p>
          <button
            type="button"
            onClick={() => {
              setLeagueFilter("");
              setTeamFilter("");
            }}
            className="mt-3 text-sm font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredByDate.map(({ dateKey, fixtures }) => {
            const sorted = [...fixtures].sort(
              (a, b) => leagueSortIndex(a.leagueId ?? null) - leagueSortIndex(b.leagueId ?? null)
            );
            return (
              <section key={dateKey}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {formatDisplayDate(dateKey)}
                </h2>
                <ul className="space-y-2">
                  {sorted.map((f: UpcomingFixtureWithCrests, index: number) => {
                    const home = f.homeTeam.shortName ?? f.homeTeam.name;
                    const away = f.awayTeam.shortName ?? f.awayTeam.name;
                    const leagueSlug = leagueToSlug(f.league ?? null);
                    const match = matchSlug(home, away);
                    const href = `/fixtures/${dateKey}/${leagueSlug}/${match}`;
                    const koTime = formatKoTime(f.date);
                    const key = `${dateKey}:${leagueSlug}:${match}`;
                    const warmed = warmedMap.get(key);

                    const competitionName = warmed
                      ? leagueDisplayName(warmed.league ?? null, warmed.leagueId ?? null)
                      : leagueDisplayName(f.league ?? null, f.leagueId ?? null);

                    let isLive = false;
                    if (warmed) {
                      const kickoff = new Date(warmed.date);
                      const now = new Date();
                      const twoHoursMs = 2 * 60 * 60 * 1000;
                      const withinLiveWindow = kickoff <= now && now.getTime() - kickoff.getTime() < twoHoursMs;
                      const isFinished = warmed.statusShort != null && LIVE_FINISHED_STATUSES.has(warmed.statusShort);
                      isLive = withinLiveWindow && !isFinished;
                    }

                    const hasStats = Boolean(warmed);
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
                            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                              {isLive && (
                                <span
                                  className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300 sm:text-xs"
                                  aria-label="Match live"
                                >
                                  Live
                                </span>
                              )}
                              <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors group-hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:group-hover:bg-violet-800/50 sm:px-3 sm:py-1.5 sm:text-sm">
                                {hasStats ? "View Stats" : "View preview"}
                              </span>
                            </div>
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
    </div>
  );
}
