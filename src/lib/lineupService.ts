import { prisma } from "@/lib/prisma";
import { fetchFixtureLineups } from "@/lib/footballApi";
import type { LineupStatus as PrismaLineupStatus } from "@prisma/client";

const WINDOW_MINUTES_BEFORE_KICKOFF = 30;

/**
 * Only fetch lineup from API when: kickoffTime - 30min <= now <= kickoffTime.
 * Returns true if we're in that window.
 */
export function isWithinLineupFetchWindow(kickoffTime: Date, now: Date = new Date()): boolean {
  const start = new Date(kickoffTime.getTime() - WINDOW_MINUTES_BEFORE_KICKOFF * 60 * 1000);
  return now >= start && now <= kickoffTime;
}

/**
 * If lineup already exists in DB for this fixture, do nothing.
 * If lineup does NOT exist and we're within 30 mins of kickoff, fetch once from API and store.
 * Never refetches once lineup exists. No polling/cron.
 */
export async function ensureLineupIfWithinWindow(
  fixtureId: number,
  kickoffTime: Date,
  fixtureApiId: string | null,
  homeTeamId: number,
  awayTeamId: number,
  homeTeamApiId: string | null,
  awayTeamApiId: string | null,
): Promise<void> {
  const now = new Date();

  const existingCount = await prisma.fixtureLineup.count({
    where: { fixtureId },
  });
  if (existingCount > 0) {
    return;
  }

  if (!isWithinLineupFetchWindow(kickoffTime, now)) {
    return;
  }

  if (!fixtureApiId) {
    return;
  }

  try {
    const rawLineups = await fetchFixtureLineups(fixtureApiId);
    if (!rawLineups || rawLineups.length === 0) return;

    const apiIdToTeamId = new Map<string, number>();
    if (homeTeamApiId) apiIdToTeamId.set(homeTeamApiId, homeTeamId);
    if (awayTeamApiId) apiIdToTeamId.set(awayTeamApiId, awayTeamId);

    // Collect all players with lineup status (batch instead of per-player lookups)
    type PlayerWithStatus = {
      teamId: number;
      apiId: string;
      playerName: string;
      lineupStatus: PrismaLineupStatus;
    };
    const allPlayers: PlayerWithStatus[] = [];

    for (const teamLineup of rawLineups) {
      const teamApiId = String(teamLineup.team.id);
      const teamId = apiIdToTeamId.get(teamApiId);
      if (teamId == null) continue;

      const startXI = teamLineup.startXI ?? [];
      const substitutes = teamLineup.substitutes ?? [];

      for (const item of startXI) {
        const apiId = String(item.player?.id ?? 0);
        const playerName = item.player?.name ?? "Unknown";
        if (!apiId || apiId === "0") continue;
        allPlayers.push({ teamId, apiId, playerName, lineupStatus: "starting" });
      }
      for (const item of substitutes) {
        const apiId = String(item.player?.id ?? 0);
        const playerName = item.player?.name ?? "Unknown";
        if (!apiId || apiId === "0") continue;
        allPlayers.push({ teamId, apiId, playerName, lineupStatus: "substitute" });
      }
    }

    if (allPlayers.length === 0) return;

    // Dedupe by (teamId, apiId) — keep first (starting over substitute if duplicate)
    const seen = new Set<string>();
    const uniquePlayers = allPlayers.filter((p) => {
      const key = `${p.teamId}:${p.apiId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Batch 1: find existing by (teamId, apiId)
    const existingByTeamAndApi = await prisma.player.findMany({
      where: {
        OR: uniquePlayers.map((p) => ({ teamId: p.teamId, apiId: p.apiId })),
      },
      select: { id: true, teamId: true, apiId: true },
    });
    const existingMap = new Map<string, number>();
    for (const p of existingByTeamAndApi) {
      existingMap.set(`${p.teamId}:${p.apiId}`, p.id);
    }

    // Batch 2: for missing, find by apiId only (player may be in different team)
    const missing = uniquePlayers.filter((p) => !existingMap.has(`${p.teamId}:${p.apiId}`));
    const missingApiIds = [...new Set(missing.map((p) => p.apiId))];

    const existingByApiId =
      missingApiIds.length > 0
        ? await prisma.player.findMany({
            where: { apiId: { in: missingApiIds } },
            select: { id: true, apiId: true },
          })
        : [];
    const apiIdToPlayerId = new Map(existingByApiId.map((p) => [p.apiId, p.id]));

    // Batch 3: create only players that don't exist
    const toCreatePlayers = missing.filter((p) => !apiIdToPlayerId.has(p.apiId));
    const created = await Promise.all(
      toCreatePlayers.map((p) =>
        prisma.player.create({
          data: {
            apiId: p.apiId,
            name: p.playerName,
            teamId: p.teamId,
            position: null,
            shirtNumber: null,
          },
          select: { id: true, apiId: true },
        }),
      ),
    );
    for (const p of created) {
      apiIdToPlayerId.set(p.apiId, p.id);
    }

    // Resolve playerId for each unique player
    const getPlayerId = (p: PlayerWithStatus): number => {
      const key = `${p.teamId}:${p.apiId}`;
      return existingMap.get(key) ?? apiIdToPlayerId.get(p.apiId)!;
    };

    const lineupRows = uniquePlayers.map((p) => ({
      fixtureId,
      teamId: p.teamId,
      playerId: getPlayerId(p),
      lineupStatus: p.lineupStatus,
    }));

    if (lineupRows.length > 0) {
      await prisma.fixtureLineup.createMany({
        data: lineupRows,
        skipDuplicates: true,
      });
    }
  } catch (err) {
    console.error("[lineupService] Failed to fetch/store lineup for fixture", fixtureId, err);
  }
}

/**
 * Get lineup status per player for a fixture: map of (teamId -> map of playerId -> "starting" | "substitute").
 * Players not in the map are NOT INVOLVED.
 */
export async function getLineupForFixture(
  fixtureId: number,
): Promise<Map<number, Map<number, "starting" | "substitute">>> {
  const rows = await prisma.fixtureLineup.findMany({
    where: { fixtureId },
    select: { teamId: true, playerId: true, lineupStatus: true },
  });

  const byTeam = new Map<number, Map<number, "starting" | "substitute">>();
  for (const row of rows) {
    if (!byTeam.has(row.teamId)) {
      byTeam.set(row.teamId, new Map());
    }
    byTeam.get(row.teamId)!.set(row.playerId, row.lineupStatus as "starting" | "substitute");
  }
  return byTeam;
}
