"use client";

import Link from "next/link";
import { isDeepFixtureMatchHref } from "@/lib/deepFixtureMatchHref";
import { useState, useMemo } from "react";
import type { Last5TeamSummary } from "@/lib/insightsService";

type Period = "last5" | "last10" | "season";
type VenueView = "all" | "home" | "away";
type SortKey = "teamName" | "gamesPlayed" | "avgGoalsFor" | "avgGoalsAgainst" | "avgCorners" | "avgCards";

const PERIOD_LABELS: Record<Period, string> = {
  last5: "Last 5",
  last10: "Last 10",
  season: "Season",
};

const VENUE_VIEW_OPTIONS: { value: VenueView; label: string }[] = [
  { value: "all", label: "Home & away" },
  { value: "home", label: "Home only" },
  { value: "away", label: "Away only" },
];

const COLUMNS: { key: SortKey; label: string; align?: "center" }[] = [
  { key: "teamName", label: "Team" },
  { key: "gamesPlayed", label: "P", align: "center" },
  { key: "avgGoalsFor", label: "GF (per 90)", align: "center" },
  { key: "avgGoalsAgainst", label: "GA (per 90)", align: "center" },
  { key: "avgCorners", label: "Corners (per 90)", align: "center" },
  { key: "avgCards", label: "Cards (per 90)", align: "center" },
];

function hasHomeAwayData(data: Last5TeamSummary[]): boolean {
  return data.some(
    (t) =>
      (t.homeGames != null && t.homeGames > 0) ||
      (t.awayGames != null && t.awayGames > 0)
  );
}

/** One row for display: same columns, values depend on venue view. */
type DisplayRow = Pick<Last5TeamSummary, "teamId" | "teamName" | "href"> & {
  gamesPlayed: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgCorners: number;
  avgCards: number;
};

function toDisplayRows(data: Last5TeamSummary[], venueView: VenueView): DisplayRow[] {
  if (venueView === "all") {
    return data.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      href: t.href,
      gamesPlayed: t.gamesPlayed,
      avgGoalsFor: t.avgGoalsFor,
      avgGoalsAgainst: t.avgGoalsAgainst,
      avgCorners: t.avgCorners,
      avgCards: t.avgCards,
    }));
  }
  if (venueView === "home") {
    return data
      .filter((t) => t.homeGames != null && t.homeGames > 0 && t.homeAvgGoalsFor != null)
      .map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        href: t.href,
        gamesPlayed: t.homeGames!,
        avgGoalsFor: t.homeAvgGoalsFor!,
        avgGoalsAgainst: t.homeAvgGoalsAgainst ?? 0,
        avgCorners: t.homeAvgCorners ?? 0,
        avgCards: t.homeAvgCards ?? 0,
      }));
  }
  return data
    .filter((t) => t.awayGames != null && t.awayGames > 0 && t.awayAvgGoalsFor != null)
    .map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      href: t.href,
      gamesPlayed: t.awayGames!,
      avgGoalsFor: t.awayAvgGoalsFor!,
      avgGoalsAgainst: t.awayAvgGoalsAgainst ?? 0,
      avgCorners: t.awayAvgCorners ?? 0,
      avgCards: t.awayAvgCards ?? 0,
    }));
}

type Props = {
  last5: Last5TeamSummary[];
  last10: Last5TeamSummary[];
  season: Last5TeamSummary[];
};

export function FormTableClient({ last5, last10, season }: Props) {
  const [period, setPeriod] = useState<Period>("last5");
  const [venueView, setVenueView] = useState<VenueView>("all");
  const [sortKey, setSortKey] = useState<SortKey>("avgGoalsFor");
  const [sortAsc, setSortAsc] = useState(false);

  const data = period === "last5" ? last5 : period === "last10" ? last10 : season;
  const showVenueDropdown = hasHomeAwayData(data);

  const displayRows = useMemo(() => toDisplayRows(data, venueView), [data, venueView]);

  const sorted = useMemo(() => {
    const arr = [...displayRows];
    arr.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      return sortAsc ? aNum - bNum : bNum - aNum;
    });
    return arr;
  }, [displayRows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(key === "teamName");
    }
  };

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
            {(["last5", "last10", "season"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {showVenueDropdown && (
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="whitespace-nowrap">View:</span>
              <select
                value={venueView}
                onChange={(e) => setVenueView(e.target.value as VenueView)}
                aria-label="View by home, away, or home and away"
                className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-900 shadow-sm focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-500"
              >
                {VENUE_VIEW_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="max-h-[400px] overflow-auto overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/50">
              {COLUMNS.map(({ key, label, align }) => (
                <th
                  key={key}
                  className={`px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400 ${
                    align === "center" ? "text-center" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(key)}
                    className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-200"
                  >
                    {label}
                    {sortKey === key && (
                      <span className="text-neutral-400" aria-hidden>
                        {sortAsc ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {venueView === "home"
                    ? "No home match data for this period."
                    : venueView === "away"
                      ? "No away match data for this period."
                      : "No data."}
                </td>
              </tr>
            ) : (
              sorted.map((t) => (
                <tr
                  key={t.teamId}
                  className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/30"
                >
                  <td className="px-4 py-3">
                    {t.href ? (
                      <Link
                        href={t.href}
                        prefetch={isDeepFixtureMatchHref(t.href) ? false : undefined}
                        className="font-medium text-neutral-900 hover:text-violet-600 dark:text-neutral-100 dark:hover:text-violet-400"
                      >
                        {t.teamName}
                      </Link>
                    ) : (
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {t.teamName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                    {t.gamesPlayed}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                    {t.avgGoalsFor.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                    {t.avgGoalsAgainst.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                    {t.avgCorners.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                    {t.avgCards.toFixed(1)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        All averages are per 90 minutes (one match). GF = goals for, GA = goals against. {showVenueDropdown && "Use the view dropdown to see home only or away only averages. "}
        Click a column header to sort.
      </p>
    </div>
  );
}
