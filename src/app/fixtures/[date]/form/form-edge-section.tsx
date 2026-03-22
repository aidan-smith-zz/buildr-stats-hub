"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEdgeFixture } from "@/lib/insightsService";
import type { Last5TeamSummary } from "@/lib/insightsService";
import { LEAGUE_DISPLAY_NAMES, LEAGUE_GROUP_ORDER } from "@/lib/leagues";

/** Order when grouping by league (same as home page). */
function leagueGroupSortIndex(leagueId: number | null): number {
  if (leagueId == null) return LEAGUE_GROUP_ORDER.length;
  const i = LEAGUE_GROUP_ORDER.indexOf(leagueId);
  return i === -1 ? LEAGUE_GROUP_ORDER.length : i;
}
function leagueDisplayName(league: string | null, leagueId: number | null): string {
  if (leagueId != null && LEAGUE_DISPLAY_NAMES[leagueId]) return LEAGUE_DISPLAY_NAMES[leagueId];
  return league ?? "Other";
}

type FormEdgePeriod = "last5" | "last10" | "season";

const PERIOD_LABELS: Record<FormEdgePeriod, string> = {
  last5: "Last 5",
  last10: "Last 10",
  season: "Season",
};

/** rating = (avgGoalsScored * 0.3) - (avgGoalsConceded * 0.7); fixtureEdge = homeRating - awayRating */
function computeEdge(
  home: Last5TeamSummary | undefined,
  away: Last5TeamSummary | undefined
): number | null {
  if (!home || !away) return null;
  const homeRating = home.avgGoalsFor * 0.3 - home.avgGoalsAgainst * 0.7;
  const awayRating = away.avgGoalsFor * 0.3 - away.avgGoalsAgainst * 0.7;
  return homeRating - awayRating;
}

type FixtureEdgeRow = {
  fixture: FormEdgeFixture;
  edge: number | null;
};

type Props = {
  fixtures: FormEdgeFixture[];
  last5: Last5TeamSummary[];
  last10: Last5TeamSummary[];
  season: Last5TeamSummary[];
  /** "today" | "tomorrow" | "date" — used for copy (e.g. "today's fixtures" vs "tomorrow's fixtures"). Default "today". */
  dateContext?: "today" | "tomorrow" | "date";
};

