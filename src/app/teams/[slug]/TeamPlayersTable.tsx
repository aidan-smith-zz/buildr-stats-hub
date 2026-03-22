"use client";

import type { TeamPagePlayerSummary } from "@/lib/teamPageService";
import { useMemo, useState } from "react";

type SortKey = "minutes" | "goals" | "assists" | "shots" | "shotsOnTarget" | "yellowCards" | "redCards" | "name";
type SortDirection = "asc" | "desc";

type Props = {
  players: TeamPagePlayerSummary[];
};

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

const DEFAULT_SORT: SortState = { key: "minutes", direction: "desc" };

export function TeamPlayersTable({ players }: Props) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  /** Dedupe by numeric id (defensive if server ever sends mixed key types or duplicates). */
  const uniquePlayers = useMemo(() => {
    const byId = new Map<number, TeamPagePlayerSummary>();
    for (const p of players) {
      const id = Number(p.id);
      if (!Number.isFinite(id)) continue;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { ...p, id });
      } else {
        byId.set(id, {
          ...existing,
          minutes: existing.minutes + p.minutes,
          goals: existing.goals + p.goals,
          assists: existing.assists + p.assists,
          shots: existing.shots + p.shots,
          shotsOnTarget: existing.shotsOnTarget + p.shotsOnTarget,
          yellowCards: existing.yellowCards + p.yellowCards,
          redCards: existing.redCards + p.redCards,
        });
      }
    }
    return [...byId.values()];
  }, [players]);

  const sortedPlayers = useMemo(() => {
    const arr = [...uniquePlayers];
    const { key, direction } = sort;
    arr.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (key === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else {
        av = a[key];
        bv = b[key];
      }
      if (av < bv) return direction === "asc" ? -1 : 1;
      if (av > bv) return direction === "asc" ? 1 : -1;
      return a.id - b.id;
    });
    return arr;
  }, [uniquePlayers, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "name" ? "asc" : "desc" };
    });
  }

  function renderSortIndicator(key: SortKey) {
    if (sort.key !== key) return null;
    return sort.direction === "asc" ? "↑" : "↓";
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs text-neutral-700 dark:text-neutral-300 sm:text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            <th className="pb-2 pr-3">
              <button
                type="button"
                onClick={() => toggleSort("name")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Player
                <span className="text-[9px]">{renderSortIndicator("name")}</span>
              </button>
            </th>
            <th className="pb-2 pr-3 text-right">
              <button
                type="button"
                onClick={() => toggleSort("minutes")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Min
                <span className="text-[9px]">{renderSortIndicator("minutes")}</span>
              </button>
            </th>
            <th className="pb-2 pr-3 text-right">
              <button
                type="button"
                onClick={() => toggleSort("goals")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                G
                <span className="text-[9px]">{renderSortIndicator("goals")}</span>
              </button>
            </th>
            <th className="pb-2 pr-3 text-right">
              <button
                type="button"
                onClick={() => toggleSort("assists")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                A
                <span className="text-[9px]">{renderSortIndicator("assists")}</span>
              </button>
            </th>
            <th className="pb-2 pr-3 text-right">
              <button
                type="button"
                onClick={() => toggleSort("shots")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Sh
                <span className="text-[9px]">{renderSortIndicator("shots")}</span>
              </button>
            </th>
            <th className="pb-2 pr-3 text-right">
              <button
                type="button"
                onClick={() => toggleSort("shotsOnTarget")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                SOT
                <span className="text-[9px]">{renderSortIndicator("shotsOnTarget")}</span>
              </button>
            </th>
            <th className="pb-2 pr-0 text-right">
              <button
                type="button"
                onClick={() => toggleSort("yellowCards")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Y/R
                <span className="text-[9px]">{renderSortIndicator("yellowCards")}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((p) => (
            <tr key={p.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
              <td className="py-1.5 pr-3">
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                  {p.name}
                </span>
                {p.position && (
                  <span className="ml-1 text-[11px] uppercase text-neutral-500 dark:text-neutral-400">
                    · {p.position}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{p.minutes}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{p.goals}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{p.assists}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{p.shots}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{p.shotsOnTarget}</td>
              <td className="py-1.5 pr-0 text-right tabular-nums">
                {p.yellowCards}
                <span className="mx-0.5 text-neutral-400 dark:text-neutral-500">/</span>
                {p.redCards}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

