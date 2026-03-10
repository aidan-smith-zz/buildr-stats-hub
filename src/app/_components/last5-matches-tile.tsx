"use client";

import { useEffect, useState } from "react";
import type { FixtureStatsResponse } from "@/lib/statsService";

type BetFilter = "over15" | "over25" | "btts";

type Props = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  homeCrest: string | null;
  awayCrest: string | null;
};

function CrestOrPlaceholder({
  crestUrl,
  alt,
}: {
  crestUrl: string | null;
  alt: string;
}) {
  const sizeClass = "h-5 w-5 flex-shrink-0";
  if (crestUrl) {
    return (
      <img
        src={crestUrl}
        alt=""
        width={20}
        height={20}
        className={`${sizeClass} rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700 dark:bg-neutral-900`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded-sm bg-neutral-200 dark:bg-neutral-700`}
      aria-hidden
    />
  );
}

export function Last5MatchesTile({
  fixtureId,
  homeName,
  awayName,
  homeCrest,
  awayCrest,
}: Props) {
  const [stats, setStats] = useState<FixtureStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [betFilter, setBetFilter] = useState<BetFilter>("over15");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStats(null);
    fetch(`/api/fixtures/${fixtureId}/stats`, { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FixtureStatsResponse | null) => {
        if (!cancelled) setStats(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  if (loading || !stats?.last5Goals) return null;
  const { home: homeMatches, away: awayMatches } = stats.last5Goals;
  if (homeMatches.length === 0 && awayMatches.length === 0) return null;

  const teams = [
    { key: "home" as const, name: homeName, crest: homeCrest, matches: homeMatches },
    { key: "away" as const, name: awayName, crest: awayCrest, matches: awayMatches },
  ];

  return (
    <section className="mt-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 text-xs dark:border-neutral-700 dark:bg-neutral-900/70 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300 sm:text-xs">
            Last 5 matches
          </h2>
          <p className="text-[0.7rem] text-neutral-600 dark:text-neutral-400 sm:text-xs">
            See how often over 1.5 goals, over 2.5 goals and both teams to score (BTTS) have landed in each team&apos;s last 5 matches for quick bet builder stats.
          </p>
          <p className="mt-0.5 text-[0.7rem] text-neutral-500 dark:text-neutral-500 sm:text-xs">
            Green = selection landed, red = did not. Left to right: oldest → latest.
          </p>
        </div>
        <div className="inline-flex rounded-md bg-white p-0.5 text-[0.7rem] shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-700 sm:text-xs">
          {[
            { id: "over15" as const, label: "Over 1.5 goals" },
            { id: "over25" as const, label: "Over 2.5 goals" },
            { id: "btts" as const, label: "Both teams score" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setBetFilter(option.id)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition-colors ${
                betFilter === option.id
                  ? "bg-green-600 text-white shadow-sm dark:bg-green-500"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
              aria-pressed={betFilter === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-2.5 sm:mt-4">
        {teams.map((team) => (
          <div key={team.key} className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <CrestOrPlaceholder crestUrl={team.crest} alt={team.name} />
              <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100 sm:text-sm">
                {team.name}
              </span>
            </div>
            <div className="flex flex-1 justify-end gap-1.5 sm:gap-2">
              {[...team.matches].slice().reverse().map((match, index) => {
                const totalGoals = match.goalsFor + match.goalsAgainst;
                const landed =
                  betFilter === "over15"
                    ? totalGoals >= 2
                    : betFilter === "over25"
                      ? totalGoals >= 3
                      : match.goalsFor > 0 && match.goalsAgainst > 0;
                const colorClass = landed
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : "bg-red-400 dark:bg-red-500";
                const title =
                  `${team.name} ${match.goalsFor}-${match.goalsAgainst} (${totalGoals} goals) – ` +
                  (landed ? "selection landed" : "selection did not land");
                return (
                  <span
                    key={index}
                    className={`h-3 w-3 rounded-sm sm:h-3.5 sm:w-3.5 ${colorClass}`}
                    title={title}
                    aria-label={title}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
