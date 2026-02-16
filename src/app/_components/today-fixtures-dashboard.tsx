"use client";

import { useEffect, useState } from "react";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import type { FixtureSummary, FixtureStatsResponse } from "@/lib/statsService";

type Props = {
  fixtures: FixtureSummary[];
};

type PlayerSortKey = keyof FixtureStatsResponse["teams"][number]["players"][number];
const SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: "goals", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "appearances", label: "Appearances" },
  { value: "tackles", label: "Tackles" },
  { value: "yellowCards", label: "Yellow cards" },
  { value: "redCards", label: "Red cards" },
  { value: "fouls", label: "Fouls" },
  { value: "shots", label: "Shots" },
  { value: "shotsOnTarget", label: "Shots on target" },
];

function TeamCrestOrShirt({ crestUrl, alt }: { crestUrl: string | null; alt: string }) {
  const size = 40;
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt={alt}
        width={size}
        height={size}
        className="h-10 w-10 object-contain"
      />
    );
  }
  return (
    <span
      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-sm bg-black text-white"
      title={alt}
      aria-label={alt}
    >
      <ShirtIcon className="h-7 w-7" />
    </span>
  );
}

function ShirtIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {/* Plain football shirt / jersey shape: body + neck + sleeves */}
      <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
    </svg>
  );
}

export function TodayFixturesDashboard({ fixtures }: Props) {
  const filteredFixtures = fixtures
    .filter(
      (fixture) =>
        fixture.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(fixture.leagueId),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const [selectedId, setSelectedId] = useState<string>(
    filteredFixtures[0] ? String(filteredFixtures[0].id) : "",
  );
  const [stats, setStats] = useState<FixtureStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<PlayerSortKey>("goals");
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<number>>(new Set());
  const [shareLabel, setShareLabel] = useState<"Share" | "Copied!" | "Shared!">("Share");

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = "Football stats | statsBuildr";
    const text = "Check today's fixtures and player stats before you build your bet.";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url, text });
        setShareLabel("Shared!");
      } else {
        await navigator.clipboard?.writeText(url);
        setShareLabel("Copied!");
      }
    } catch {
      try {
        await navigator.clipboard?.writeText(url);
        setShareLabel("Copied!");
      } catch {
        setShareLabel("Share");
      }
    }
    setTimeout(() => setShareLabel("Share"), 2000);
  };

  // Reset accordion when fixture changes
  useEffect(() => {
    setExpandedTeamIds(new Set());
  }, [selectedId]);

  const toggleTeam = (teamId: number) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  // Update selectedId if current selection is not in filtered list
  useEffect(() => {
    if (selectedId && !filteredFixtures.some(f => String(f.id) === selectedId)) {
      setSelectedId(filteredFixtures[0] ? String(filteredFixtures[0].id) : "");
    }
  }, [filteredFixtures, selectedId]);

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

  if (filteredFixtures.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No fixtures found for today for the selected leagues.
        </p>
      </div>
    );
  }

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
          {filteredFixtures.map((fixture) => {
            const d = new Date(fixture.date);
            const dateStr = d.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            });
            const koTime = d.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            const label = `${fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs ${fixture.awayTeam.shortName ?? fixture.awayTeam.name} · ${dateStr} · ${koTime}`;

            return (
              <option key={fixture.id} value={fixture.id}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      {/* Fixture details tile */}
      {(() => {
        const selectedFixture = filteredFixtures.find((f) => String(f.id) === selectedId);
        if (!selectedFixture) return null;

        const koDate = new Date(selectedFixture.date);
        const koTime = koDate.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        // Use kick-off time: if KO is in the past, game has started (stored status can be stale from fetch)
        const isNotStarted = koDate > new Date();
        const statusLabel = isNotStarted ? "Not started" : "Started";

        return (
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium text-neutral-900 dark:text-neutral-50">
                {selectedFixture.homeTeam.shortName ?? selectedFixture.homeTeam.name}
              </span>
              <span className="text-neutral-400">vs</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-50">
                {selectedFixture.awayTeam.shortName ?? selectedFixture.awayTeam.name}
              </span>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-neutral-600 dark:text-neutral-400">{koTime}</span>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-neutral-600 dark:text-neutral-400">
                {selectedFixture.league ?? "League"}
              </span>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span
                className={
                  isNotStarted
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "font-medium text-green-500 dark:text-green-400"
                }
              >
                {statusLabel}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Stats Section */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-400"></div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Loading stats...
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
            <header className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-neutral-800">
              <div className="flex flex-1 flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    Player Statistics
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    Season {stats.fixture.season}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TeamCrestOrShirt crestUrl={stats.fixture.homeTeam.crestUrl} alt={stats.fixture.homeTeam.shortName ?? stats.fixture.homeTeam.name} />
                  <TeamCrestOrShirt crestUrl={stats.fixture.awayTeam.crestUrl} alt={stats.fixture.awayTeam.shortName ?? stats.fixture.awayTeam.name} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="stats-sort" className="whitespace-nowrap text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  View by
                </label>
                <select
                  id="stats-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as PlayerSortKey)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {stats.teams.map((team) => {
                const sortedPlayers = [...team.players].sort(
                  (a, b) => (Number(b[sortBy]) ?? 0) - (Number(a[sortBy]) ?? 0)
                );

                const isExpanded = expandedTeamIds.has(team.teamId);
                const playerCount = sortedPlayers.length;

                return (
                  <div
                    key={team.teamId}
                    className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/50"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTeam(team.teamId)}
                      className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left transition-colors hover:bg-neutral-100/80 dark:hover:bg-neutral-800/50"
                      aria-expanded={isExpanded}
                    >
                      <span className="text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                        {team.teamShortName ?? team.teamName}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {playerCount} player{playerCount !== 1 ? "s" : ""}
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </button>
                    {isExpanded && (
                    <div className="flex max-h-96 flex-col gap-2 overflow-y-auto border-t border-neutral-200 px-5 pb-5 pt-2 dark:border-neutral-800">
                      {sortedPlayers.length === 0 ? (
                        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            No player statistics available for this team.
                          </p>
                        </div>
                      ) : (
                        sortedPlayers.map((player, index) => {
                          const isTop = index === 0;
                          const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy;
                          const sortValue = player[sortBy];
                          const numValue = Number(sortValue) ?? 0;
                          const minutes = player.minutes ?? 0;
                          const per90 = minutes > 0 ? (numValue / minutes) * 90 : 0;
                          const per90Label = `${sortLabel}/90`;

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
                                    <span className="text-neutral-900 dark:text-neutral-50">
                                      {minutes > 0 ? per90.toFixed(2) : "0.00"}
                                    </span>
                                    <span className="ml-1 text-neutral-400">{per90Label}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                                <span className="font-medium">Total {sortLabel}:</span>{" "}
                                <span className="text-neutral-900 dark:text-neutral-50">{Number(sortValue) ?? 0}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                Share these stats:
              </p>
              <button
                type="button"
                onClick={handleShare}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {shareLabel}
              </button>
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
