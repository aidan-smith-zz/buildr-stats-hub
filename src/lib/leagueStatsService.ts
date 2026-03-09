import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";

export type LeagueTeamStatsRow = {
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

export type LeagueStatsHubData = {
  leagueId: number;
  leagueName: string;
  season: string;
  teams: LeagueTeamStatsRow[];
  updatedAt: Date | null;
};

async function loadLeagueStatsHubData(leagueId: number): Promise<LeagueStatsHubData | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) return null;

  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? "League";

  const rows = await prisma.teamSeasonStats.findMany({
    where: {
      season: API_SEASON,
      leagueId,
    },
    include: {
      team: {
        select: {
          id: true,
          apiId: true,
          name: true,
          shortName: true,
          crestUrl: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    return {
      leagueId,
      leagueName,
      season: API_SEASON,
      teams: [],
      updatedAt: null,
    };
  }

  // Deduplicate by teamId (same team can have multiple rows when "league" string differs but leagueId matches, e.g. "Premier League" vs "English Premier League"). Keep the row with most minutes.
  const byTeamId = new Map<number, (typeof rows)[0]>();
  for (const row of rows) {
    const existing = byTeamId.get(row.teamId);
    const minutes = row.minutesPlayed ?? 0;
    const existingMinutes = existing?.minutesPlayed ?? 0;
    if (!existing || minutes > existingMinutes) {
      byTeamId.set(row.teamId, row);
    }
  }
  const dedupedRows = Array.from(byTeamId.values());

  const teams: LeagueTeamStatsRow[] = dedupedRows
    .map((row) => {
      const minutes = row.minutesPlayed ?? 0;
      const matches = minutes > 0 ? minutes / 90 : 0;
      if (matches <= 0) {
        // Skip rows with no meaningful minutes; they are effectively "unwarmed".
        return null;
      }
      const goalsForPer90 = row.goalsFor / matches;
      const goalsAgainstPer90 = row.goalsAgainst / matches;
      const cornersPerMatch = row.corners / matches;
      const cardsPerMatch = (row.yellowCards + row.redCards) / matches;

      return {
        teamId: row.teamId,
        apiId: row.team.apiId ?? null,
        name: row.team.name,
        shortName: row.team.shortName ?? null,
        crestUrl: row.team.crestUrl ?? null,
        matches,
        goalsForPer90,
        goalsAgainstPer90,
        cornersPerMatch,
        cardsPerMatch,
      };
    })
    .filter((t): t is LeagueTeamStatsRow => t !== null);

  const updatedAt =
    rows.reduce<Date | null>((acc, r) => {
      if (!r.updatedAt) return acc;
      if (!acc || r.updatedAt > acc) return r.updatedAt;
      return acc;
    }, null) ?? null;

  // Sort by goalsFor per 90 descending, then by name.
  teams.sort((a, b) => {
    if (b.goalsForPer90 !== a.goalsForPer90) {
      return b.goalsForPer90 - a.goalsForPer90;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    leagueId,
    leagueName,
    season: API_SEASON,
    teams,
    updatedAt,
  };
}

export const getLeagueStatsHubData = unstable_cache(
  async (leagueId: number) => {
    return loadLeagueStatsHubData(leagueId);
  },
  ["league-stats-hub"],
  {
    revalidate: 60 * 60 * 24, // 24 hours
  },
);

