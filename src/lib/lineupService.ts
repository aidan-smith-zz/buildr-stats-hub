import { prisma } from "@/lib/prisma";
import { fetchFixtureLineups } from "@/lib/footballApi";
import { decodeHtmlEntities } from "@/lib/text";
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

/** 30 min before kickoff → 30 min after. Use short stats cache in this window so lineup can appear; after that use long cache. */
const SHORT_CACHE_MINUTES_AFTER_KICKOFF = 30;

export function isWithinLineupShortCacheWindow(kickoffTime: Date, now: Date = new Date()): boolean {
  const start = new Date(kickoffTime.getTime() - WINDOW_MINUTES_BEFORE_KICKOFF * 60 * 1000);
  const end = new Date(kickoffTime.getTime() + SHORT_CACHE_MINUTES_AFTER_KICKOFF * 60 * 1000);
  return now >= start && now <= end;
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
        const playerName = decodeHtmlEntities(item.player?.name ?? "Unknown");
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
      apiId: string | null;
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

/**
 * Minimal lineup-only data for past fixture pages. One DB query (FixtureLineup + Player).
 * Use instead of getFixtureStats when only result + lineups are needed to avoid timeout.
 */
export type PastFixtureLineupStats = {
  hasLineup: boolean;
  teams: {
    teamId: number;
    teamName: string;
    teamShortName: string | null;
    players: {
      playerId: number;
      name: string;
      position: string | null;
      shirtNumber: number | null;
      appearances: number;
      minutes: number;
      goals: number;
      assists: number;
      fouls: number;
      shots: number;
      shotsOnTarget: number;
      tackles: number;
      yellowCards: number;
      redCards: number;
      lineupStatus: "starting" | "substitute" | null;
    }[];
  }[];
};

export async function getPastFixtureLineupOnly(
  fixtureId: number,
  homeTeamId: number,
  awayTeamId: number,
  homeTeamName: string,
  homeTeamShortName: string | null,
  awayTeamName: string,
  awayTeamShortName: string | null,
): Promise<PastFixtureLineupStats> {
  const rows = await prisma.fixtureLineup.findMany({
    where: { fixtureId },
    include: { player: true },
    orderBy: [{ teamId: "asc" }, { playerId: "asc" }],
  });

  const teamMeta: Array<{ teamId: number; teamName: string; teamShortName: string | null }> = [
    { teamId: homeTeamId, teamName: homeTeamName, teamShortName: homeTeamShortName },
    { teamId: awayTeamId, teamName: awayTeamName, teamShortName: awayTeamShortName },
  ];

  const byTeam = new Map<
    number,
    { teamId: number; teamName: string; teamShortName: string | null; players: PastFixtureLineupStats["teams"][number]["players"] }
  >();
  for (const meta of teamMeta) {
    byTeam.set(meta.teamId, {
      teamId: meta.teamId,
      teamName: meta.teamName,
      teamShortName: meta.teamShortName,
      players: [],
    });
  }

  const ZERO_STATS = {
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    fouls: 0,
    shots: 0,
    shotsOnTarget: 0,
    tackles: 0,
    yellowCards: 0,
    redCards: 0,
  };

  for (const row of rows) {
    const group = byTeam.get(row.teamId);
    if (!group) continue;
    group.players.push({
      playerId: row.player.id,
      name: row.player.name,
      position: row.player.position ?? null,
      shirtNumber: row.player.shirtNumber ?? null,
      ...ZERO_STATS,
      lineupStatus: row.lineupStatus as "starting" | "substitute",
    });
  }

  const teams = [byTeam.get(homeTeamId)!, byTeam.get(awayTeamId)!];
  const hasLineup = rows.length > 0;
  return { hasLineup, teams };
}
