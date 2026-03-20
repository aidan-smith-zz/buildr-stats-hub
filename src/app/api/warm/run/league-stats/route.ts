import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { STANDINGS_LEAGUE_IDS, LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";
import { getOrRefreshStandings } from "@/lib/standingsService";
import { topUpIsHomeForTeam, warmTeamSeasonStatsForTeam } from "@/lib/statsService";

export const maxDuration = 60;

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * GET /api/warm/run/league-stats
 * Phone-friendly warm runner for league stats.
 * Processes a bounded number of teams per call; rerun to continue.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const maxTeams = clampInt(url.searchParams.get("maxTeams"), 2, 1, 10);
  const maxRoundsPerTeam = clampInt(url.searchParams.get("maxRoundsPerTeam"), 8, 1, 20);

  const warmed: Array<{ leagueId: number; league: string; team: string }> = [];
  let scannedTeams = 0;

  for (const leagueId of STANDINGS_LEAGUE_IDS) {
    if (warmed.length >= maxTeams) break;
    const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? `League ${leagueId}`;
    const standings = await getOrRefreshStandings(leagueId);
    if (!standings || standings.tables.length === 0) continue;
    const rows = standings.tables.flatMap((t) => t.rows ?? []);
    for (const row of rows) {
      if (warmed.length >= maxTeams) break;
      scannedTeams += 1;

      const apiTeamId = String(row.teamId);
      const teamName = row.teamName;
      const team = await prisma.team.upsert({
        where: { apiId: apiTeamId },
        update: { name: teamName },
        create: { apiId: apiTeamId, name: teamName },
        select: { id: true, apiId: true, name: true },
      });

      const existing = await prisma.teamSeasonStats.findUnique({
        where: {
          teamId_season_league: { teamId: team.id, season: API_SEASON, league: leagueName },
        },
        select: {
          minutesPlayed: true,
          goalsFor: true,
          goalsAgainst: true,
          corners: true,
          yellowCards: true,
          redCards: true,
        },
      });
      const hasData =
        existing != null &&
        ((existing.minutesPlayed ?? 0) > 0 ||
          existing.goalsFor > 0 ||
          existing.goalsAgainst > 0 ||
          existing.corners > 0 ||
          existing.yellowCards > 0 ||
          existing.redCards > 0);

      if (hasData) {
        await topUpIsHomeForTeam(team.id, team.apiId!, leagueId, {
          cacheLeagueKey: String(leagueId),
          leagueKeyForSeasonStats: leagueName,
        });
        continue;
      }

      for (let round = 0; round < maxRoundsPerTeam; round++) {
        const result = await warmTeamSeasonStatsForTeam(team.id, team.apiId!, leagueName, leagueId, {
          maxApiCallsPerInvocation: 20,
          cacheLeagueKey: String(leagueId),
        });
        if (result.done) break;
      }
      warmed.push({ leagueId, league: leagueName, team: team.name });
    }
  }

  const nextParams = new URLSearchParams(url.searchParams);
  if (!nextParams.has("maxTeams")) nextParams.set("maxTeams", String(maxTeams));
  if (!nextParams.has("maxRoundsPerTeam")) {
    nextParams.set("maxRoundsPerTeam", String(maxRoundsPerTeam));
  }

  return NextResponse.json({
    ok: true,
    mode: "warm-league-stats-runner",
    processedTeams: warmed.length,
    scannedTeams,
    warmed,
    next: `${origin}/api/warm/run/league-stats?${nextParams.toString()}`,
    hint: "Rerun this URL until processedTeams returns 0 for a full pass.",
  });
}

