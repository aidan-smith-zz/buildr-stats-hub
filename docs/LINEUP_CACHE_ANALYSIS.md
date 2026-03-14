# Lineup not loading on Vercel (works locally) – analysis

**Symptom:** Chelsea vs Newcastle fixture, 23 mins before kickoff: lineup loads on local, does not load on Vercel (production).

**No code changes in this doc – analysis only.**

---

## 1. How lineups get loaded

1. **Match page** (e.g. `/fixtures/2025-03-15/premier-league/chelsea-newcastle`) uses `TodayFixturesDashboard`, which **client-side** fetches:
   - `GET /api/fixtures/{fixtureId}/stats` with `cache: "no-store"`.

2. **GET /api/fixtures/[id]/stats** (see `src/app/api/fixtures/[id]/stats/route.ts`):
   - Calls `getFixtureStatsCached(id)` → **unstable_cache** with key `["fixture-stats", id]`, **revalidate: 25200** (7 hours).
   - If cache **hit**: returns the cached `FixtureStatsResponse` (from whenever that entry was first filled).
   - Computes `inLineupWindow = isWithinLineupFetchWindow(kickoff, new Date())` (30 min before → 2h after kickoff).
   - Loads `lineupByTeam = await getLineupForFixture(id)` from DB.
   - **Second chance:** if `inLineupWindow && !stats.hasLineup && lineupByTeam.size === 0`, it:
     - Calls `ensureLineupIfWithinWindow(...)` (fetches lineups from external API, writes to DB),
     - Then `lineupByTeam = await getLineupForFixture(id)` again,
     - Then `stats = mergeLineupIntoStats(stats, lineupByTeam)` and returns that.

3. **ensureLineupIfWithinWindow** (in `lineupService.ts`):
   - If lineup rows already exist for this fixture → return (no fetch).
   - If **not** in lineup window → return (no fetch).
   - Otherwise calls `fetchFixtureLineups(fixtureApiId)` (external API), then writes to `FixtureLineup` and related tables.

So the route is designed to “fix” missing lineup even when the **cached** stats have no lineup, as long as we’re in the window and the fetch + DB read succeed.

---

## 2. Why local vs Vercel can differ

### 2.1 Stale `unstable_cache` (most likely)

- **First** request for that fixture (e.g. hours before kickoff, or from another page) runs `getFixtureStats(id)` and fills **unstable_cache** with a response that has **no lineup** (either outside the 30‑min window, or API hadn’t released lineups yet).
- Cache is kept for **7 hours** (`revalidate: 25200`).
- On Vercel, **unstable_cache** is backed by the Data Cache and can be shared across serverless invocations, so that “no lineup” result can be reused.
- When you open the match **23 mins before kickoff**:
  - `getFixtureStatsCached(id)` **hits** that old cache → `stats` has `hasLineup: false`.
  - The route then does the “second chance”: `inLineupWindow` is true, it calls `ensureLineupIfWithinWindow`, then `getLineupForFixture`, then `mergeLineupIntoStats`.
- So **if** the second chance always ran and succeeded, you’d still get a lineup in the response. So the problem is likely that on Vercel one of the following happens **when** we rely on that second chance.

### 2.2 ensureLineupIfWithinWindow fails on Vercel

- **Timeouts:** Serverless has a max duration (e.g. 60s). If the external lineup API is slow or rate-limited, the request might time out before the lineup is stored.
- **Cold start:** First invocation can be slow; the external request might hit a timeout or fail.
- **Rate limiting:** If many fixtures are being warmed or many users hit at once, the external API might return 429; the code doesn’t retry, so no lineup is written.
- **Env:** Missing or wrong `FOOTBALL_API_*` on Vercel would cause the fetch to fail; local might have correct env.

If `ensureLineupIfWithinWindow` throws or returns without writing, the second `getLineupForFixture(id)` still sees no rows, so we return the cached stats without lineup.

### 2.3 Read‑after‑write / replication lag (Vercel Postgres or pooled DB)

- We **write** lineup in `ensureLineupIfWithinWindow` (same request).
- We then **read** with `getLineupForFixture(id)` in the same request.
- If the DB uses replicas for reads (e.g. Vercel Postgres with read replicas, or PgBouncer in front of a replicated setup), the read might hit a replica that **hasn’t** received the write yet → `lineupByTeam.size === 0` even though the write succeeded.
- Locally you often have a single DB instance, so read‑after‑write sees the data → lineup appears.

