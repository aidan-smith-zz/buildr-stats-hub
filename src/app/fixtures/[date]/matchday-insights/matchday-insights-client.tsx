"use client";

import { useState } from "react";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import type { MatchdayInsightsData } from "@/lib/matchdayInsightsService";

type ViewPeriod = "season" | "last5";

type Props = {
  data: MatchdayInsightsData;
};

export function MatchdayInsightsClient({ data }: Props) {
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("season");

  const isLast5 = viewPeriod === "last5";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <label htmlFor="matchday-view-period" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          View by
        </label>
        <select
          id="matchday-view-period"
          value={viewPeriod}
          onChange={(e) => setViewPeriod(e.target.value as ViewPeriod)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-500"
          aria-label="View by season or last 5 games"
        >
          <option value="season">Season</option>
          <option value="last5">Last 5 games</option>
        </select>
      </div>

      {isLast5 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Team and fixture leaderboards below use last 5 games. Player leaderboards are season stats only.
        </p>
      )}

      <LeaderboardSection
        title="Top 5 players – Shots on Target per 90"
        entries={data.top5ShotsOnTargetPer90}
        valueLabel="SoT/90"
        periodLabel={isLast5 ? " (season)" : undefined}
      />
      <LeaderboardSection
        title="Top 5 players – Shots per 90"
        entries={data.top5ShotsPer90}
        valueLabel="Shots/90"
        periodLabel={isLast5 ? " (season)" : undefined}
      />
      <LeaderboardSection
        title="Top 5 players – Fouls Committed per 90"
        entries={data.top5FoulsPer90}
        valueLabel="Fouls/90"
        periodLabel={isLast5 ? " (season)" : undefined}
      />
      <FixtureXgSection
        entries={isLast5 ? data.last5.top5FixturesCombinedXg : data.top5FixturesCombinedXg}
        periodLabel={isLast5 ? " (last 5)" : undefined}
      />
      <TeamXgSection
        entries={isLast5 ? data.last5.top5TeamsXgPer90 : data.top5TeamsXgPer90}
        periodLabel={isLast5 ? " (last 5)" : undefined}
      />
      <TeamCornersSection
        entries={isLast5 ? data.last5.top5TeamsCornersPer90 : data.top5TeamsCornersPer90}
        periodLabel={isLast5 ? " (last 5)" : undefined}
      />
      <LeaderboardSection
        title="Top 5 players – Yellow or Red Cards per 90"
        entries={data.top5CardsPer90}
        valueLabel="Cards/90"
        periodLabel={isLast5 ? " (season)" : undefined}
      />
    </div>
  );
}

function LeaderboardSection({
  title,
  entries,
  valueLabel,
  periodLabel,
}: {
  title: string;
  entries: MatchdayInsightsData["top5ShotsOnTargetPer90"];
  valueLabel: string;
  periodLabel?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        {title}
        {periodLabel && <span className="font-normal text-neutral-500 dark:text-neutral-400">{periodLabel}</span>}
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.name}-${entry.teamName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.name}
                </span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {entry.teamName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.value} <span className="text-xs font-normal text-neutral-400">{valueLabel}</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FixtureXgSection({
  entries,
  periodLabel,
}: {
  entries: MatchdayInsightsData["top5FixturesCombinedXg"];
  periodLabel?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        Top 5 fixtures – Combined xG
        {periodLabel && <span className="font-normal text-neutral-500 dark:text-neutral-400">{periodLabel}</span>}
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.homeName}-${entry.awayName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="text-neutral-900 dark:text-neutral-100">
                  {entry.homeName} vs {entry.awayName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.combinedXg} <span className="text-xs font-normal text-neutral-400">xG</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamXgSection({
  entries,
  periodLabel,
}: {
  entries: MatchdayInsightsData["top5TeamsXgPer90"];
  periodLabel?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        Top 5 teams – xG per 90
        {periodLabel && <span className="font-normal text-neutral-500 dark:text-neutral-400">{periodLabel}</span>}
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.teamName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.teamName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.xgPer90} <span className="text-xs font-normal text-neutral-400">xG/90</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamCornersSection({
  entries,
  periodLabel,
}: {
  entries: MatchdayInsightsData["top5TeamsCornersPer90"];
  periodLabel?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="border-b border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-900 dark:border-neutral-800 dark:text-neutral-50 sm:px-5">
        Top 5 teams – Corners per 90
        {periodLabel && <span className="font-normal text-neutral-500 dark:text-neutral-400">{periodLabel}</span>}
      </h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {entries.map((entry, i) => (
          <li key={`${entry.teamName}-${i}`}>
            <NavLinkWithOverlay
              href={entry.href}
              className="flex items-center justify-between px-4 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.teamName}
                </span>
              </span>
              <span className="tabular-nums font-medium text-violet-600 dark:text-violet-400">
                {entry.cornersPer90} <span className="text-xs font-normal text-neutral-400">Corners/90</span>
              </span>
            </NavLinkWithOverlay>
          </li>
        ))}
      </ul>
    </section>
  );
}
