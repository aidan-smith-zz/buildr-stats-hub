/**
 * Warm today's fixtures using chunked requests (each under 60s for Vercel Hobby).
 * Per fixture: home → away → teamstats-home (loop until done) → teamstats-away (loop) → lineup → stats.
 *
 * Speed: Delays between steps are kept short (1.5s / 4s). If you hit rate limits or timeouts,
 * set DELAY_CHUNKS_MS=5000 DELAY_FIXTURES_MS=15000 (or higher) when running.
 *
 * Usage: npm run warm-today
 * Optional: BASE_URL=https://your-app.vercel.app npm run warm-today
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
/** Slightly over 60s so we don't abort before the server responds (Hobby max 60s). */
const REQUEST_TIMEOUT_MS = 75_000;
/** Short delay between steps so we don't hammer the server. Override with DELAY_CHUNKS_MS / DELAY_FIXTURES_MS env. */
const DELAY_BETWEEN_CHUNKS_MS = Number(process.env.DELAY_CHUNKS_MS) || 1_500;
const DELAY_BETWEEN_FIXTURES_MS = Number(process.env.DELAY_FIXTURES_MS) || 4_000;
/** Retry a fixture's full sequence up to this many times. */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS) || 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchResult = { ok: boolean; status?: number; error?: string; data?: { done?: boolean } };

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  parseJson = false
): Promise<FetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    const out: FetchResult = { ok: res.ok, status: res.status };
    if (parseJson && res.ok) {
      try {
        out.data = (await res.json()) as { done?: boolean };
      } catch {
        // ignore
      }
    }
    return out;
  } catch (err) {
    clearTimeout(t);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function warmTeamStatsUntilDone(
  id: number,
  part: "teamstats-home" | "teamstats-away",
  stepRetries = 2
): Promise<{ ok: boolean; error?: string }> {
  for (;;) {
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= stepRetries; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      const res = await fetchWithTimeout(
        `${BASE_URL}/api/fixtures/${id}/warm?part=${part}`,
        REQUEST_TIMEOUT_MS,
        true
      );
      if (res.ok) {
        lastError = undefined;
        if (res.data?.done !== false) return { ok: true };
        break;
      }
      lastError = res.error ?? String(res.status);
    }
    if (lastError) return { ok: false, error: `${part}: ${lastError}` };
    await sleep(DELAY_BETWEEN_CHUNKS_MS);
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

  const teamstatsHome = await warmTeamStatsUntilDone(id, "teamstats-home");
  if (!teamstatsHome.ok) return teamstatsHome;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);

  const teamstatsAway = await warmTeamStatsUntilDone(id, "teamstats-away");
  if (!teamstatsAway.ok) return teamstatsAway;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);

  const lineup = await fetchWithTimeout(
    `${BASE_URL}/api/fixtures/${id}/warm?part=lineup`,
    REQUEST_TIMEOUT_MS
  );
  if (!lineup.ok) {
    return { ok: false, error: `lineup: ${lineup.error ?? lineup.status}` };
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
    `[warm-today] Warming ${fixtures.length} fixture(s) (home → away → teamstats → lineup → stats, ${REQUEST_TIMEOUT_MS / 1000}s timeout per request, up to ${MAX_RETRIES + 1} attempts).\n`
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
    console.log("  Still need warming:");
    failed.forEach((f, i) => console.log(`    ${i + 1}. ${f.label} — ${f.error}`));
  }
  if (totalToday > fixtures.length) {
    console.log(`  (${totalToday - fixtures.length} fixture(s) were already warm and skipped.)`);
  }
}

main().catch((err) => {
  console.error("[warm-today] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
