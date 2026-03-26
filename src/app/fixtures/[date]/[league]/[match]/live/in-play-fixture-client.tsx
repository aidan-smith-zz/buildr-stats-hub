"use client";

import { useEffect, useState } from "react";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { isTeamStatsOnlyLeague, getStandingsSlug } from "@/lib/leagues";
import { copyToClipboard } from "@/app/_components/share-url-button";
import type { MatchStatsSnapshot } from "@/lib/matchStats";
import type { FixtureSummary } from "@/lib/statsService";
import type { FixtureStatsResponse } from "@/lib/statsService";
import { decodeHtmlEntities } from "@/lib/text";
import { MatchStatsBlock } from "../match-stats-block";

const FIXTURES_TZ = "Europe/London";

const LIVE_FINISHED = new Set(["FT", "AET", "PEN", "ABD", "AWD", "WO", "CAN"]);

function lineupPositionOrder(position: string | null, shirtNumber: number | null): number {
  if (!position || position.trim() === "") {
    if (shirtNumber === 1 || shirtNumber === 13) return 0;
    return 4;
  }
  const p = position.toLowerCase().trim();
  if (p.includes("goalkeeper") || p === "g" || p === "gk") return 0;
  if (p.includes("defender") || p === "d" || ["cb", "lb", "rb", "lwb", "rwb"].some((x) => p.includes(x))) return 1;
  if (p.includes("midfielder") || p === "m" || ["cm", "dm", "lm", "rm", "am", "cdm", "cam"].some((x) => p.includes(x))) return 2;
  if (p.includes("forward") || p.includes("attacker") || p === "f" || p === "s" || ["st", "cf", "lw", "rw", "ss"].some((x) => p.includes(x))) return 3;
  return 4;
}

function TeamCrestOrShirt({
  crestUrl,
  alt,
  size = "lg",
}: {
  crestUrl: string | null;
  alt: string;
  size?: "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-10 w-10";
  const px = size === "lg" ? 80 : 40;
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
      <svg className={size === "lg" ? "h-12 w-12 sm:h-16 sm:w-16" : "h-7 w-7"} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.5a1.5 1.5 0 0 0-1.5 1.5v1.2L8 6.5v2l-2 1.5v11h12v-11l-2-1.5v-2l-2.5-2.5V4a1.5 1.5 0 0 0-1.5-1.5zM6 8h2v11H6V8zm10 0h2v11h-2V8z" />
      </svg>
    </span>
  );
}

type LiveScore = {
  homeGoals: number;
  awayGoals: number;
  elapsedMinutes: number | null;
  statusShort: string;
};

type Props = {
  fixtureId: number;
  dateKey: string;
  leagueSlug: string;
  matchSlugParam: string;
  fixture: FixtureSummary;
};

