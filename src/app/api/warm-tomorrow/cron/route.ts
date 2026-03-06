import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight cron trigger for warm-tomorrow. Runs at 5am UTC daily.
 * Fetches the list of fixtures needing warming, takes first 5, and kicks off the batch chain.
 * Does NOT await the batch - returns quickly to stay within free tier limits.
 */
export const maxDuration = 10;

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = getBaseUrl();

  try {
    const listRes = await fetch(`${baseUrl}/api/warm-tomorrow`, { cache: "no-store" });
    if (!listRes.ok) {
      console.error("[warm-tomorrow/cron] List failed:", listRes.status);
      return NextResponse.json(
        { ok: false, error: `List failed ${listRes.status}` },
        { status: 500 }
      );
    }

    const listData = (await listRes.json()) as {
      ok: boolean;
      fixtures?: { id: number; label: string }[];
      message?: string;
    };

    const fixtures = listData.fixtures ?? [];
    if (fixtures.length === 0) {
      return NextResponse.json({
        ok: true,
        triggered: false,
        message: listData.message ?? "No fixtures need warming.",
      });
    }

    const batchSize = 5;
    const batch = fixtures.slice(0, batchSize);
    const fixtureIds = batch.map((f) => f.id).join(",");

    const batchUrl = `${baseUrl}/api/warm-tomorrow/batch?part=home&fixtureIds=${fixtureIds}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(batchUrl, { cache: "no-store", signal: controller.signal });
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
