import { NextRequest, NextResponse } from "next/server";
import { getFixturesNeedingWarm } from "@/lib/warmTomorrowService";

const BATCH_SIZE = 10;
/** Delay between starting each batch (ms) to avoid API rate limits. */
const BATCH_STAGGER_MS = 2000;
const FETCH_TIMEOUT_MS = 5000;

/**
 * Lightweight cron trigger for warm-tomorrow. Runs at 5am UTC daily.
 * Calls the warm-tomorrow logic directly (no HTTP fetch) to avoid Deployment Protection 401.
 * Kicks off multiple batches of 10 fixtures so all needing warming get processed.
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

    for (let i = 0; i < batches.length; i++) {
      await triggerBatch(baseUrl, batches[i], headers);
      if (i < batches.length - 1) {
        await sleep(BATCH_STAGGER_MS);
      }
    }

    const allIds = fixtures.map((f) => f.id);
    return NextResponse.json({
      ok: true,
      triggered: true,
      message: `Started warming ${fixtures.length} fixture(s) in ${batches.length} batch(es).`,
      fixtureIds: allIds,
      batches: batches.length,
    });
  } catch (err) {
    console.error("[warm-tomorrow/cron] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
