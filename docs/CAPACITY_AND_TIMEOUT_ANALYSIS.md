# Capacity and timeout analysis (no code changes)

**Goal:** Estimate how many concurrent users the site can handle without timeouts, and what is causing timeouts.

---

## 1. Where timeouts come from

You can see timeouts from three places:

| Source | What happens | Typical limit |
|--------|----------------|---------------|
| **Prisma P2024** | “Timed out fetching a new connection from the connection pool.” Request needed a DB connection, pool was full, waited 10s, then failed. | Pool timeout 10s, connection limit = pool size. |
| **Vercel function** | Function runs longer than `maxDuration` (or plan default) and is killed. | 60s where you set it (match page, stats, warm, date page); default 10s (Hobby) or 300s (Pro) elsewhere. |
| **External API** | API-Football slow or 429 → your route waits → total time can exceed function timeout or user patience. | 1 req/s per process (your rate limit); provider limits apply. |

So “timeouts” are mostly either **waiting for a DB connection** (P2024) or **request taking longer than function timeout**.

---

## 2. The real bottleneck: database connections

- The app uses **at most one DB connection per serverless invocation** when `connection_limit=1` is set (in code when not in `DATABASE_URL`).
- So **every request that touches the DB holds one connection for the whole duration** of that request (including time spent in external API calls).
- The **pooler** (Supabase, Neon, Vercel Postgres, etc.) has a **fixed max number of connections** (e.g. 15–25 on free/small tiers; Supabase pooler can be higher e.g. 200 on some plans).
- So:
  - **Concurrent requests that use the DB ≤ pool size.**
  - If more requests arrive than the pool size, the extra ones **wait**. If they wait longer than **10 seconds**, Prisma throws **P2024** and you see a timeout/error.

So the site’s capacity is effectively: **how many concurrent DB-using requests can complete within their timeout**, which is capped by **pool size** and **how long each request holds a connection**.

---

## 3. How long does each request hold a connection?

Rough **duration per request** (one connection held for this long):

| Request type | Typical duration | When it gets worse |
|--------------|------------------|--------------------|
| Home `/` (cache hit) | ~0.5–2 s | - |
| Home `/` (cache miss) | ~5–60 s | Fixture refresh: many leagues × 1.2 s delay + DB upserts. |
| Today fixtures `/fixtures/[date]` (cache hit) | ~1–3 s | - |
| Today fixtures (cache miss) | ~5–30 s | DB + possible refresh. |
| Live list `/fixtures/live` | ~2–15 s | 1 × `findMany`, 1 × external API (`fetchAllLiveFixtures`), then batched upserts (5 at a time). |
| Match page `/fixtures/.../.../...` | ~2–60 s | Can call `getFixtureStats` (DB + optional external API for lineups/player stats). |
| Stats API `GET /api/fixtures/[id]/stats` | ~2–60 s | Same as above; can bypass cache and call external API. |
| Single live `GET /api/fixtures/[id]/live` | ~0.5–5 s | DB + optionally 1 × API-Football. |
| Warm, refresh, cron-style | 30–60 s | Many DB + external API calls. |

So under load:

- **Cache hits:** many requests finish in 1–3 s → connection released quickly.
- **Cache misses / heavy paths:** same number of connections held for 5–60 s → fewer requests per second can be served without queueing.

---

## 4. Capacity formula (no code changes)

Let:

- **C** = number of DB connections available (pool size from your pooler plan).
- **T** = average time (seconds) each request holds a connection.

Then the **sustainable request rate** (requests per second) is about:

**R ≈ C / T**

- If **C = 20** and **T = 5 s** → R ≈ **4 req/s**.
- If **C = 20** and **T = 15 s** (e.g. many cache misses or heavy pages) → R ≈ **1.3 req/s**.

If the **incoming request rate** is higher than R, requests start waiting for a free connection. After **10 s** wait, Prisma throws P2024 → **timeout**.

So “how many users at once?” depends what each “user” does:

- If each user does **2 requests in 10 seconds** (e.g. home + one other page) and **T = 5 s** and **C = 20**:
  - You can do **4 req/s** → **2 “users” per second** → **~120 users per minute** (each doing 2 req in 10 s).
- If each user does **4 requests in 30 seconds** (home, live list, match, stats) and **T = 10 s** and **C = 20**:
  - R = 20/10 = **2 req/s** → 2/4 × 30 = **15 “users” per 30 s** → **~30 users per minute** (everyone doing that pattern).

So a **conservative ballpark** for “users at once” so that **no one hits timeouts**:

- **Pool size 15–20, mixed traffic (some cache hits, some heavy):**  
  **~20–40 concurrent users** (each doing a few requests over 30–60 s) if you want to avoid P2024.
- **Pool size 15–20, mostly cache hits (T ≈ 2 s):**  
  **~50–80 concurrent users**.
