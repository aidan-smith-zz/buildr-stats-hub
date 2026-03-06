import { NextRequest, NextResponse } from "next/server";
import { getFixturesNeedingWarm } from "@/lib/warmTomorrowService";

const BATCH_SIZE = 10;
/** Max batches per invocation (~50s at 5s fetch + 2s stagger). Chains to continuation if more. */
const BATCHES_PER_INVOCATION = 8;
/** Delay between starting each batch (ms) to avoid API rate limits. */
const BATCH_STAGGER_MS = 2000;
const FETCH_TIMEOUT_MS = 5000;

/**
 * Lightweight cron trigger for warm-tomorrow. Runs at 5am UTC daily.
 * Calls the warm-tomorrow logic directly (no HTTP fetch) to avoid Deployment Protection 401.
 * Processes all fixtures in batches of 10. Chains to continuation if >80 fixtures to stay under 60s.
 */
export const maxDuration = 60;

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Headers to bypass Vercel Deployment Protection on internal fetches. */
function getInternalFetchHeaders(): Record<string, string> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    return { "x-vercel-protection-bypass": bypass };
  }
  return {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerBatch(
  baseUrl: string,
  fixtureIds: number[],
  headers: Record<string, string>
): Promise<void> {
  const ids = fixtureIds.join(",");
  const batchUrl = `${baseUrl}/api/warm-tomorrow/batch?part=home&fixtureIds=${ids}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await fetch(batchUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers,
    });
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error("[warm-tomorrow/cron] Batch trigger error:", e);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const continuationParam = request.nextUrl.searchParams.get("continuation");
  const startBatchIndex = Math.max(
    0,
    parseInt(continuationParam ?? "0", 10) || 0
  );

  try {
    const listData = await getFixturesNeedingWarm({});

    const fixtures = listData.fixtures ?? [];
    if (fixtures.length === 0) {
      return NextResponse.json({
        ok: true,
        triggered: false,
        message: listData.message ?? "No fixtures need warming.",
      });
    }

    const baseUrl = getBaseUrl();
    const headers = getInternalFetchHeaders();
    const batches: number[][] = [];

    for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
      batches.push(fixtures.slice(i, i + BATCH_SIZE).map((f) => f.id));
    }

    const endBatchIndex = Math.min(
      startBatchIndex + BATCHES_PER_INVOCATION,
      batches.length
    );
    const batchesThisRun = batches.slice(startBatchIndex, endBatchIndex);

    for (let i = 0; i < batchesThisRun.length; i++) {
      await triggerBatch(baseUrl, batchesThisRun[i], headers);
      if (i < batchesThisRun.length - 1) {
        await sleep(BATCH_STAGGER_MS);
      }
    }

    const hasMore = endBatchIndex < batches.length;
    if (hasMore) {
      const nextUrl = `${baseUrl}/api/warm-tomorrow/cron?continuation=${endBatchIndex}`;
      const continuationHeaders: Record<string, string> = {
        ...headers,
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      };
      fetch(nextUrl, { cache: "no-store", headers: continuationHeaders }).catch(
        (e) => console.error("[warm-tomorrow/cron] Continuation error:", e)
      );
    }

    const totalFixtures = batchesThisRun.reduce((s, b) => s + b.length, 0);
    return NextResponse.json({
      ok: true,
      triggered: true,
      message: hasMore
        ? `Started warming batch ${startBatchIndex + 1}-${endBatchIndex} of ${batches.length}. Chained continuation for rest.`
        : `Started warming ${fixtures.length} fixture(s) in ${batches.length} batch(es).`,
      fixtureIds: batchesThisRun.flat(),
      batchesThisRun: batchesThisRun.length,
      batchesTotal: batches.length,
      continued: hasMore,
    });
  } catch (err) {
    console.error("[warm-tomorrow/cron] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
