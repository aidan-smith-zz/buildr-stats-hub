"use client";

import { useEffect, useState } from "react";
import type { FixtureSummary, FixtureStatsResponse } from "@/lib/statsService";

type Props = {
  fixtures: FixtureSummary[];
};

export function TodayFixturesDashboard({ fixtures }: Props) {
  // Filter fixtures to only show La Liga
  const laLigaFixtures = fixtures.filter(
    (fixture) => fixture.league?.toLowerCase().includes("la liga")
  );
  
  const [selectedId, setSelectedId] = useState<string>(
    laLigaFixtures[0] ? String(laLigaFixtures[0].id) : "",
  );
  const [stats, setStats] = useState<FixtureStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update selectedId if current selection is not in La Liga fixtures
  useEffect(() => {
    if (selectedId && !laLigaFixtures.some(f => String(f.id) === selectedId)) {
      setSelectedId(laLigaFixtures[0] ? String(laLigaFixtures[0].id) : "");
    }
  }, [laLigaFixtures, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      return;
    }

    let cancelled = false;

    async function loadStats() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/fixtures/${selectedId}/stats`, {
          cache: "no-store",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load stats");
        }

        const data = (await res.json()) as FixtureStatsResponse;

        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setStats(null);
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (laLigaFixtures.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No La Liga fixtures found for today.
        </p>
      </div>
    );
  }

  const selectedFixture = laLigaFixtures.find(f => String(f.id) === selectedId);

  return (
    <div className="space-y-6">
      {/* Fixture Selector */}
      <div className="space-y-2">
        <label
          htmlFor="fixture-select"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Select Fixture
        </label>
        <select
          id="fixture-select"
          className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition-all hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-600 dark:focus:border-neutral-500"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {laLigaFixtures.map((fixture) => {
            const label = `${
              fixture.homeTeam.shortName ?? fixture.homeTeam.name
            } vs ${fixture.awayTeam.shortName ?? fixture.awayTeam.name}`;

            return (
              <option key={fixture.id} value={fixture.id}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      {/* Selected Fixture Info */}
      {selectedFixture && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {selectedFixture.league ?? "League"}
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50 sm:text-xl">
                <span>{selectedFixture.homeTeam.shortName ?? selectedFixture.homeTeam.name}</span>
                <span className="text-neutral-400">vs</span>
                <span>{selectedFixture.awayTeam.shortName ?? selectedFixture.awayTeam.name}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-right text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
              <div className="space-y-0.5">
                <div>
                  {new Date(selectedFixture.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="font-medium text-neutral-900 dark:text-neutral-50">
                  {new Date(selectedFixture.date).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 font-medium dark:bg-neutral-800">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
                {selectedFixture.status}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-400"></div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Loading stats…
              </p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && stats && (
          <div className="space-y-6">
            <header className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Season Statistics
              </h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {stats.fixture.league ?? "League"} · Season {stats.fixture.season} · Sorted by minutes played
              </p>
            </header>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {stats.teams.map((team) => {
                const maxScore =
                  team.players.length === 0
                    ? 0
                    : Math.max(
                        ...team.players.map(
                          (p) => p.goals * 4 + p.assists * 3 + p.shots,
                        ),
                      );

                return (
                  <div
                    key={team.teamId}
                    className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-50/50 p-5 dark:border-neutral-800 dark:bg-neutral-900/50"
                  >
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                      {team.teamShortName ?? team.teamName}
                    </h3>
                    <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-2">
                      {team.players.length === 0 ? (
                        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            No player statistics available for this team.
                          </p>
                        </div>
                      ) : (
                        team.players.map((player) => {
                          const score =
                            player.goals * 4 + player.assists * 3 + player.shots;
                          const isTop = maxScore > 0 && score === maxScore;

                          return (
                            <div
                              key={player.playerId}
                              className={`group rounded-lg border px-4 py-3 transition-all hover:shadow-sm ${
                                isTop
                                  ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/30"
                                  : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">
                                      {player.name}
                                    </h4>
                                    {isTop && (
                                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                        Top
                                      </span>
                                    )}
                                  </div>
                                  {player.position && (
                                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                      {player.position}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
                                  <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                                    <span className="text-neutral-900 dark:text-neutral-50">{player.goals}</span>
                                    <span className="mx-1 text-neutral-400">G</span>
                                    <span className="text-neutral-900 dark:text-neutral-50">{player.assists}</span>
                                    <span className="mx-1 text-neutral-400">A</span>
                                  </div>
                                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                                    {player.shots} Sh · {player.shotsOnTarget} SoT · {player.minutes} MP
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 pt-2 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">SoT:</span>
                                  <span>{player.shotsOnTarget}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Fouls:</span>
                                  <span>{player.fouls}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">YC:</span>
                                  <span>{player.yellowCards}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">RC:</span>
                                  <span>{player.redCards}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Apps:</span>
                                  <span>{player.appearances}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && !error && !stats && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900/50">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Select a fixture above to view season statistics for both teams.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