- **Pool size 15–20, many cache misses / heavy routes (T ≈ 15 s):**  
  **~10–20 concurrent users** before the queue builds and 10 s pool timeouts start.

So in one sentence: **with a typical small pool (15–25 connections), the site can handle on the order of low tens of concurrent users (e.g. 20–40) without timeouts when traffic is mixed; fewer if many requests are heavy or cache is cold.**

---

## 5. Why crawlers make it worse

- Crawlers (Google, Bing, etc.) send **many concurrent requests** (different URLs in parallel).
- Each request = 1 connection for its full duration.
- So **10 crawler requests + 10 real users** can already be **20 connections** → pool full → next request waits → P2024 after 10 s.
- So “how many users can I handle” is **shared with crawlers**: the same pool serves both. A burst of crawler traffic can push real users into timeout even if “user count” is low.

---

## 6. What your app already does to reduce timeouts

- **connection_limit=1** in code (when not in URL) so each invocation uses at most one connection → no single request burns several connections.
- **Sequential DB** in hot paths (home, fixtures, stats, warm, etc.) so one request doesn’t hold multiple connections.
- **Batched live-score upserts** (5 at a time) in `getLiveScoresForToday` so one live list request doesn’t spike to N connections.
- **withPoolRetry** on API routes (stats, live, warm-today, etc.) so a single P2024 can be retried instead of failing immediately.
- **Caching** (today fixtures 60 s, stats 90 s / 7 h, etc.) so many requests are served from cache and release the connection quickly.
- **maxDuration = 60** on heavy routes (match page, stats, warm, date page) so the platform doesn’t kill them at 10 s.

So the design is already oriented to “one connection per request” and “don’t hold it longer than needed”; the limit is **pool size** and **request duration**, not “too many parallel Prisma calls in one request.”

---

## 7. Summary: “How many users at one time?”

| Assumption | Approx. concurrent users (no timeouts) |
|------------|----------------------------------------|
| Pool ≈ 20, mixed traffic, T ≈ 5–10 s | **20–40** |
| Pool ≈ 20, mostly cache hits, T ≈ 2 s | **50–80** |
| Pool ≈ 20, many heavy/cold, T ≈ 15 s | **10–20** |
| Pool ≈ 15 (e.g. strict free tier) | About **2/3** of the above |
| Pool ≈ 50–100 (e.g. paid pooler) | Roughly **2.5–5×** the above |

So **without any code or config changes**, a reasonable answer is:

- **You can handle on the order of 20–40 concurrent users (at once) without timeouts** if your pool is ~20 and traffic is mixed.
- If you see timeouts, it’s usually because **concurrent demand (users + crawlers) is exceeding that**, or because **many requests are slow** (cache miss, external API, or cold start) so T is high and R = C/T drops.

---

## 8. How to confirm your limits (no code changes)

1. **Check your pool size**  
   In Supabase/Neon/Vercel Postgres docs or dashboard: max connections for the **pooler** (e.g. port 6543 for Supabase). That’s your **C**.

2. **Check logs when timeouts happen**  
   Vercel → Project → Logs. Look for **P2024** (connection timeout) or **FUNCTION_INVOCATION_TIMEOUT** / maxDuration. That tells you whether the limit is **pool** or **function time**.

3. **Rough T from logs**  
   If you have request duration in logs, average it over a busy period. Use that as **T** and then **C / T** = sustainable req/s.

4. **Crawler impact**  
   In Vercel (or your host) you can see referrer/user-agent. If a large share of requests are crawlers during timeouts, that explains why “few users” still hit limits.

---

## 9. Suggested changes to reduce timeouts

Prioritised by impact and effort. Implementing even the first two will shorten how long requests hold connections and reduce P2024s.

### High impact, low–medium effort

**1. Add timeouts to all external API calls**

If API-Football is slow or returns 429, your request currently waits until the platform kills it (e.g. 60s). That holds a DB connection the whole time.

- **Where:** `src/lib/footballApi.ts` – the shared `request()` (or the `fetch` it uses) and/or `rateLimitedFetch`.
- **Change:** Use `AbortController` + `setTimeout(..., 10000)` (e.g. 10–15s) so every outbound request aborts after N seconds. Catch abort, return null or throw a clear “timeout” so callers can fall back to cache/stale.
- **Callers to handle timeout:**  
  - `liveScoresService.getLiveScoresForToday()` → on timeout, return `{ scores: [], error: "timeout" }` and optionally leave cache as-is so the live list can still render from DB.  
  - `fetchLiveFixture` (used by `/api/fixtures/[id]/live` and match page) → on timeout, return null so the route uses cache or a safe default.  
  - Any fixture refresh in `fixturesService` → on timeout, fail that league’s fetch and continue with others or return existing DB data.
- **Effect:** Long-running requests stop after ~10s instead of 60s, so **T** drops and the same pool serves more req/s.

**2. Live list: don’t block on external API when cache exists**