export function FormEdgeSection({ fixtures, last5, last10, season, dateContext = "today" }: Props) {
  const [period, setPeriod] = useState<FormEdgePeriod>("last5");

  const dataByPeriod = period === "last5" ? last5 : period === "last10" ? last10 : season;
  const byTeamId = useMemo(() => {
    const map = new Map<number, Last5TeamSummary>();
    for (const t of dataByPeriod) map.set(t.teamId, t);
    return map;
  }, [dataByPeriod]);

  const rows: FixtureEdgeRow[] = useMemo(() => {
    return fixtures.map((fixture) => ({
      fixture,
      edge: computeEdge(byTeamId.get(fixture.homeTeamId), byTeamId.get(fixture.awayTeamId)),
    }));
  }, [fixtures, byTeamId]);

  const validRows = rows.filter((r): r is FixtureEdgeRow & { edge: number } => r.edge !== null);
  const noDataRows = rows.filter((r) => r.edge === null);
  const maxAbsEdge = useMemo(() => {
    if (validRows.length === 0) return 1;
    const max = Math.max(...validRows.map((r) => Math.abs(r.edge)), 0.3);
    return Math.ceil(max * 10) / 10;
  }, [validRows]);

  const groupByLeague = fixtures.length > 15;
  const validGroups = useMemo(() => {
    if (!groupByLeague || validRows.length === 0) return null;
    const map = new Map<number | null, (FixtureEdgeRow & { edge: number })[]>();
    for (const r of validRows) {
      const key = r.fixture.leagueId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([aId], [bId]) => leagueGroupSortIndex(aId) - leagueGroupSortIndex(bId))
      .map(([leagueId, groupRows]) => ({
        leagueId,
        leagueName: leagueDisplayName(groupRows[0]?.fixture.league ?? null, groupRows[0]?.fixture.leagueId ?? null),
        rows: groupRows,
      }));
  }, [groupByLeague, validRows]);

  const noDataGroups = useMemo(() => {
    if (!groupByLeague || noDataRows.length === 0) return null;
    const map = new Map<number | null, FixtureEdgeRow[]>();
    for (const r of noDataRows) {
      const key = r.fixture.leagueId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([aId], [bId]) => leagueGroupSortIndex(aId) - leagueGroupSortIndex(bId))
      .map(([leagueId, groupRows]) => ({
        leagueId,
        leagueName: leagueDisplayName(groupRows[0]?.fixture.league ?? null, groupRows[0]?.fixture.leagueId ?? null),
        rows: groupRows,
      }));
  }, [groupByLeague, noDataRows]);

  if (fixtures.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800 sm:px-5">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            <span aria-hidden className="mr-1.5">
              🔥
            </span>
            Form Advantage{" "}
            {dateContext === "tomorrow" ? "Tomorrow" : dateContext === "date" ? "This matchday" : "Today"}
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            These matchups show which team has the stronger recent form going into{" "}
            {dateContext === "tomorrow"
              ? "tomorrow's"
              : dateContext === "date"
                ? "these"
                : "today's"}{" "}
            fixtures.
            Use the toggle to compare last 5, last 10 or season samples — a quick read on where the edge sits before kick-off.
          </p>
          <div className="mt-3 inline-flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
            {(["last5", "last10", "season"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {validRows.length === 0 && noDataRows.length === 0 ? (
            <div className="px-0 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No edge data for this period. Teams need at least 3 games in the selected range.
            </div>
          ) : (
            <>
              {validRows.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span>Home edge ←</span>
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">Balanced</span>
                    <span>→ Away edge</span>
                  </div>
                  {validGroups ? (
                    <div className="space-y-8">
                      {validGroups.map(({ leagueName, rows: groupRows }) => (
                        <div key={leagueName} className="space-y-3">
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                            {leagueName}
                          </h3>
                          <div className="space-y-3">
                            {groupRows.map(({ fixture, edge }) => renderEdgeBar(fixture, edge, maxAbsEdge))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {validRows.map(({ fixture, edge }) => renderEdgeBar(fixture, edge, maxAbsEdge))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-4 rounded bg-blue-800"
                        aria-hidden
                      />
                      Home edge
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-4 rounded bg-violet-600"
                        aria-hidden
                      />
                      Away edge
                    </span>
                  </div>
                </div>
              )}
              {noDataRows.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Fixtures (no form data yet)
                  </p>
                  {noDataGroups ? (
                    <div className="space-y-6">
                      {noDataGroups.map(({ leagueName, rows: groupRows }) => (
                        <div key={leagueName} className="space-y-2">
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                            {leagueName}
                          </h3>
                          <div className="space-y-2">
                            {groupRows.map(({ fixture }) => (
                              <Link
                                key={`${fixture.homeTeamId}-${fixture.awayTeamId}`}
                                href={fixture.href}
                                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:bg-neutral-800"
                              >
                                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                  {fixture.homeName} vs {fixture.awayName}
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-neutral-400">View match →</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {noDataRows.map(({ fixture }) => (
                        <Link
                          key={`${fixture.homeTeamId}-${fixture.awayTeamId}`}
                          href={fixture.href}
                          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:bg-neutral-800"
                        >
                          <span className="font-medium text-neutral-700 dark:text-neutral-300">
                            {fixture.homeName} vs {fixture.awayName}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">View match →</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function renderEdgeBar(
  fixture: FormEdgeFixture,
  edge: number,
  maxAbsEdge: number
) {
  const isHomeEdge = edge >= 0;
  const pct = Math.min(Math.abs(edge) / maxAbsEdge, 1) * 100;
  const isBalanced = pct === 0;
  const barTextClass =
    "absolute top-0 flex h-full items-center text-xs font-semibold text-white min-w-0 z-10 [text-shadow:0_0_1px_rgba(0,0,0,0.9),0_0_2px_rgba(0,0,0,0.8),0_1px_2px_rgba(0,0,0,0.7)]";

  const barInner =
    isBalanced ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Balanced</span>
      </div>
    ) : (
      <>
        {isHomeEdge ? (
          <div
            className="absolute top-0 left-0 h-full transition-all duration-300"
            style={{
              left: `${50 - pct}%`,
              width: `${pct}%`,
              backgroundColor: "rgb(30 64 175)",
            }}
          />
        ) : (
          <div
            className="absolute top-0 right-0 h-full transition-all duration-300"
            style={{
              left: "50%",
              width: `${pct}%`,
              backgroundColor: "rgb(124 58 237)",
            }}
          />
        )}
        <div className={`${barTextClass} left-0 right-1/2 justify-end pr-2`} style={{ width: "50%" }}>
          <span className="truncate pl-2" title={fixture.homeName}>
            {fixture.homeName}
          </span>
        </div>
        <div className={`${barTextClass} left-1/2 right-0 justify-start pl-2`} style={{ left: "50%", width: "50%" }}>
          <span className="truncate pr-2" title={fixture.awayName}>
            {fixture.awayName}
          </span>
        </div>
      </>
    );

  return (
    <Link
      key={`${fixture.homeTeamId}-${fixture.awayTeamId}`}
      href={fixture.href}
      className="block rounded-lg transition-opacity hover:opacity-90 focus:opacity-90 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900"
    >
      <div
        className="relative isolate h-10 w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
        style={{ contain: "paint" }}
      >
        <div
          className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-px bg-neutral-400 dark:bg-neutral-500 z-[5]"
          aria-hidden
        />
        {barInner}
      </div>
    </Link>
  );
}
