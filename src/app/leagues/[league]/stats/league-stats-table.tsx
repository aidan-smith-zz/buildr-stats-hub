"use client";

import Link from "next/link";
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
  /** Team page URL (e.g. /teams/liverpool). Set by parent so names are clickable. */
  teamHref?: string | null;
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
    "py-3 px-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 cursor-pointer select-none hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors";
  const thTeamSticky =
    "sticky left-0 z-[1] min-w-[10rem] w-48 max-w-[12rem] border-r border-neutral-200 bg-neutral-100 py-3 pl-1.5 pr-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)] cursor-pointer select-none hover:bg-neutral-200 dark:hover:bg-neutral-700/50 transition-colors";

  return (
    <div className="isolate overflow-x-auto">
      <table
        className="w-full min-w-[640px] border-collapse text-left text-sm"
        role="grid"
        aria-label={`${leagueName} team stats, sortable by column`}
      >
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-800/50">
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
              className="group border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
            >
              <td className="sticky left-0 z-[1] min-w-[10rem] w-48 max-w-[12rem] border-r border-neutral-200 bg-white py-2.5 pl-1.5 pr-2 transition-colors group-hover:bg-neutral-50/60 dark:border-neutral-700 dark:bg-neutral-900 dark:group-hover:bg-neutral-800/40">
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  {row.crestUrl ? (
                    <img
                      src={row.crestUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 flex-shrink-0 object-contain"
                      aria-hidden
                    />
                  ) : (
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700"
                      aria-hidden
                    >
                      <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        {(row.shortName ?? row.name).slice(0, 1)}
                      </span>
                    </span>
                  )}
                  {row.teamHref ? (
                    <Link
                      href={row.teamHref}
                      className="min-h-[44px] min-w-0 flex-1 truncate font-medium text-neutral-900 underline-offset-2 hover:text-violet-600 hover:underline dark:text-neutral-50 dark:hover:text-violet-300 flex items-center -my-2.5 py-2.5 touch-manipulation"
                      title={`${row.shortName ?? row.name} team stats`}
                    >
                      {row.shortName ?? row.name}
                    </Link>
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-neutral-900 dark:text-neutral-50"
                      title={row.shortName ?? row.name}
                    >
                      {row.shortName ?? row.name}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2.5 px-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300">
                {row.matches.toFixed(1)}
              </td>
              <td className="py-2.5 px-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300">
                {row.goalsForPer90.toFixed(2)}
              </td>
              <td className="py-2.5 px-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300">
                {row.goalsAgainstPer90.toFixed(2)}
              </td>
              <td className="py-2.5 px-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300">
                {row.cornersPerMatch.toFixed(2)}
              </td>
              <td className="py-2.5 pl-2 pr-4 text-center tabular-nums text-neutral-700 dark:text-neutral-300">
                {row.cardsPerMatch.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