The live list page always calls `getLiveScoresForToday()`, which does one external call (`fetchAllLiveFixtures`) then DB upserts. If that call is slow, the page holds a connection for 10–30s.

- **Where:** `src/lib/liveScoresService.ts` and/or `src/app/fixtures/live/page.tsx`.
- **Change (option A – simple):** In `getLiveScoresForToday()`, if you already have recent cache rows for today’s in-window fixtures (e.g. `cachedAt` within last 90s), skip the external call and build `scores` from cache only. Optionally trigger a fire-and-forget refresh (e.g. don’t await it) so the next request gets fresh data.
- **Change (option B – cron):** Add a Vercel cron (e.g. every 60s) that calls `getLiveScoresForToday()` or a small route that does the same. Then on the live **page**, only read from DB (e.g. a new `getLiveScoresFromDbOnly(todayKey)`) and never call the external API in the request path. Scores are at most 60s stale.
- **Effect:** Live list request duration drops to ~1–2s (DB only) most of the time, so **T** for that page drops a lot.

**3. Today fixture refresh: cap wait time or return stale**

When `getOrRefreshTodayFixturesUncached` runs a full refresh, it does many leagues × 1.2s delay + DB. One request can hold a connection for 30–60s.

- **Where:** `src/lib/fixturesService.ts` – `getOrRefreshTodayFixturesUncached`, inside the `refreshPromise` path.
- **Change:** Wrap the “fetch leagues” loop (or the whole refresh) in a timeout (e.g. 15–20s). On timeout, abort in-flight fetches, write whatever fixtures you have so far, and return. Or: if `existingFixtures.length > 0`, return those immediately and run the refresh in the background (e.g. `void refreshPromise` so the next request gets fresh data).
- **Effect:** Home and date pages either return in a few seconds with stale data or a partial refresh, instead of holding the connection for a full minute.

### Medium impact, medium effort

**4. Timeout around lineup fetch in stats path**

`ensureLineupIfWithinWindow` → `fetchFixtureLineups` can be slow. The stats route (and `getFixtureStats`) hold a connection until that returns.

- **Where:** `src/lib/footballApi.ts` – `fetchFixtureLineups` or the shared `request()`; and/or `src/lib/lineupService.ts` – `ensureLineupIfWithinWindow`.
- **Change:** Use a 10–15s timeout for the lineups request. If it times out, leave lineup empty and return stats without lineup; next request can retry.
- **Effect:** Stats/live match requests don’t sit for 30s on a slow lineup API; **T** for those routes drops.

**5. Crawler throttling / rate limit**

Crawlers can open many concurrent connections and starve real users.

- **Where:** Proxy (e.g. `src/proxy.ts`) or a small wrapper in front of heavy routes.
- **Change:** Detect known crawler user-agents (e.g. Googlebot, Bingbot). For those, either: (a) return 429 or 503 after N requests per IP per minute, or (b) serve a lightweight version of the page (e.g. no live scores, or cached-only). Alternatively use Vercel’s bot protection / rate limits if available on your plan.
- **Effect:** Fewer connections used by bots, so more headroom for real users and fewer P2024s.

### Lower effort / config-only

**6. Increase pool size (if your plan allows)**

- **Where:** Your database/pooler plan (Supabase, Neon, etc.) and optionally `DATABASE_URL`.
- **Change:** Upgrade or tune so the pooler allows more concurrent connections (e.g. 50 instead of 20). Do **not** increase `connection_limit` per instance in the app; that would use more connections per request. You want more **total** connections in the pool.
- **Effect:** Higher **C** → more concurrent requests before queueing and P2024.

**7. Set `maxDuration` on the live list page**

So the platform doesn’t kill the request at 10s (Hobby default) while the live list is waiting on the external API.

- **Where:** `src/app/fixtures/live/page.tsx` (and any API route used only by that page, if applicable).
- **Change:** `export const maxDuration = 25` (or 30). That gives the live list a bit more time without going to 60s. Combine with (1) and (2) so the page usually finishes in a few seconds.
- **Effect:** Fewer “function timeout” errors on that page when the API is slow; real fix is still (1) and (2).

### Summary

| Priority | Change | Main effect |
|----------|--------|-------------|
| 1 | Timeout on all external API calls (~10–15s) | Stops long-held connections; big **T** reduction. |
| 2 | Live list: serve from DB when cache exists, or refresh via cron | Live list **T** drops to 1–2s. |
| 3 | Today fixture refresh: timeout or return stale + background refresh | Home/date **T** capped or fast. |
| 4 | Timeout on lineup API in stats path | Stats/live match **T** reduced. |
| 5 | Throttle or limit crawlers | Frees connections for real users. |
| 6 | Increase pool size (plan/config) | Higher **C**. |
| 7 | `maxDuration` on live page | Fewer function timeouts there. |

Implementing **1** and **2** gives the largest reduction in timeouts for the effort; then **3** and **4**; **5** and **6** help under crawler or high-traffic load.
