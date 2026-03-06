import { NextRequest, NextResponse } from "next/server";
import { warmFixturePart } from "@/lib/statsService";
import { getFixtureStats } from "@/lib/statsService";

/** Each batch invocation stays under 60s for Vercel Hobby. */
export const maxDuration = 60;

const PARTS: Array<"home" | "away" | "teamstats-home" | "teamstats-away" | "teamstats" | "lineup" | "stats"> = [
  "home",
  "away",
  "teamstats-home",
  "teamstats-away",
  "teamstats",
  "lineup",
  "stats",
];

const MAX_TEAMSTATS_ROUNDS = 10;

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Headers to bypass Vercel Deployment Protection when chaining to next batch. */
function getInternalFetchHeaders(): Record<string, string> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    return { "x-vercel-protection-bypass": bypass };
  }
  return {};
}

function getNextPart(
  part: string,
  round: number,
  allDone: boolean
): string | null {
  if (part === "stats") return null;

  const isLoopPart = part === "teamstats-home" || part === "teamstats-away" || part === "teamstats";
  if (isLoopPart && !allDone && round < MAX_TEAMSTATS_ROUNDS) {
    return part;
  }

  const idx = PARTS.indexOf(part as (typeof PARTS)[number]);
  if (idx < 0 || idx >= PARTS.length - 1) return null;
  return PARTS[idx + 1];
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const part = url.searchParams.get("part");
  const fixtureIdsParam = url.searchParams.get("fixtureIds");
  const round = Math.max(1, parseInt(url.searchParams.get("round") ?? "1", 10) || 1);

  const validParts = PARTS as readonly string[];
  if (!part || !validParts.includes(part)) {
    return NextResponse.json(
      { error: "Missing or invalid part. Use part=home|away|teamstats-home|teamstats-away|teamstats|lineup|stats" },
      { status: 400 }
    );
  }

  const ids = fixtureIdsParam
    ?.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing or invalid fixtureIds (comma-separated)" }, { status: 400 });
  }

  try {
    if (part === "stats") {
      await Promise.all(ids.map((id) => getFixtureStats(id)));
      return NextResponse.json({ ok: true, part, done: true });
    }

    const warmPart = part as "home" | "away" | "teamstats-home" | "teamstats-away" | "teamstats" | "lineup";
    const results = await Promise.all(
      ids.map(async (id) => {
        const r = await warmFixturePart(id, warmPart);
        return { id, done: "done" in r ? r.done : true };
      })
    );

    const allDone = results.every((r) => r.done);
    const nextPart = getNextPart(part, round, allDone);

    if (nextPart) {
      const baseUrl = getBaseUrl();
      const nextRound = nextPart === part ? round + 1 : 1;
      const batchUrl = `${baseUrl}/api/warm-tomorrow/batch?part=${nextPart}&fixtureIds=${ids.join(",")}&round=${nextRound}`;
      fetch(batchUrl, {
        cache: "no-store",
        headers: getInternalFetchHeaders(),
      }).catch((e) => {
        console.error("[warm-tomorrow/batch] Chain error:", e);
      });
    }

    return NextResponse.json({
      ok: true,
      part,
      round,
      allDone,
      nextPart: nextPart ?? undefined,
    });
  } catch (err) {
    console.error("[warm-tomorrow/batch] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
