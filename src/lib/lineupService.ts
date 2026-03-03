import { prisma } from "@/lib/prisma";
import { fetchFixtureLineups } from "@/lib/footballApi";
import type { LineupStatus as PrismaLineupStatus } from "@prisma/client";

const WINDOW_MINUTES_BEFORE_KICKOFF = 30;
/** After kickoff: still fetch lineup when someone hits /live and lineup wasn't fetched pre-kickoff. */
const WINDOW_MINUTES_AFTER_KICKOFF = 120;

/**
 * Fetch lineup when: (kickoff - 30min <= now <= kickoff) OR (kickoff <= now <= kickoff + 2h).
 * Pre-kickoff: usual window. During/after match: so /live can trigger lineup fetch if missing.
 */
export function isWithinLineupFetchWindow(kickoffTime: Date, now: Date = new Date()): boolean {
  const start = new Date(kickoffTime.getTime() - WINDOW_MINUTES_BEFORE_KICKOFF * 60 * 1000);
  const end = new Date(kickoffTime.getTime() + WINDOW_MINUTES_AFTER_KICKOFF * 60 * 1000);
  return (now >= start && now <= kickoffTime) || (now >= kickoffTime && now <= end);
}

/**
 * If lineup already exists in DB for this fixture, do nothing.
 * If lineup does NOT exist and we're within the fetch window (30 min before kickoff, or up to 2h after kickoff), fetch once from API and store.
 * Never refetches once lineup exists. No polling/cron. /live visits during the match can trigger this.
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
      /** Short position code from lineup endpoint, e.g. "G", "D", "M", "F" (may be null). */
      position: string | null;
      /** Shirt number from lineup endpoint (may be null). */
      shirtNumber: number | null;
    };
    const allPlayers: PlayerWithStatus[] = [];

    for (const teamLineup of rawLineups) {
      const teamApiId = String(teamLineup.team.id);
      const teamId = apiIdToTeamId.get(teamApiId);
      if (teamId == null) continue;

      const startXI = teamLineup.startXI ?? [];
      const substitutes = teamLineup.substitutes ?? [];

      const pushFromItem = (item: { player?: { id?: number; name?: string; pos?: string | null; number?: number | null } }, status: PrismaLineupStatus) => {
        const apiId = String(item.player?.id ?? 0);
        const playerName = item.player?.name ?? "Unknown";
        if (!apiId || apiId === "0") return;
        const rawPos = item.player?.pos ?? null;
        const position = typeof rawPos === "string" && rawPos.trim().length > 0 ? rawPos : null;
        const rawNumber = item.player?.number;
        const shirtNumber =
          typeof rawNumber === "number" && Number.isFinite(rawNumber) ? rawNumber : null;

        allPlayers.push({
          teamId,
          apiId,
          playerName,
          lineupStatus: status,
          position,
          shirtNumber,
        });
      };

      for (const item of startXI) {
        pushFromItem(item, "starting");
      }
      for (const item of substitutes) {
        pushFromItem(item, "substitute");
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
    type ExistingPlayerInfo = {
      id: number;
      teamId: number;
      apiId: string;
      position: string | null;
      shirtNumber: number | null;
    };

    const existingByTeamAndApi = await prisma.player.findMany({
      where: {
        OR: uniquePlayers.map((p) => ({ teamId: p.teamId, apiId: p.apiId })),
      },
      select: { id: true, teamId: true, apiId: true, position: true, shirtNumber: true },
    });
    const existingMap = new Map<string, ExistingPlayerInfo>();
    const playerIdToExisting = new Map<number, ExistingPlayerInfo>();
    for (const p of existingByTeamAndApi) {
      const info: ExistingPlayerInfo = {
        id: p.id,
        teamId: p.teamId,
        apiId: p.apiId,
        position: p.position ?? null,
        shirtNumber: p.shirtNumber ?? null,
      };
      existingMap.set(`${p.teamId}:${p.apiId}`, info);
      playerIdToExisting.set(p.id, info);
    }

    // Batch 2: for missing, find by apiId only (player may be in different team)
    const missing = uniquePlayers.filter((p) => !existingMap.has(`${p.teamId}:${p.apiId}`));
    const missingApiIds = [...new Set(missing.map((p) => p.apiId))];

    const existingByApiId =
      missingApiIds.length > 0
        ? await prisma.player.findMany({
            where: { apiId: { in: missingApiIds } },
            select: { id: true, apiId: true, position: true, shirtNumber: true },
          })
        : [];
    const apiIdToPlayerId = new Map(existingByApiId.map((p) => [p.apiId, p.id]));
    for (const p of existingByApiId) {
      if (!playerIdToExisting.has(p.id)) {
        playerIdToExisting.set(p.id, {
          id: p.id,
          teamId: 0,
          apiId: p.apiId,
          position: p.position ?? null,
          shirtNumber: p.shirtNumber ?? null,
        });
      }
    }

    // Batch 3: create only players that don't exist
    const toCreatePlayers = missing.filter((p) => !apiIdToPlayerId.has(p.apiId));
    const created = await Promise.all(
      toCreatePlayers.map((p) =>
        prisma.player.create({
          data: {
            apiId: p.apiId,
            name: p.playerName,
            teamId: p.teamId,
            position: p.position,
            shirtNumber: p.shirtNumber,
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
      const existing = existingMap.get(key);
      if (existing) return existing.id;
      return apiIdToPlayerId.get(p.apiId)!;
    };

    const lineupRows = uniquePlayers.map((p) => ({
      fixtureId,
      teamId: p.teamId,
      playerId: getPlayerId(p),
      lineupStatus: p.lineupStatus,
    }));

    // For existing players, backfill position/shirtNumber from lineup when missing.
    const playersToUpdate: Array<{
      id: number;
      data: { position?: string | null; shirtNumber?: number | null };
    }> = [];

    for (const p of uniquePlayers) {
      if (!p.position && p.shirtNumber == null) continue;
      const playerId = getPlayerId(p);
      const existing = playerIdToExisting.get(playerId);
      if (!existing) continue;

      const data: { position?: string | null; shirtNumber?: number | null } = {};

      if (p.position && (!existing.position || existing.position.trim() === "")) {
        data.position = p.position;
      }
      if (p.shirtNumber != null && existing.shirtNumber == null) {
        data.shirtNumber = p.shirtNumber;
      }

      if (Object.keys(data).length > 0) {
        playersToUpdate.push({ id: playerId, data });
      }
    }

    if (playersToUpdate.length > 0) {
      await Promise.all(
        playersToUpdate.map((p) =>
          prisma.player.update({
            where: { id: p.id },
            data: p.data,
          }),
        ),
      );
    }

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