export function InPlayFixtureClient({ fixtureId, dateKey, leagueSlug, matchSlugParam, fixture }: Props) {
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [matchStats, setMatchStats] = useState<{ home: MatchStatsSnapshot; away: MatchStatsSnapshot } | null>(null);
  const [stats, setStats] = useState<FixtureStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lineupTab, setLineupTab] = useState<"home" | "away">("home");
  const [shareLabel, setShareLabel] = useState<"Share" | "…" | "Copied!" | "Shared!">("Share");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lineupBust = Math.floor(Date.now() / 1000);
        const [liveRes, statsRes] = await Promise.all([
          fetch(`/api/fixtures/${fixtureId}/live`, { cache: "no-store" }),
          fetch(`/api/fixtures/${fixtureId}/stats?lineup_check=${lineupBust}`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          }),
        ]);
        if (cancelled) return;
        const liveJson = await liveRes.json();
        const statsJson = statsRes.ok ? await statsRes.json() : null;
        if (liveJson.live && liveJson.homeGoals != null && liveJson.awayGoals != null) {
          setLiveScore({
            homeGoals: liveJson.homeGoals,
            awayGoals: liveJson.awayGoals,
            elapsedMinutes: liveJson.elapsedMinutes ?? null,
            statusShort: liveJson.statusShort ?? "?",
          });
        }
        const ms = liveJson.matchStats as { home?: MatchStatsSnapshot; away?: MatchStatsSnapshot } | undefined;
        if (ms?.home && ms?.away) {
          setMatchStats({ home: ms.home, away: ms.away });
        }
        if (statsJson) setStats(statsJson);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  const homeName = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const awayName = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const isEnded = liveScore != null && LIVE_FINISHED.has(liveScore.statusShort);
  const isInPlay = liveScore != null && !isEnded;
  const flashClass = isInPlay ? "match-live-flash" : "";

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-400" />
      </div>
    );
  }

  const kickoffDate = fixture.date ? new Date(fixture.date) : null;
  const kickoffTime =
    kickoffDate && !Number.isNaN(kickoffDate.getTime())
      ? kickoffDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FIXTURES_TZ })
      : null;
  // If we have no live score but kickoff is in the past (e.g. fetch failed at HT), show "Started" not "Kick-off"
  const matchHasStarted = kickoffDate != null && !Number.isNaN(kickoffDate.getTime()) && kickoffDate.getTime() <= Date.now();

  const scoreLabel =
    liveScore != null
      ? `${liveScore.homeGoals} – ${liveScore.awayGoals}`
      : matchHasStarted
        ? "–"
        : null;
  const timeLabel =
    liveScore != null
      ? liveScore.elapsedMinutes != null
        ? `${liveScore.elapsedMinutes}'`
        : liveScore.statusShort
      : "–";

  const homeCrest = stats?.fixture?.homeTeam?.crestUrl ?? null;
  const awayCrest = stats?.fixture?.awayTeam?.crestUrl ?? null;

  const kickoffLabel =
    kickoffTime != null
      ? isInPlay || isEnded || matchHasStarted
        ? `Started ${kickoffTime}`
        : `Kick-off ${kickoffTime}`
      : null;

  const handleShare = async () => {
    setShareLabel("…");
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) {
      setShareLabel("Share");
      return;
    }
    const title = `${homeName} vs ${awayName} Live | statsBuildr`;
    const text = "Live score and lineups.";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url, text });
        setShareLabel("Shared!");
      } else {
        const copied = copyToClipboard(url);
        setShareLabel(copied ? "Copied!" : "Share");
      }
    } catch {
      const copied = copyToClipboard(url);
      setShareLabel(copied ? "Copied!" : "Share");
    }
    setTimeout(() => setShareLabel("Share"), 2000);
  };

  const fullStatsHref = `/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
  const standingsSlug = getStandingsSlug(fixture.leagueId ?? null, leagueSlug);

  return (
    <div className="space-y-6">
      {/* Heading tile – same as dashboard */}
      <header
        className={`rounded-t-xl rounded-b-none border border-b-0 border-neutral-200 bg-white px-3 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6 sm:py-6 ${flashClass}`}
      >
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <TeamCrestOrShirt crestUrl={homeCrest} alt={homeName} size="lg" />
            <div className="flex min-w-0 shrink flex-col items-center gap-1">
              <p className="min-w-0 shrink text-center text-xl font-semibold text-neutral-900 dark:text-neutral-50 md:text-2xl lg:text-3xl">
                {homeName}
                <span className="mx-2 text-neutral-400">vs</span>
                {awayName}
              </p>
              {scoreLabel != null && (
                <span className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 md:text-3xl">
                  {scoreLabel}
                </span>
              )}
            </div>
            <TeamCrestOrShirt crestUrl={awayCrest} alt={awayName} size="lg" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-xs text-neutral-600 dark:text-neutral-400 sm:text-sm">
            {kickoffLabel != null && (
              <>
                <span>{kickoffLabel}</span>
                <span className="text-neutral-300 dark:text-neutral-600" aria-hidden> | </span>
              </>
            )}
            <span className={isInPlay ? "font-semibold text-green-600 dark:text-green-400" : ""}>
              {timeLabel}
            </span>
            <span className="text-neutral-300 dark:text-neutral-600" aria-hidden> | </span>
            {standingsSlug ? (
              <NavLinkWithOverlay
                href={`/leagues/${standingsSlug}/standings`}
                className="hover:underline focus:underline"
                message="Loading league table…"
              >
                {fixture.league ?? "League"}
              </NavLinkWithOverlay>
            ) : (
              <span>{fixture.league ?? "League"}</span>
            )}
            <span className="text-neutral-300 dark:text-neutral-600" aria-hidden> | </span>
            <span className={isInPlay ? "font-medium text-green-500 dark:text-green-400" : "font-medium text-neutral-500 dark:text-neutral-400"}>
              {isEnded ? "Full time" : isInPlay ? "Live" : matchHasStarted ? "Score updating…" : "Not in play"}
            </span>
            <span className="text-neutral-300 dark:text-neutral-600" aria-hidden> | </span>
            <button
              type="button"
              onClick={handleShare}
              disabled={shareLabel === "…"}
              aria-busy={shareLabel === "…"}
              className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              {shareLabel}
            </button>
          </div>
        </div>
      </header>

      {matchStats != null && (
        <section
          className={`rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6 ${flashClass}`}
          aria-label="Match statistics"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {isEnded ? "Full-time statistics" : "In-play statistics"}
            </p>
            {isInPlay ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.35)]" />
                Live
              </span>
            ) : null}
          </div>
          <MatchStatsBlock
            homeLabel={homeName}
            awayLabel={awayName}
            home={matchStats.home}
            away={matchStats.away}
            heading={null}
          />
        </section>
      )}

      {/* Lineup tile – hidden for team-stats-only leagues (e.g. League One/Two) */}
      {!isTeamStatsOnlyLeague(fixture.leagueId ?? null) && stats?.hasLineup && stats.teams?.length >= 2 && (
        <section className={`rounded-b-xl border border-t-0 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6 p-4 ${flashClass}`}>
          <header className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Team lineups
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Starting XI and substitutes
            </p>
          </header>
          <div className="mt-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex gap-1" role="tablist" aria-label="Lineup team">
              <button
                type="button"
                role="tab"
                aria-selected={lineupTab === "home"}
                onClick={() => setLineupTab("home")}
                className={`rounded-t-lg border border-b-0 px-4 py-3 text-sm font-medium transition-colors ${
                  lineupTab === "home"
                    ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                    : "border-transparent bg-neutral-100/50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-800/50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                }`}
              >
                {stats.teams[0]?.teamShortName ?? stats.teams[0]?.teamName ?? "Home"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={lineupTab === "away"}
                onClick={() => setLineupTab("away")}
                className={`rounded-t-lg border border-b-0 px-4 py-3 text-sm font-medium transition-colors ${
                  lineupTab === "away"
                    ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                    : "border-transparent bg-neutral-100/50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-800/50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
                }`}
              >
                {stats.teams[1]?.teamShortName ?? stats.teams[1]?.teamName ?? "Away"}
              </button>
            </div>
          </div>
          <div className="rounded-b-lg border border-t-0 border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/80">
            {(() => {
              const team = stats.teams[lineupTab === "home" ? 0 : 1];
              if (!team?.players?.length) return <p className="text-sm text-neutral-500">No lineup data</p>;
              const starting = team.players
                .filter((p) => p.lineupStatus === "starting")
                .sort(
                  (a, b) =>
                    lineupPositionOrder(a.position, a.shirtNumber) - lineupPositionOrder(b.position, b.shirtNumber) ||
                    (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
                );
              const subs = team.players
                .filter((p) => p.lineupStatus === "substitute")
                .sort(
                  (a, b) =>
                    lineupPositionOrder(a.position, a.shirtNumber) - lineupPositionOrder(b.position, b.shirtNumber) ||
                    (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99),
                );
              return (
                <>
                  <ul className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                    {starting.map((p) => (
                      <li key={p.playerId} className="flex items-baseline gap-2">
                        <span className={`w-6 shrink-0 tabular-nums ${p.shirtNumber != null ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"}`}>
                          {p.shirtNumber ?? "·"}
                        </span>
                        <span>
                          {decodeHtmlEntities(p.name)}
                          {p.position ? ` (${p.position})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {subs.length > 0 && (
                    <>
                      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Substitutes
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {subs.map((p) => (
                          <li key={p.playerId} className="flex items-baseline gap-2">
                            <span className={`w-6 shrink-0 tabular-nums ${p.shirtNumber != null ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"}`}>
                              {p.shirtNumber ?? "·"}
                            </span>
                            <span>
                              {decodeHtmlEntities(p.name)}
                              {p.position ? ` (${p.position})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </section>
      )}

      {!isTeamStatsOnlyLeague(fixture.leagueId ?? null) && !stats?.hasLineup && !loading && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Lineup data is not available for this fixture yet.
          </p>
        </section>
      )}

      {/* Full stats CTA – no extra API, links to existing match page */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
        <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-50">
          View full match stats
        </p>
        <p className="mb-4 text-xs text-neutral-600 dark:text-neutral-400">
          Season form, player stats, AI insights and more.
        </p>
        <NavLinkWithOverlay
          href={fullStatsHref}
          message="Loading…"
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Full stats →
        </NavLinkWithOverlay>
      </section>
    </div>
  );
}
