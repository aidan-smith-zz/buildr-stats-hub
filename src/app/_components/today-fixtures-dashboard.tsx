"use client";

import { useEffect, useState } from "react";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import type { FixtureSummary, FixtureStatsResponse } from "@/lib/statsService";

type Props = {
  fixtures: FixtureSummary[];
  /** When set (e.g. from /fixtures/[date]/[league]/[match]), open with this fixture selected */
  initialSelectedId?: string | null;
  /** When true, hide the fixture dropdown and show match details as a header (single-match page) */
  hideFixtureSelector?: boolean;
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

/** statusShort values from live API that mean the match is finished */
const LIVE_FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function TeamCrestOrShirt({
  crestUrl,
  alt,
  size = "md",
}: {
  crestUrl: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "sm" ? 24 : size === "lg" ? 80 : 40;
  const sizeClass = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-10 w-10";
  const iconClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-12 w-12 sm:h-16 sm:w-16" : "h-7 w-7";
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt={alt}
        width={px}
        height={px}
        className={`${sizeClass} flex-shrink-0 object-contain`}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${sizeClass} flex-shrink-0 items-center justify-center rounded-sm bg-black text-white`}
      title={alt}
      aria-label={alt}
    >
      <ShirtIcon className={iconClass} />
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

export function TodayFixturesDashboard({ fixtures, initialSelectedId, hideFixtureSelector }: Props) {
  const filteredFixtures = fixtures
    .filter(
      (fixture) =>
        fixture.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(fixture.leagueId),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const initialId =
    initialSelectedId && filteredFixtures.some((f) => String(f.id) === initialSelectedId)
      ? initialSelectedId
      : filteredFixtures[0]
        ? String(filteredFixtures[0].id)
        : "";
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [stats, setStats] = useState<FixtureStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<PlayerSortKey>("goals");
  const [activeTab, setActiveTab] = useState<"home" | "away">("home");
  const [shareLabel, setShareLabel] = useState<"Share" | "Copied!" | "Shared!">("Share");
  const [teamStatsView, setTeamStatsView] = useState<"season" | "last5">("season");
  const [liveScore, setLiveScore] = useState<{
    homeGoals: number;
    awayGoals: number;
    elapsedMinutes: number | null;
    statusShort: string;
  } | null>(null);

  useEffect(() => {
    if (hideFixtureSelector && typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [hideFixtureSelector]);

  const handleShare = async () => {
    let url = typeof window !== "undefined" ? window.location.href : "";
    const selectedFixture = selectedId ? filteredFixtures.find((f) => String(f.id) === selectedId) : null;
    if (typeof window !== "undefined" && selectedFixture) {
      const dateKey = new Date(selectedFixture.date).toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      });
      const leagueSlug = leagueToSlug(selectedFixture.league);
      const homeName = selectedFixture.homeTeam.shortName ?? selectedFixture.homeTeam.name;
      const awayName = selectedFixture.awayTeam.shortName ?? selectedFixture.awayTeam.name;
      const match = matchSlug(homeName, awayName);
      url = `${window.location.origin}/fixtures/${dateKey}/${leagueSlug}/${match}`;
    }
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

  // Reset to home tab when fixture changes
  useEffect(() => {
    setActiveTab("home");
  }, [selectedId]);

  // Sync from URL when initialSelectedId changes (e.g. client nav to another match)
  useEffect(() => {
    if (initialSelectedId && filteredFixtures.some((f) => String(f.id) === initialSelectedId)) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId, filteredFixtures]);

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

  // Live score: fetch once on load/refresh when match has started or ended (no polling). Pre-match 0-0 shown locally; ended returns cached FT from server.
  useEffect(() => {
    if (!selectedId || !stats || String(stats.fixture.id) !== selectedId) {
      setLiveScore(null);
      return;
    }
    const koDate = new Date(stats.fixture.date);
    const now = new Date();
    const isNotStarted = koDate > now;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const isEnded = !isNotStarted && now.getTime() - koDate.getTime() >= twoHoursMs;
    const isLive = !isNotStarted && !isEnded;

    if (isNotStarted) {
      setLiveScore(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/fixtures/${selectedId}/live`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.live && data.homeGoals != null && data.awayGoals != null) {
          setLiveScore({
            homeGoals: data.homeGoals,
            awayGoals: data.awayGoals,
            elapsedMinutes: data.elapsedMinutes ?? null,
            statusShort: data.statusShort ?? (isEnded ? "FT" : "LIVE"),
          });
        } else {
          setLiveScore(null);
        }
      } catch {
        if (!cancelled) setLiveScore(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, stats]);

  if (filteredFixtures.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No fixtures found for today for the selected leagues.
        </p>
      </div>
    );
  }

  const selectedFixture = selectedId ? filteredFixtures.find((f) => String(f.id) === selectedId) : null;
  const showMatchContent = selectedFixture && !loading && !error && stats;
  const isHeaderMode = hideFixtureSelector && selectedFixture;

  return (
    <div className="space-y-6">
      {!hideFixtureSelector && (
        <>
          {/* Fixture Selector – only on pages that list multiple fixtures */}
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
        </>
      )}

      {/* Match details – tile or header (when hideFixtureSelector) */}
      {selectedId && selectedFixture && (() => {
        const showContent = !loading && !error && stats;
        if (!showContent) {
          return (
            <div
              className={
                isHeaderMode
                  ? "rounded-t-xl border border-b-0 border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 min-h-[4rem] flex items-center justify-center sm:px-6 sm:py-5"
                  : "rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 min-h-[4rem] flex items-center justify-center"
              }
            >
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-400" />
                  <p className="text-sm text-neutral-600 dark:text-neutral-400"><i>Building your Stats</i></p>
                </div>
              ) : (
                <span className="sr-only">Match info will appear when stats have loaded</span>
              )}
            </div>
          );
        }

        const koDate = new Date(selectedFixture.date);
        const now = new Date();
        const koTime = koDate.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const isNotStarted = koDate > now;
        const isEnded = liveScore != null && LIVE_FINISHED_STATUSES.has(liveScore.statusShort);
        const isLive = !isNotStarted && !isEnded;
        const tenMinMs = 10 * 60 * 1000;
        const isPreMatch = isNotStarted && now.getTime() >= koDate.getTime() - tenMinMs;
        const statusLabel = isNotStarted ? "Not started" : isEnded ? "Ended" : "Started";

        const homeName = selectedFixture.homeTeam.shortName ?? selectedFixture.homeTeam.name;
        const awayName = selectedFixture.awayTeam.shortName ?? selectedFixture.awayTeam.name;

        const timeOrMinutes =
          isPreMatch
            ? koTime
            : (isLive || isEnded) && liveScore
              ? liveScore.elapsedMinutes != null
                ? `${liveScore.elapsedMinutes}'`
                : liveScore.statusShort
              : koTime;
        const scoreLabel =
          isPreMatch
            ? "0 – 0"
            : (isLive || isEnded) && liveScore
              ? `${liveScore.homeGoals} – ${liveScore.awayGoals}`
              : null;

        return (
          <header
            className={
              isHeaderMode
                ? `rounded-t-xl rounded-b-none border border-b-0 border-neutral-200 bg-white px-3 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-6 ${isLive ? "match-live-flash" : ""}`
                : "rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            }
          >
            {isHeaderMode ? (
              <div className="flex flex-col items-center gap-3 sm:gap-4">
                {/* Mobile: crests + score, then team names */}
                <div className="flex w-full flex-col items-center gap-3 sm:hidden">
                  <div className="flex items-center justify-center gap-4">
                    <TeamCrestOrShirt
                      crestUrl={stats!.fixture.homeTeam.crestUrl}
                      alt={homeName}
                      size="md"
                    />
                    {scoreLabel != null ? (
                      <span className="min-w-[4rem] text-center text-xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                        {scoreLabel}
                      </span>
                    ) : (
                      <span className="min-w-[4rem] text-center text-lg text-neutral-400">–</span>
                    )}
                    <TeamCrestOrShirt
                      crestUrl={stats!.fixture.awayTeam.crestUrl}
                      alt={awayName}
                      size="md"
                    />
                  </div>
                  <h1 className="max-w-full break-words text-center text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                    {homeName}
                    <span className="mx-1.5 text-neutral-400">vs</span>
                    {awayName}
                  </h1>
                </div>
                {/* sm+: one row, crest | names + score | crest */}
                <div className="hidden w-full items-center justify-between gap-4 sm:flex">
                  <TeamCrestOrShirt
                    crestUrl={stats!.fixture.homeTeam.crestUrl}
                    alt={homeName}
                    size="lg"
                  />
                  <div className="flex min-w-0 shrink flex-col items-center gap-1">
                    <h1 className="min-w-0 shrink text-center text-xl font-semibold text-neutral-900 dark:text-neutral-50 md:text-2xl lg:text-3xl">
                      {homeName}
                      <span className="mx-2 text-neutral-400">vs</span>
                      {awayName}
                    </h1>
                    {scoreLabel != null && (
                      <span className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 md:text-3xl">
                        {scoreLabel}
                      </span>
                    )}
                  </div>
                  <TeamCrestOrShirt
                    crestUrl={stats!.fixture.awayTeam.crestUrl}
                    alt={awayName}
                    size="lg"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
                  <span className={isLive ? "font-semibold text-green-600 dark:text-green-400" : ""}>
                    {timeOrMinutes}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span>{selectedFixture.league ?? "League"}</span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span
                    className={
                      isNotStarted
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : isEnded
                          ? "font-medium text-neutral-500 dark:text-neutral-400"
                          : "font-medium text-green-500 dark:text-green-400"
                    }
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3">
                  <TeamCrestOrShirt crestUrl={stats!.fixture.homeTeam.crestUrl} alt={homeName} />
                  {scoreLabel != null ? (
                    <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {scoreLabel}
                    </span>
                  ) : null}
                  <TeamCrestOrShirt crestUrl={stats!.fixture.awayTeam.crestUrl} alt={awayName} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">{homeName}</span>
                  <span className="text-neutral-400">vs</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">{awayName}</span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span className={isLive ? "font-semibold text-green-600 dark:text-green-400" : "text-neutral-600 dark:text-neutral-400"}>
                    {timeOrMinutes}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {selectedFixture.league ?? "League"}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-600">·</span>
                  <span
                    className={
                      isNotStarted
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : isEnded
                          ? "font-medium text-neutral-500 dark:text-neutral-400"
                          : "font-medium text-green-500 dark:text-green-400"
                    }
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>
            )}
          </header>
        );
      })()}

      <div className="space-y-6">
      {/* Full-page error when the stats request fails (both tiles failed to load) */}
      {selectedId && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/50 sm:p-8">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Team Stats – hide completely if request failed or no team stats. Blank while loading. */}
      {selectedId && !error && (loading || stats?.teamStats) && (
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6 p-4">
          {loading ? null : stats?.teamStats ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    Team Stats
                  </h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {teamStatsView === "season"
                      ? `Season ${stats.fixture.season} — average per match`
                      : "Last 5 matches — average per match"}
                  </p>
                </div>
                <select
                  value={teamStatsView}
                  onChange={(e) => setTeamStatsView(e.target.value as "season" | "last5")}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-neutral-500 dark:focus:ring-neutral-500"
                  aria-label="Team stats view"
                >
                  <option value="season">Season</option>
                  <option value="last5" disabled={!stats.teamStatsLast5}>
                    Last 5 matches
                  </option>
                </select>
              </header>
              <div className="overflow-x-auto rounded-b-lg border border-t-0 border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/50">
                <table className="w-full min-w-[26rem] text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/80">
                      <th className="py-3 pl-4 pr-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Team
                      </th>
                      <th className="py-3 px-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        xG
                      </th>
                      <th className="py-3 px-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Goals
                      </th>
                      <th className="py-3 px-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Conceded
                      </th>
                      <th className="py-3 px-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Corners
                      </th>
                      <th className="py-3 pr-4 pl-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Cards
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {(() => {
                      const data = teamStatsView === "last5" && stats.teamStatsLast5 ? stats.teamStatsLast5 : stats.teamStats;
                      return (
                        <>
                          <tr className="bg-white transition-colors hover:bg-neutral-50/80 dark:bg-neutral-900/80 dark:hover:bg-neutral-800/50">
                            <td className="py-3 pl-4 pr-3 font-medium text-neutral-900 dark:text-neutral-50">
                              {stats.teams[0]?.teamShortName ?? stats.teams[0]?.teamName ?? "Home"}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.home.xgPer90 != null ? data.home.xgPer90.toFixed(2) : "–"}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.home.goalsPer90.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.home.concededPer90.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.home.cornersPer90.toFixed(2)}
                            </td>
                            <td className="py-3 pr-4 pl-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.home.cardsPer90.toFixed(2)}
                            </td>
                          </tr>
                          <tr className="bg-white transition-colors hover:bg-neutral-50/80 dark:bg-neutral-900/80 dark:hover:bg-neutral-800/50">
                            <td className="py-3 pl-4 pr-3 font-medium text-neutral-900 dark:text-neutral-50">
                              {stats.teams[1]?.teamShortName ?? stats.teams[1]?.teamName ?? "Away"}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.away.xgPer90 != null ? data.away.xgPer90.toFixed(2) : "–"}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.away.goalsPer90.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.away.concededPer90.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.away.cornersPer90.toFixed(2)}
                            </td>
                            <td className="py-3 pr-4 pl-3 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                              {data.away.cardsPer90.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* Player Stats – hide completely if request failed or no player data. Blank while loading. */}
      {!error && (!selectedId || loading || (stats && stats.teams?.some((t) => (t.players?.length ?? 0) > 0))) && (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        {loading ? null : stats && stats.teams?.some((t) => (t.players?.length ?? 0) > 0) ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-neutral-800">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  Player Stats
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Season {stats.fixture.season}
                </p>
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

            {/* Home / Away tabs – stats.teams order is [home, away] */}
            <div className="border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex gap-1" role="tablist" aria-label="Team">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "home"}
                  onClick={() => setActiveTab("home")}
                  className={`rounded-t-lg border border-b-0 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === "home"
                      ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                      : "border-transparent bg-neutral-100/50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-800/50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                  }`}
                >
                  {stats.teams[0]?.teamShortName ?? stats.teams[0]?.teamName ?? "Home"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "away"}
                  onClick={() => setActiveTab("away")}
                  className={`rounded-t-lg border border-b-0 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === "away"
                      ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                      : "border-transparent bg-neutral-100/50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-800/50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                  }`}
                >
                  {stats.teams[1]?.teamShortName ?? stats.teams[1]?.teamName ?? "Away"}
                </button>
              </div>
            </div>
            <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto rounded-b-lg border border-neutral-200 border-t-0 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              {(() => {
                const teamIndex = activeTab === "home" ? 0 : 1;
                const team = stats.teams[teamIndex];
                if (!team) return null;
                const sortedPlayers = [...team.players].sort(
                  (a, b) => (Number(b[sortBy]) ?? 0) - (Number(a[sortBy]) ?? 0)
                );
                const teamCrestUrl =
                  team.teamId === stats.fixture.homeTeam.id
                    ? stats.fixture.homeTeam.crestUrl
                    : stats.fixture.awayTeam.crestUrl;
                const teamCrestAlt = team.teamShortName ?? team.teamName;

                if (sortedPlayers.length === 0) {
                  return (
                    <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900">
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        No player statistics available for this team.
                      </p>
                    </div>
                  );
                }
                return sortedPlayers.map((player, index) => {
                  const isTop = index === 0;
                  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? sortBy;
                  const displayLabel = sortBy === "shotsOnTarget" ? "SoT" : sortLabel;
                  const sortValue = player[sortBy];
                  const numValue = Number(sortValue) ?? 0;
                  const minutes = player.minutes ?? 0;
                  const per90 = minutes > 0 ? (numValue / minutes) * 90 : 0;
                  const per90Label = `${displayLabel}/90min`;
                  const lineupStatus = player.lineupStatus ?? null;
                  const hasLineup = stats.hasLineup === true;
                  const isNotInvolved = hasLineup && lineupStatus === null;

                  const lineupPill =
                    lineupStatus === "starting" ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-300">
                        STARTING
                      </span>
                    ) : lineupStatus === "substitute" ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        SUB
                      </span>
                    ) : isNotInvolved ? (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        NOT INVOLVED
                      </span>
                    ) : null;

                  return (
                    <div
                      key={player.playerId}
                      className={`group rounded-lg border px-4 py-3 transition-all hover:shadow-sm ${
                        isNotInvolved
                          ? "border-neutral-200 bg-neutral-50/80 opacity-75 dark:border-neutral-800 dark:bg-neutral-900/60"
                          : isTop
                            ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/30"
                            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-1 min-w-0 items-start gap-3">
                          <TeamCrestOrShirt
                            crestUrl={teamCrestUrl}
                            alt={teamCrestAlt}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={`font-semibold ${isNotInvolved ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-50"}`}>
                                {player.name}
                              </h4>
                              {lineupPill}
                            </div>
                            {player.position && (
                              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                                {player.position}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
                          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                            <span className={isNotInvolved ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-50"}>
                              {minutes > 0 ? per90.toFixed(2) : "0.00"}
                            </span>
                            <span className="ml-1 text-neutral-400">{per90Label}</span>
                          </div>
                        </div>
                      </div>
                      <div className={`mt-3 border-t pt-2 text-xs ${isNotInvolved ? "border-neutral-200 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400" : "border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"}`}>
                        <span className="font-medium">Total {displayLabel}:</span>{" "}
                        <span className={isNotInvolved ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-neutral-50"}>{Number(sortValue) ?? 0}</span>
                      </div>
                    </div>
                  );
                });
              })()}
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
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-800 dark:bg-neutral-900/50">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Select a fixture above to view season statistics for both teams.
            </p>
          </div>
        )}
      </section>
      )}
      </div>
    </div>
  );
}
