/**
 * Warm today's fixtures using chunked requests (each under 60s for Vercel Hobby).
 * Per fixture: home → away → teamstats (or teamstats-home/away) → lineup → stats.
 * League 1/2 (team-stats-only): only teamstats + stats (faster). Warming is incremental:
 * the server only fetches fixture stats not already in cache, so you can stop and resume.
 *
 * Speed: Delays between steps are kept short (1.5s / 4s). If you hit rate limits or timeouts,
 * set DELAY_CHUNKS_MS=5000 DELAY_FIXTURES_MS=15000 (or higher) when running.
 * Set CONCURRENCY=2 to warm 2 fixtures in parallel (faster, higher load).
 *
 * Usage: npm run warm-today              # Full run: refresh fixture list, then warm
 *        npm run warm-today -- --resume   # Resume: skip refresh, only warm what's left (faster)
 * Optional: BASE_URL=https://your-app.vercel.app npm run warm-today
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
/** League 1 (43) and League 2 (44): no player stats or lineup, skip those steps. */
const LEAGUES_TEAM_STATS_ONLY = [41, 42];
/** Slightly over 60s so we don't abort before the server responds (Hobby max 60s). */
const REQUEST_TIMEOUT_MS = 75_000;
/** Short delay between steps so we don't hammer the server. Override with DELAY_CHUNKS_MS / DELAY_FIXTURES_MS env. */
const DELAY_BETWEEN_CHUNKS_MS = Number(process.env.DELAY_CHUNKS_MS) || 1_500;
const DELAY_BETWEEN_FIXTURES_MS = Number(process.env.DELAY_FIXTURES_MS) || 4_000;
/** How many fixtures to warm in parallel (1 = sequential). Increase for speed; watch rate limits. */
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.CONCURRENCY) || 1));
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

/** Safety cap: stop after this many rounds so we don't loop forever (e.g. if cache isn't being found). */
const MAX_TEAMSTATS_ROUNDS = 10;

async function warmTeamStatsUntilDone(
  id: number,
  part: "teamstats" | "teamstats-home" | "teamstats-away",
  stepRetries = 2,
  logLabel?: string
): Promise<{ ok: boolean; error?: string }> {
  let round = 0;
  for (;;) {
    round += 1;
    if (round > MAX_TEAMSTATS_ROUNDS) {
      if (logLabel) {
        console.log(`[warm-today]     ${logLabel} stopped after ${MAX_TEAMSTATS_ROUNDS} rounds (safety cap). Run again to continue.`);
      }
      return { ok: true };
    }
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= stepRetries; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS);
      const reqStart = Date.now();
      const res = await fetchWithTimeout(
        `${BASE_URL}/api/fixtures/${id}/warm?part=${part}`,
        REQUEST_TIMEOUT_MS,
        true
      );
      const elapsed = ((Date.now() - reqStart) / 1000).toFixed(1);
      if (res.ok) {
        lastError = undefined;
        const done = res.data?.done !== false;
        if (logLabel) {
          console.log(`[warm-today]     ${logLabel} round ${round}: ${done ? "done" : "more"} (${elapsed}s)`);
        }
        if (done) return { ok: true };
        break;
      }
      lastError = res.error ?? String(res.status);
    }
    if (lastError) return { ok: false, error: `${part}: ${lastError}` };
    await sleep(DELAY_BETWEEN_CHUNKS_MS);
  }
}

/** League 1/2: single teamstats (both teams in one request) then stats — far fewer round-trips. */
async function warmOneFixtureTeamStatsOnly(
  id: number,
  label: string,
  logPrefix: string
): Promise<{ ok: boolean; error?: string }> {
  const teamstats = await warmTeamStatsUntilDone(id, "teamstats", 2, `${logPrefix} teamstats`);
  if (!teamstats.ok) return teamstats;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);

  const statsStart = Date.now();
  const stats = await fetchWithTimeout(
    `${BASE_URL}/api/fixtures/${id}/stats`,
    REQUEST_TIMEOUT_MS
  );
  const statsElapsed = ((Date.now() - statsStart) / 1000).toFixed(1);
  if (logPrefix) {
    console.log(`[warm-today]     ${logPrefix} stats: ${stats.ok ? "ok" : "failed"} (${statsElapsed}s)`);
  }
  if (!stats.ok) {
    return { ok: false, error: `stats: ${stats.error ?? stats.status}` };
  }
  return { ok: true };
}

