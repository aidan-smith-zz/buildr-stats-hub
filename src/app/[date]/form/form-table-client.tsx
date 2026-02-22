"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import type { Last5TeamSummary } from "@/lib/insightsService";

type Period = "last5" | "last10" | "season";
type SortKey = "teamName" | "gamesPlayed" | "avgGoalsFor" | "avgGoalsAgainst" | "avgCorners" | "avgCards";

const PERIOD_LABELS: Record<Period, string> = {
  last5: "Last 5",
  last10: "Last 10",
  season: "Season",
};

const COLUMNS: { key: SortKey; label: string; align?: "center" }[] = [
  { key: "teamName", label: "Team" },
  { key: "gamesPlayed", label: "P", align: "center" },
  { key: "avgGoalsFor", label: "GF", align: "center" },
  { key: "avgGoalsAgainst", label: "GA", align: "center" },
  { key: "avgCorners", label: "Corners", align: "center" },
  { key: "avgCards", label: "Cards", align: "center" },
];

type Props = {
  last5: Last5TeamSummary[];
  last10: Last5TeamSummary[];
  season: Last5TeamSummary[];
};

export function FormTableClient({ last5, last10, season }: Props) {
  const [period, setPeriod] = useState<Period>("last5");
  const [sortKey, setSortKey] = useState<SortKey>("avgGoalsFor");
  const [sortAsc, setSortAsc] = useState(false);

  const data = period === "last5" ? last5 : period === "last10" ? last10 : season;

  const sorted = useMemo(() => {
    const arr = [...data];
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
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(key === "teamName");
    }
  };

  if (sorted.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
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
      </div>
      <div className="overflow-x-auto">
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
            {sorted.map((t) => (
              <tr
                key={t.teamId}
                className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/30"
              >
                <td className="px-4 py-3">
                  {t.href ? (
                    <Link
                      href={t.href}
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
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        GF = goals for, GA = goals against. Click a column header to sort.
      </p>
    </div>
  );
}
