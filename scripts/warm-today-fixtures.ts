/**
 * Warm today's fixtures using chunked requests (each under 60s for Vercel Hobby).
 * Per fixture: GET warm?part=home → warm?part=away → GET stats. No upgrade needed.
 *
 * Usage: npm run warm-today
 * Optional: BASE_URL=https://your-app.vercel.app npm run warm-today
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
/** Slightly over 60s so we don't abort before the server responds (Hobby max 60s). */
const REQUEST_TIMEOUT_MS = 70_000;
/** Delay between chunks and between fixtures. */
const DELAY_BETWEEN_CHUNKS_MS = 5_000;
const DELAY_BETWEEN_FIXTURES_MS = 15_000;
/** Retry a fixture's full sequence (home + away + stats) up to this many times. */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(t);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function warmOneFixture(
  id: number,
  label: string
): Promise<{ ok: boolean; error?: string }> {
  const warmHome = await fetchWithTimeout(
    `${BASE_URL}/api/fixtures/${id}/warm?part=home`,
    REQUEST_TIMEOUT_MS
  );
  if (!warmHome.ok) {
    return { ok: false, error: `home: ${warmHome.error ?? warmHome.status}` };
  }
  await sleep(DELAY_BETWEEN_CHUNKS_MS);

  const warmAway = await fetchWithTimeout(
    `${BASE_URL}/api/fixtures/${id}/warm?part=away`,
    REQUEST_TIMEOUT_MS
  );
  if (!warmAway.ok) {
    return { ok: false, error: `away: ${warmAway.error ?? warmAway.status}` };
  }
  await sleep(DELAY_BETWEEN_CHUNKS_MS);

  const stats = await fetchWithTimeout(
    `${BASE_URL}/api/fixtures/${id}/stats`,
    REQUEST_TIMEOUT_MS
  );
  if (!stats.ok) {
    return { ok: false, error: `stats: ${stats.error ?? stats.status}` };
  }
  return { ok: true };
}

async function main() {
  console.log("[warm-today] Fetching fixture list (only fixtures that need warming) ...\n");

  const listRes = await fetch(`${BASE_URL}/api/warm-today`, { cache: "no-store" });
  if (!listRes.ok) {
    console.error(`[warm-today] List failed ${listRes.status}:`, await listRes.text());
    process.exit(1);
  }

  const listData = (await listRes.json()) as {
    ok: boolean;
    message?: string;
    total?: number;
    totalToday?: number;
    fixtures?: { id: number; label: string }[];
  };

  const fixtures = listData.fixtures ?? [];
  const totalToday = listData.totalToday ?? fixtures.length;

  if (fixtures.length === 0) {
    console.log("[warm-today]", listData.message ?? "No fixtures need warming. Done.");
    return;
  }

  console.log("[warm-today]", listData.message ?? "");
  console.log(
    `[warm-today] Warming ${fixtures.length} fixture(s) (chunked: home → away → stats, ${REQUEST_TIMEOUT_MS / 1000}s timeout each, up to ${MAX_RETRIES + 1} attempts).\n`
  );

  const succeeded: string[] = [];
  const failed: { label: string; error: string }[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const { id, label } = fixtures[i];
    let lastError: string | undefined;
    let ok = false;

    for (let attempt = 0; attempt <= MAX_RETRIES && !ok; attempt++) {
      if (attempt > 0) {
        console.log(`[warm-today]   Retry ${attempt}/${MAX_RETRIES} for: ${label}`);
        await sleep(RETRY_DELAY_MS);
      }
      const start = Date.now();
      const result = await warmOneFixture(id, label);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      lastError = result.error;
      ok = result.ok;
      if (ok) {
        succeeded.push(label);
        console.log(`[warm-today]   ${i + 1}/${fixtures.length} ${label}: ✓ ${elapsed}s`);
        break;
      }
      console.log(
        `[warm-today]   ${i + 1}/${fixtures.length} ${label}: ✗ ${result.error ?? "unknown"} (${elapsed}s)`
      );
    }

    if (!ok) failed.push({ label, error: lastError ?? "unknown" });

    if (i < fixtures.length - 1) await sleep(DELAY_BETWEEN_FIXTURES_MS);
  }

  console.log("\n[warm-today] Summary:");
  console.log(`  Succeeded: ${succeeded.length}/${fixtures.length}`);
  if (failed.length) {
    console.log(`  Failed: ${failed.map((f) => `${f.label} (${f.error})`).join("; ")}`);
  }
  if (totalToday > fixtures.length) {
    console.log(`  (${totalToday - fixtures.length} fixture(s) were already warm and skipped.)`);
  }
}

main().catch((err) => {
  console.error("[warm-today] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
