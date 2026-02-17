/**
 * Warm the cache for today's fixtures by calling the app's warm-today API.
 * Run once in the morning. Start the app first (npm run dev), then run this script.
 *
 * Usage: npm run warm-today
 * Optional: BASE_URL=https://your-app.vercel.app npm run warm-today
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  console.log(`[warm-today] Calling ${BASE_URL}/api/warm-today ...`);
  console.log("[warm-today] This may take several minutes if fixtures need to be loaded from the API.\n");

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/warm-today`, { cache: "no-store" });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!res.ok) {
    const body = await res.text();
    console.error(`[warm-today] Error ${res.status}:`, body);
    process.exit(1);
  }

  const data = (await res.json()) as {
    ok: boolean;
    message?: string;
    warmed?: number;
    total?: number;
    results?: { fixtureId: number; label: string; ok: boolean; elapsedSec: number; error?: string }[];
  };

  if (data.message) console.log("[warm-today]", data.message);
  if (data.results?.length) {
    for (const r of data.results) {
      const status = r.ok ? `✓ ${r.elapsedSec.toFixed(1)}s` : `✗ ${r.error ?? "failed"}`;
      console.log(`[warm-today]   ${r.label}: ${status}`);
    }
  }
  console.log(`\n[warm-today] Done in ${elapsed}s. Today's fixtures are warmed.`);
}

main().catch((err) => {
  console.error("[warm-today] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
