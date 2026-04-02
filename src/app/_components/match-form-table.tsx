"use client";

import Link from "next/link";
import { useState } from "react";
import { isDeepFixtureMatchHref } from "@/lib/deepFixtureMatchHref";
import type { Last5TeamSummary } from "@/lib/insightsService";

type Period = "last5" | "last10" | "season";

const PERIOD_LABELS: Record<Period, string> = {
  last5: "Last 5",
  last10: "Last 10",
  season: "Season",
};

type Props = {
  last5: Last5TeamSummary[];
  last10: Last5TeamSummary[];
  season: Last5TeamSummary[];
};

export function MatchFormTable({ last5, last10, season }: Props) {
  const [period, setPeriod] = useState<Period>("last5");

  const data =
    period === "last5" ? last5 : period === "last10" ? last10 : season;
  if (data.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Form
        </h2>
        <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
          {(["last5", "last10", "season"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
      <div className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/50">
              <th className="px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">
                Team
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-neutral-600 dark:text-neutral-400">
                P
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-neutral-600 dark:text-neutral-400">
                GF
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-neutral-600 dark:text-neutral-400">
                GA
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-neutral-600 dark:text-neutral-400">
                Corners
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-neutral-600 dark:text-neutral-400">
                Cards
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr
                key={t.teamId}
                className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800"
              >
                <td className="px-4 py-2.5">
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
                <td className="px-4 py-2.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                  {t.gamesPlayed}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                  {t.avgGoalsFor.toFixed(1)}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                  {t.avgGoalsAgainst.toFixed(1)}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                  {t.avgCorners.toFixed(1)}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400">
                  {t.avgCards.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
