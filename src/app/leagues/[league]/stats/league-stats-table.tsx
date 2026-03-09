"use client";

import { useMemo, useState } from "react";

export type LeagueStatsTableRow = {
  teamId: number;
  apiId: string | null;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  matches: number;
  goalsForPer90: number;
  goalsAgainstPer90: number;
  cornersPerMatch: number;
  cardsPerMatch: number;
};

type SortKey =
  | "team"
  | "matches"
  | "goalsForPer90"
  | "goalsAgainstPer90"
  | "cornersPerMatch"
  | "cardsPerMatch";

type Props = {
  teams: LeagueStatsTableRow[];
  leagueName: string;
};

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) return null;
  return (
    <span className="ml-0.5 inline-block text-neutral-400" aria-hidden>
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function LeagueStatsTable({ teams, leagueName }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("goalsForPer90");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "team" ? "asc" : "desc");
    }
  };

  const sortedTeams = useMemo(() => {
    const arr = [...teams];
    arr.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortKey) {
        case "team":
          aVal = (a.shortName ?? a.name).toLowerCase();
          bVal = (b.shortName ?? b.name).toLowerCase();
          break;
        case "matches":
          aVal = a.matches;
          bVal = b.matches;
          break;
        case "goalsForPer90":
          aVal = a.goalsForPer90;
          bVal = b.goalsForPer90;
          break;
        case "goalsAgainstPer90":
          aVal = a.goalsAgainstPer90;
          bVal = b.goalsAgainstPer90;
          break;
        case "cornersPerMatch":
          aVal = a.cornersPerMatch;
          bVal = b.cornersPerMatch;
          break;
        case "cardsPerMatch":
          aVal = a.cardsPerMatch;
          bVal = b.cardsPerMatch;
          break;
        default:
          return 0;
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [teams, sortKey, sortDir]);

  const thClass =
    "py-2 px-2 text-right cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700/50 rounded transition-colors";
  const thClassLeft = "py-2 pl-2 pr-1 text-left cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700/50 rounded transition-colors";

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full min-w-[640px] border-collapse text-left text-xs text-neutral-700 dark:text-neutral-300 sm:text-sm"
        role="grid"
        aria-label={`${leagueName} team stats, sortable by column`}
      >
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50/80 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
            <th
              className={thClassLeft}
              scope="col"
              onClick={() => handleSort("team")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("team");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "team" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Team
              <SortIcon direction={sortKey === "team" ? sortDir : null} />
            </th>
            <th
              className={thClass}
              scope="col"
              onClick={() => handleSort("matches")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("matches");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "matches" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Matches
              <SortIcon direction={sortKey === "matches" ? sortDir : null} />
            </th>
            <th
              className={thClass}
              scope="col"
              onClick={() => handleSort("goalsForPer90")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("goalsForPer90");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "goalsForPer90" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Goals for /90
              <SortIcon direction={sortKey === "goalsForPer90" ? sortDir : null} />
            </th>
            <th
              className={thClass}
              scope="col"
              onClick={() => handleSort("goalsAgainstPer90")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("goalsAgainstPer90");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "goalsAgainstPer90" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Goals against /90
              <SortIcon direction={sortKey === "goalsAgainstPer90" ? sortDir : null} />
            </th>
            <th
              className={thClass}
              scope="col"
              onClick={() => handleSort("cornersPerMatch")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("cornersPerMatch");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "cornersPerMatch" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Corners /match
              <SortIcon direction={sortKey === "cornersPerMatch" ? sortDir : null} />
            </th>
            <th
              className={thClass}
              scope="col"
              onClick={() => handleSort("cardsPerMatch")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSort("cardsPerMatch");
                }
              }}
              tabIndex={0}
              role="columnheader"
              aria-sort={sortKey === "cardsPerMatch" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            >
              Cards /match
              <SortIcon direction={sortKey === "cardsPerMatch" ? sortDir : null} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((row) => (
            <tr
              key={row.teamId}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
            >
              <td className="py-2 pl-2 pr-1">
                <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {row.shortName ?? row.name}
                </span>
              </td>
              <td className="py-2 px-2 text-right tabular-nums">{row.matches.toFixed(1)}</td>
              <td className="py-2 px-2 text-right tabular-nums">
                {row.goalsForPer90.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {row.goalsAgainstPer90.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {row.cornersPerMatch.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {row.cardsPerMatch.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
