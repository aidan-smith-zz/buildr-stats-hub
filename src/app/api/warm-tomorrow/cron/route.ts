import { NextRequest, NextResponse } from "next/server";
import { getFixturesNeedingWarm } from "@/lib/warmTomorrowService";

/**
 * Lightweight cron trigger for warm-tomorrow. Runs at 5am UTC daily.
 * Calls the warm-tomorrow logic directly (no HTTP fetch) to avoid Deployment Protection 401.
 * Takes first 10 fixtures and kicks off the batch chain.
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

    const batchSize = 10;
    const batch = fixtures.slice(0, batchSize);
    const fixtureIds = batch.map((f) => f.id).join(",");

    const baseUrl = getBaseUrl();
    const batchUrl = `${baseUrl}/api/warm-tomorrow/batch?part=home&fixtureIds=${fixtureIds}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(batchUrl, {
        cache: "no-store",
        signal: controller.signal,
        headers: getInternalFetchHeaders(),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
      } else {
        console.error("[warm-tomorrow/cron] Batch trigger error:", e);
      }
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json({
      ok: true,
      triggered: true,
      message: `Started warming ${batch.length} fixture(s). ${fixtures.length - batch.length} remaining (run manually or wait for next cron).`,
      fixtureIds: batch.map((f) => f.id),
    });
  } catch (err) {
    console.error("[warm-tomorrow/cron] Fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
