import { NextResponse } from "next/server";
import { warmFixturePart } from "@/lib/statsService";
import { isTeamStatsOnlyLeague } from "@/lib/leagues";

export const maxDuration = 60;

type WarmListResponse = {
  ok: boolean;
  total?: number;
  fixtures?: Array<{ id: number; label: string; leagueId?: number }>;
  message?: string;
};

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

async function warmTeamStatsUntilDone(
  fixtureId: number,
  part: "teamstats" | "teamstats-home" | "teamstats-away",
  maxRounds = 8,
): Promise<{ ok: boolean; rounds: number; error?: string }> {
  for (let round = 1; round <= maxRounds; round++) {
    try {
      const result = await warmFixturePart(fixtureId, part);
      const done =
        typeof result === "object" &&
        result !== null &&
        "done" in result &&
        (result as { done?: boolean }).done === false
          ? false
          : true;
      if (done) return { ok: true, rounds: round };
    } catch (err) {
      return {
        ok: false,
        rounds: round,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { ok: true, rounds: maxRounds };
}

async function warmOneFixture(
  origin: string,
  fixture: { id: number; label: string; leagueId?: number },
): Promise<{ ok: boolean; error?: string }> {
  const id = fixture.id;
  const teamStatsOnly = isTeamStatsOnlyLeague(fixture.leagueId ?? null);
  try {
    if (teamStatsOnly) {
      const ts = await warmTeamStatsUntilDone(id, "teamstats");
      if (!ts.ok) return { ok: false, error: ts.error ?? "teamstats failed" };
      const statsRes = await fetch(`${origin}/api/fixtures/${id}/stats`, { cache: "no-store" });
      if (!statsRes.ok) return { ok: false, error: `stats ${statsRes.status}` };
      return { ok: true };
    }

    await warmFixturePart(id, "home");
    await warmFixturePart(id, "away");
    const homeTs = await warmTeamStatsUntilDone(id, "teamstats-home");
    if (!homeTs.ok) return { ok: false, error: homeTs.error ?? "teamstats-home failed" };
    const awayTs = await warmTeamStatsUntilDone(id, "teamstats-away");
    if (!awayTs.ok) return { ok: false, error: awayTs.error ?? "teamstats-away failed" };
    await warmFixturePart(id, "lineup");
    const statsRes = await fetch(`${origin}/api/fixtures/${id}/stats`, { cache: "no-store" });
    if (!statsRes.ok) return { ok: false, error: `stats ${statsRes.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * GET /api/warm/run/tomorrow
 * Phone-friendly warm runner for tomorrow/day+1 fixtures.
 * Re-run the same URL to continue; already-warmed fixtures are skipped by /api/warm-tomorrow.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const maxFixtures = clampInt(url.searchParams.get("maxFixtures"), 3, 1, 10);
  const forceWarm = url.searchParams.get("forceWarm") === "1";
  const skipRefresh = url.searchParams.get("skipRefresh") === "1";
  const staleHours = url.searchParams.get("staleHours");
  const days = url.searchParams.get("days");

  const qs = new URLSearchParams();
  if (forceWarm) qs.set("forceWarm", "1");
  if (skipRefresh) qs.set("skipRefresh", "1");
  if (staleHours) qs.set("staleHours", staleHours);
  if (days) qs.set("days", days);

  const listRes = await fetch(`${origin}/api/warm-tomorrow${qs.toString() ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
  if (!listRes.ok) {
    return NextResponse.json(
      { ok: false, error: `warm-tomorrow list failed (${listRes.status})` },
      { status: 500 },
    );
  }
  const list = (await listRes.json()) as WarmListResponse;
  const fixtures = list.fixtures ?? [];
  const batch = fixtures.slice(0, maxFixtures);

  const succeeded: string[] = [];
  const failed: Array<{ label: string; error: string }> = [];
  for (const f of batch) {
    const r = await warmOneFixture(origin, f);
    if (r.ok) succeeded.push(f.label);
    else failed.push({ label: f.label, error: r.error ?? "unknown error" });
  }

  const remainingApprox = Math.max(0, fixtures.length - succeeded.length);
  const nextParams = new URLSearchParams(url.searchParams);
  if (!nextParams.has("skipRefresh")) nextParams.set("skipRefresh", "1");
  if (!nextParams.has("maxFixtures")) nextParams.set("maxFixtures", String(maxFixtures));

  return NextResponse.json({
    ok: true,
    mode: "warm-tomorrow-runner",
    message: list.message ?? "Processed warm-tomorrow batch.",
    processed: batch.length,
    succeeded: succeeded.length,
    failed,
    remainingApprox,
    next: `${origin}/api/warm/run/tomorrow?${nextParams.toString()}`,
  });
}

