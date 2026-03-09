/**
 * Warm league season stats for all teams in standings leagues.
 *
 * Usage:
 *   npm run warm-league-stats
 *
 * This script:
 * - For each league in STANDINGS_LEAGUE_IDS:
 *   - Loads standings (using getOrRefreshStandings, which caches in DB).
 *   - Ensures there is a Team row for each API team id.
 *   - Skips teams that already have non-zero TeamSeasonStats for this season/league.
 *   - Calls warmTeamSeasonStatsForTeam for teams that still need season stats.
 *
 * It is safe to run daily. It only calls the external API for teams that do not yet have
 * season stats, and writes results into TeamSeasonStats for use by league stats hubs.
 */

import { prisma } from "@/lib/prisma";
import { API_SEASON } from "@/lib/footballApi";
import { STANDINGS_LEAGUE_IDS, LEAGUE_DISPLAY_NAMES } from "@/lib/leagues";
import { getOrRefreshStandings } from "@/lib/standingsService";
import { warmTeamSeasonStatsForTeam } from "@/lib/statsService";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function warmLeague(leagueId: number): Promise<void> {
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueId] ?? `League ${leagueId}`;
  console.log(`\n[warm-league-stats] === ${leagueName} (${leagueId}) ===`);

  const standings = await getOrRefreshStandings(leagueId);
  if (!standings || !standings.tables.length) {
    console.log("[warm-league-stats] No standings data for this league, skipping.");
    return;
  }

  const rows = standings.tables.flatMap((t) => t.rows ?? []);
  if (!rows.length) {
    console.log("[warm-league-stats] Standings tables have no rows, skipping.");
    return;
  }

  const leagueKey = leagueName;

  for (const row of rows) {
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
        teamId_season_league: { teamId: team.id, season: API_SEASON, league: leagueKey },
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
      console.log(
        `[warm-league-stats]   ${team.name} — already has season stats, skipping.`,
      );
      continue;
    }

    console.log(`[warm-league-stats]   ${team.name} — warming season stats...`);

    // Use a modest per-call cap to avoid huge bursts; loop until done.
    for (;;) {
      const result = await warmTeamSeasonStatsForTeam(team.id, team.apiId!, leagueKey, leagueId, {
        maxApiCallsPerInvocation: 20,
        cacheLeagueKey: String(leagueId),
      });
      if (result.done) {
        break;
      }
      console.log(
        `[warm-league-stats]     ${team.name} — partial warm, continuing after short delay...`,
      );
      await sleep(2000);
    }

    // Short pause between teams to avoid hammering the API.
    await sleep(1500);
  }

  console.log(`[warm-league-stats] Finished league ${leagueName} (${leagueId}).`);
}

async function main() {
  console.log("[warm-league-stats] Starting league stats warm for standings leagues.\n");
  for (const leagueId of STANDINGS_LEAGUE_IDS) {
    await warmLeague(leagueId);
  }
  console.log("\n[warm-league-stats] All leagues processed.");
}

main().catch((err) => {
  console.error("[warm-league-stats] Fatal:", err);
  process.exit(1);
});

