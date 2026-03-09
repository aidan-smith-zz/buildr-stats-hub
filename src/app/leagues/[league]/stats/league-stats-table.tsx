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

  const handleSort = (key: SortKey, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "team" ? "asc" : "desc");
    }
  };

  const sortedTeams = useMemo(() => {
    const arr = teams.slice();
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
    "py-3 px-3 text-right cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700/50 rounded transition-colors text-[11px] font-semibold uppercase tracking-wider";
  const thTeamSticky =
    "sticky left-0 z-10 min-w-[10rem] w-48 max-w-[12rem] border-r border-neutral-200 bg-neutral-100 py-3 pl-4 pr-2 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-600 shadow-[4px_0_12px_4px_rgba(0,0,0,0.08)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[4px_0_12px_4px_rgba(0,0,0,0.4)] cursor-pointer select-none hover:bg-neutral-200 dark:hover:bg-neutral-700/50 rounded-l transition-colors";

  return (
    <div className="isolate overflow-x-auto px-4 py-1 sm:px-5 sm:py-2">
      <table
        className="w-full min-w-[640px] border-collapse text-left text-sm text-neutral-700 dark:text-neutral-300"
        role="grid"
        aria-label={`${leagueName} team stats, sortable by column`}
      >
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400">
            <th
              className={thTeamSticky}
              scope="col"
              onClick={(e) => handleSort("team", e)}
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
              onClick={(e) => handleSort("matches", e)}
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
              onClick={(e) => handleSort("goalsForPer90", e)}
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
              onClick={(e) => handleSort("goalsAgainstPer90", e)}
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
              onClick={(e) => handleSort("cornersPerMatch", e)}
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
              onClick={(e) => handleSort("cardsPerMatch", e)}
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
          {sortedTeams.map((row, index) => (
            <tr
              key={index}
              className="group border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/80 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
            >
              <td className="sticky left-0 z-10 min-w-[10rem] w-48 max-w-[12rem] border-r border-neutral-200 bg-white py-3 pl-4 pr-2 transition-colors group-hover:bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-900 dark:group-hover:bg-neutral-800/50 shadow-[4px_0_12px_4px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_4px_rgba(0,0,0,0.35)]">
                <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                  {row.crestUrl ? (
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                      aria-hidden
                    >
                      <img
                        src={row.crestUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 object-contain"
                      />
                    </div>
                  ) : (
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-xs font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                      aria-hidden
                    >
                      {(row.shortName ?? row.name).slice(0, 1)}
                    </span>
                  )}
                  <span
                    className="min-w-0 truncate font-semibold text-neutral-900 dark:text-neutral-50"
                    title={row.shortName ?? row.name}
                  >
                    {row.shortName ?? row.name}
                  </span>
                </div>
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-medium">
                {row.matches.toFixed(1)}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-medium">
                {row.goalsForPer90.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-medium">
                {row.goalsAgainstPer90.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-medium">
                {row.cornersPerMatch.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-medium">
                {row.cardsPerMatch.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
