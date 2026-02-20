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

    const toCreate: { fixtureId: number; teamId: number; playerId: number; lineupStatus: PrismaLineupStatus }[] = [];

    for (const teamLineup of rawLineups) {
      const teamApiId = String(teamLineup.team.id);
      const teamId = apiIdToTeamId.get(teamApiId);
      if (teamId == null) continue;

      const startXI = teamLineup.startXI ?? [];
      const substitutes = teamLineup.substitutes ?? [];

      for (const item of startXI) {
        const playerApiId = String(item.player?.id ?? 0);
        if (!playerApiId || playerApiId === "0") continue;
        const player = await prisma.player.findFirst({
          where: { teamId, apiId: playerApiId },
          select: { id: true },
        });
        if (player) {
          toCreate.push({
            fixtureId,
            teamId,
            playerId: player.id,
            lineupStatus: "starting",
          });
        }
      }

      for (const item of substitutes) {
        const playerApiId = String(item.player?.id ?? 0);
        if (!playerApiId || playerApiId === "0") continue;
        const player = await prisma.player.findFirst({
          where: { teamId, apiId: playerApiId },
          select: { id: true },
        });
        if (player) {
          toCreate.push({
            fixtureId,
            teamId,
            playerId: player.id,
            lineupStatus: "substitute",
          });
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.fixtureLineup.createMany({
        data: toCreate,
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
