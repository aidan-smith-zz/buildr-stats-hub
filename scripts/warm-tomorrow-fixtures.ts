/**
 * Warm tomorrow's fixtures (player and team stats) using the same chunked flow as warm-today.
 * Uses fixtures from UpcomingFixture for tomorrow; materializes them into the Fixture table via the API.
 * Run this as a one-off before busy days so warm-today uses fewer API calls.
 * Site behaviour is unchanged (only today's fixtures are shown).
 *
 * Prerequisite: UpcomingFixture must contain tomorrow's fixtures (run warm-today without --resume once to refresh).
 *
 * If you run out of API calls partway through: that's fine. The next day, run:
 *   npm run warm-today -- --resume
 * That uses today's fixtures from the DB (no list refetch) and only warms fixtures that still need
 * player/team stats, so you only use API allowance for the remaining data.
 *
 * Usage: npm run warm-tomorrow              # Warm fixtures that need it
 *        npm run warm-tomorrow -- --force   # Re-warm all of tomorrow's fixtures
 * Optional: BASE_URL=https://your-app.vercel.app npm run warm-tomorrow
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const LEAGUES_TEAM_STATS_ONLY = [41, 42];
const REQUEST_TIMEOUT_MS = 75_000;
const DELAY_BETWEEN_CHUNKS_MS = Number(process.env.DELAY_CHUNKS_MS) || 1_500;
const DELAY_BETWEEN_FIXTURES_MS = Number(process.env.DELAY_FIXTURES_MS) || 4_000;
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.CONCURRENCY) || 1));
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS) || 5_000;
const MAX_TEAMSTATS_ROUNDS = 10;

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
  part: "teamstats" | "teamstats-home" | "teamstats-away",
  stepRetries = 2,
  logLabel?: string
): Promise<{ ok: boolean; error?: string }> {
  let round = 0;
  for (;;) {
    round += 1;
    if (round > MAX_TEAMSTATS_ROUNDS) {
      if (logLabel) {
        console.log(`[warm-tomorrow]     ${logLabel} stopped after ${MAX_TEAMSTATS_ROUNDS} rounds (safety cap). Run again to continue.`);
      }
      return { ok: true };
    }
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
        const done = res.data?.done !== false;
        if (logLabel) {
          console.log(`[warm-tomorrow]     ${logLabel} round ${round}: ${done ? "done" : "more"}`);
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

async function warmOneFixtureTeamStatsOnly(
  id: number,
  label: string,
  logPrefix: string
): Promise<{ ok: boolean; error?: string }> {
  const teamstats = await warmTeamStatsUntilDone(id, "teamstats", 2, `${logPrefix} teamstats`);
  if (!teamstats.ok) return teamstats;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const stats = await fetchWithTimeout(`${BASE_URL}/api/fixtures/${id}/stats`, REQUEST_TIMEOUT_MS);
  if (!stats.ok) return { ok: false, error: `stats: ${stats.error ?? stats.status}` };
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
  const warmHome = await fetchWithTimeout(`${BASE_URL}/api/fixtures/${id}/warm?part=home`, REQUEST_TIMEOUT_MS);
  if (!warmHome.ok) return { ok: false, error: `home: ${warmHome.error ?? warmHome.status}` };
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const warmAway = await fetchWithTimeout(`${BASE_URL}/api/fixtures/${id}/warm?part=away`, REQUEST_TIMEOUT_MS);
  if (!warmAway.ok) return { ok: false, error: `away: ${warmAway.error ?? warmAway.status}` };
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const teamstatsHome = await warmTeamStatsUntilDone(id, "teamstats-home");
  if (!teamstatsHome.ok) return teamstatsHome;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const teamstatsAway = await warmTeamStatsUntilDone(id, "teamstats-away");
  if (!teamstatsAway.ok) return teamstatsAway;
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const lineup = await fetchWithTimeout(`${BASE_URL}/api/fixtures/${id}/warm?part=lineup`, REQUEST_TIMEOUT_MS);
  if (!lineup.ok) return { ok: false, error: `lineup: ${lineup.error ?? lineup.status}` };
  await sleep(DELAY_BETWEEN_CHUNKS_MS);
  const stats = await fetchWithTimeout(`${BASE_URL}/api/fixtures/${id}/stats`, REQUEST_TIMEOUT_MS);
  if (!stats.ok) return { ok: false, error: `stats: ${stats.error ?? stats.status}` };
  return { ok: true };
}

function hasForceFlag(): boolean {
  return process.argv.slice(2).includes("--force");
}

async function main() {
  const force = hasForceFlag();
  if (force) {
    console.log("[warm-tomorrow] Force mode: re-warming all of tomorrow's fixtures.\n");
  }
  console.log("[warm-tomorrow] Fetching tomorrow's fixture list (from UpcomingFixture) ...\n");

  const params = new URLSearchParams();
  if (force) params.set("forceWarm", "1");
  const listUrl = `${BASE_URL}/api/warm-tomorrow${params.toString() ? "?" + params.toString() : ""}`;
  const listRes = await fetch(listUrl, { cache: "no-store" });
  if (!listRes.ok) {
    console.error(`[warm-tomorrow] List failed ${listRes.status}:`, await listRes.text());
    process.exit(1);
  }

  const listData = (await listRes.json()) as {
    ok: boolean;
    message?: string;
    total?: number;
    totalTomorrow?: number;
    dateKey?: string;
    hint?: string;
    fixtures?: { id: number; label: string; leagueId?: number }[];
  };

  const fixtures = listData.fixtures ?? [];
  const totalTomorrow = listData.totalTomorrow ?? fixtures.length;
  const dateKey = listData.dateKey;

  if (fixtures.length === 0) {
    console.log("[warm-tomorrow]", listData.message ?? "No fixtures need warming. Done.");
    if (dateKey) console.log("[warm-tomorrow] Date:", dateKey, "(Europe/London)");
    if (listData.hint) console.log("[warm-tomorrow]", listData.hint);
    return;
  }

  const teamStatsOnlyCount = fixtures.filter(
    (f) => f.leagueId != null && LEAGUES_TEAM_STATS_ONLY.includes(f.leagueId)
  ).length;
  console.log("[warm-tomorrow]", listData.message ?? "");
  if (listData.hint) {
    console.log("[warm-tomorrow]", listData.hint);
  }
  console.log(
    `[warm-tomorrow] Warming ${fixtures.length} fixture(s) (${teamStatsOnlyCount} League 1/2, ${fixtures.length - teamStatsOnlyCount} full)${CONCURRENCY > 1 ? `, ${CONCURRENCY} in parallel` : ""}.\n`
  );

  const succeeded: string[] = [];
  const failed: { label: string; error: string }[] = [];

  async function warmWithRetries(
    fixture: { id: number; label: string; leagueId?: number },
    index: number
  ): Promise<void> {
    const { id, label, leagueId } = fixture;
    const prefix = `${index + 1}/${fixtures.length} ${label}`;
    console.log(`[warm-tomorrow]   Starting ${prefix} ...`);
    let lastError: string | undefined;
    let ok = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !ok; attempt++) {
      if (attempt > 0) {
        console.log(`[warm-tomorrow]   Retry ${attempt}/${MAX_RETRIES} for: ${label}`);
        await sleep(RETRY_DELAY_MS);
      }
      const start = Date.now();
      const result = await warmOneFixture(id, label, leagueId, prefix);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      lastError = result.error;
      ok = result.ok;
      if (ok) {
        succeeded.push(label);
        console.log(`[warm-tomorrow]   ${index + 1}/${fixtures.length} ${label}: ✓ ${elapsed}s`);
        return;
      }
      console.log(`[warm-tomorrow]   ${index + 1}/${fixtures.length} ${label}: ✗ ${result.error ?? "unknown"} (${elapsed}s)`);
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

  console.log("\n[warm-tomorrow] Summary:");
  console.log(`  Succeeded: ${succeeded.length}/${fixtures.length}`);
  if (failed.length) {
    console.log("  Still need warming:");
    failed.forEach((f, i) => console.log(`    ${i + 1}. ${f.label} — ${f.error}`));
    console.log("  → Run warm-today --resume tomorrow to finish these without refetching the fixture list.");
  }
  if (totalTomorrow > fixtures.length) {
    console.log(`  (${totalTomorrow - fixtures.length} fixture(s) were already warm and skipped.)`);
  }
}

main().catch((err) => {
  console.error("[warm-tomorrow] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