async function warmOneFixture(
  id: number,
  label: string,
  leagueId?: number,
  logPrefix?: string
): Promise<{ ok: boolean; error?: string }> {
  if (leagueId != null && LEAGUES_TEAM_STATS_ONLY.includes(leagueId)) {
    return warmOneFixtureTeamStatsOnly(id, label, logPrefix ?? "");
  }

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

function hasResumeFlag(): boolean {
  const argv = process.argv.slice(2);
  return argv.includes("--resume");
}

async function main() {
  const resume = hasResumeFlag();
  if (resume) {
    console.log("[warm-today] Resume mode: using DB only (skip refresh), warming from where you left off.\n");
  } else {
    console.log("[warm-today] Full run: refreshing fixture list, then warming.\n");
  }
  console.log("[warm-today] Fetching fixture list (only fixtures that need warming) ...\n");

  const listUrl = resume ? `${BASE_URL}/api/warm-today?skipRefresh=1` : `${BASE_URL}/api/warm-today`;
  const listRes = await fetch(listUrl, { cache: "no-store" });
  if (!listRes.ok) {
    console.error(`[warm-today] List failed ${listRes.status}:`, await listRes.text());
    process.exit(1);
  }

  const listData = (await listRes.json()) as {
    ok: boolean;
    message?: string;
    total?: number;
    totalToday?: number;
    fixtures?: { id: number; label: string; leagueId?: number }[];
  };

  const fixtures = listData.fixtures ?? [];
  const totalToday = listData.totalToday ?? fixtures.length;

  if (fixtures.length === 0) {
    console.log("[warm-today]", listData.message ?? "No fixtures need warming. Done.");
    if (resume && (listData.totalToday ?? 0) === 0) {
      console.log("[warm-today] Tip: run without --resume first to fetch today's fixtures, then use --resume to continue warming.");
    }
    return;
  }

  const teamStatsOnlyCount = fixtures.filter(
    (f) => f.leagueId != null && LEAGUES_TEAM_STATS_ONLY.includes(f.leagueId)
  ).length;
  console.log("[warm-today]", listData.message ?? "");
  console.log(
    `[warm-today] Warming ${fixtures.length} fixture(s) (${teamStatsOnlyCount} League 1/2 short path, ${fixtures.length - teamStatsOnlyCount} full)${CONCURRENCY > 1 ? `, ${CONCURRENCY} in parallel` : ""}, ${REQUEST_TIMEOUT_MS / 1000}s timeout, up to ${MAX_RETRIES + 1} attempts.\n`
  );

  const succeeded: string[] = [];
  const failed: { label: string; error: string }[] = [];

  async function warmWithRetries(
    fixture: { id: number; label: string; leagueId?: number },
    index: number
  ): Promise<void> {
    const { id, label, leagueId } = fixture;
    const prefix = `${index + 1}/${fixtures.length} ${label}`;
    console.log(`[warm-today]   Starting ${prefix} ...`);
    let lastError: string | undefined;
    let ok = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !ok; attempt++) {
      if (attempt > 0) {
        console.log(`[warm-today]   Retry ${attempt}/${MAX_RETRIES} for: ${label}`);
        await sleep(RETRY_DELAY_MS);
      }
      const start = Date.now();
      const result = await warmOneFixture(id, label, leagueId, prefix);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      lastError = result.error;
      ok = result.ok;
      if (ok) {
        succeeded.push(label);
        console.log(`[warm-today]   ${index + 1}/${fixtures.length} ${label}: ✓ ${elapsed}s`);
        return;
      }
      console.log(
        `[warm-today]   ${index + 1}/${fixtures.length} ${label}: ✗ ${result.error ?? "unknown"} (${elapsed}s)`
      );
    }
    failed.push({ label, error: lastError ?? "unknown" });
  }

  for (let i = 0; i < fixtures.length; i += CONCURRENCY) {
    const chunk = fixtures.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((f, j) => warmWithRetries(f, i + j)));
    if (i + chunk.length < fixtures.length) {
      await sleep(DELAY_BETWEEN_FIXTURES_MS);
    }
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