### 2.4 Timezone and “in window”

- `isWithinLineupFetchWindow(kickoffTime, now)` uses `kickoffTime` (from DB) and `now = new Date()` (server time).
- **kickoffTime:** From Prisma `fixture.date`. If that’s stored as UTC (or with offset), it’s consistent. If it’s stored as a local-time string without offset and Prisma/Node interpret it as server local time, then:
  - **Local:** server “now” and “kickoff” are both in your local time → window correct.
  - **Vercel:** server is UTC; if `fixture.date` is interpreted differently (e.g. as UTC when it was meant to be UK), “now” could be outside the window on Vercel (e.g. we think we’re still 31 mins before kickoff) → `inLineupWindow === false` → we never call `ensureLineupIfWithinWindow` and never merge lineup.
- So a timezone/interpretation bug could make the “second chance” path never run on Vercel.

### 2.5 HTTP / CDN caching (less likely if no-store is respected)

- The route sets `Cache-Control: private, no-store, max-age=0` when `inLineupWindow && !stats.hasLineup`, so the “no lineup” response is not supposed to be cached by the browser or CDN.
- If something (e.g. a proxy or misconfiguration) still caches that response, repeat requests would get “no lineup” without hitting the server. Worth checking response headers on Vercel for that route.

---

## 3. Summary of likely causes

| Cause | Local | Vercel |
|--------|--------|--------|
| Stale 7h cache with no lineup | Same cache can be warm with “no lineup” if the first request was outside the window or before lineups were available. | Same; cache can be shared across invocations. |
| Second chance (ensureLineup + merge) | Runs in same process; external API and DB usually fast; read-after-write sees data. | Can fail (timeout, cold start, rate limit); or read-after-write can miss due to replication lag. |
| Timezone / “in window” | Server time and kickoff interpretation can match your expectation. | UTC server + wrong interpretation of `fixture.date` can make `inLineupWindow` false so we never fetch/merge lineup. |

So the “weirdness with the cache” is probably a **combination** of:

1. **unstable_cache** serving an old “no lineup” result for 7 hours, and  
2. On Vercel, the **second chance** either failing (fetch/timeout/rate limit) or not running (timezone), or the lineup **write** succeeding but the **read** not seeing it (replication lag).

---

## 4. Directions for a fix (when you implement)

1. **Don’t serve 7h cache when we’re in the lineup window and lineup is missing**
   - In the stats route: if `inLineupWindow && !stats.hasLineup`, **bypass** `getFixtureStatsCached` for that request and call `getFixtureStats(id)` (or an uncached path) so we always run the full flow including `ensureLineupIfWithinWindow` and the merge.  
   - Or: when in lineup window, use a **shorter revalidate** or a **separate cache key** (e.g. include “lineup-window” or date-hour) so we don’t reuse a 7h-old “no lineup” result.

2. **Ensure kickoff / “now” are consistent and correct**
   - Store and interpret `fixture.date` in a single timezone (e.g. UTC) everywhere.  
   - Use that same interpretation for `isWithinLineupFetchWindow(kickoff, now)` so local and Vercel behave the same.

3. **Make the “second chance” robust on Vercel**
   - After `ensureLineupIfWithinWindow`, if `getLineupForFixture(id)` is still empty and we’re in the window, optionally **retry** the read once after a short delay (e.g. 200–500 ms) to reduce impact of replication lag.  
   - Or: use a **single connection/transaction** for “write lineup then read it back” so the read is guaranteed to see the write (if your DB supports it and you’re not forced onto a read replica).

4. **Observability**
   - Log when we’re in the lineup window, when we call `ensureLineupIfWithinWindow`, and when we still have `lineupByTeam.size === 0` after it (and whether the external fetch threw). That will confirm whether the issue is “second chance not run”, “fetch failed”, or “write succeeded, read missed”.

5. **Optional: revalidate cache when lineup is fetched**
   - After successfully storing a lineup (e.g. in `ensureLineupIfWithinWindow` or in the route), call `revalidatePath` or the appropriate cache invalidation for that fixture’s stats so the next request doesn’t rely on the 7h cache with no lineup.

Implementing (1) and (2) should remove most of the “cache weirdness” and align local vs Vercel; (3) and (4) help with production reliability and debugging.
