# Prisma connection pool timeout when busy – investigation

**Error seen:**  
`Invalid prisma.team.findMany() invocation: Timed out fetching a new connection from the connection pool. (Current connection pool timeout: 10, connection limit: 5)`

**No code changes in this doc – investigation only.**

---

## 1. What the error means

- **Connection limit: 5** – The Prisma client is using a pool with at most **5** connections to the database.
- **Pool timeout: 10** – If a request needs a connection and all 5 are in use, it waits up to **10 seconds** for one to be freed. If none is freed in time, Prisma throws this error (typically **P2024**).

So under load, more than 5 concurrent “users” of the pool (requests or parallel queries) are competing for 5 connections, and some wait longer than 10s.

---

## 2. Where the limit comes from

- **Prisma** does not set a default of 5 in code; the pool size is controlled by the **connection string**.
- **`connection_limit`** in `DATABASE_URL` (e.g. `?connection_limit=5`) sets the pool size. If unset, Prisma’s default can be a small number (e.g. 5 or similar in serverless-oriented setups).
- **Vercel Postgres / Supabase pooler** may also impose a small per-client or per-instance limit (e.g. 5–10 connections per connection string). So even without `connection_limit` in the URL, the **effective** limit can be 5.

So “connection limit: 5” is coming from either:

- An explicit `connection_limit=5` (or similar) in `DATABASE_URL`, or  
- The database/pooler provider’s default or plan limit for that URL.

---

## 3. Why it shows up when it’s busy

### 3.1 Serverless concurrency

- On Vercel, each **serverless invocation** that uses Prisma gets (or shares) a Prisma client that uses **the same pool** (same `DATABASE_URL`).
- In practice, **each active invocation** often holds at least one connection for the duration of its request.
- So with **6+ concurrent requests** that touch the DB, you can already exceed 5 connections: 5 are in use, the 6th waits and can hit the 10s timeout.

So “busy” = many concurrent requests = more logical “users” of the pool than connections available.

### 3.2 Multiple connections per request (parallel Prisma calls)

- A **single** request can use **several** connections at once if it runs multiple Prisma calls in **parallel** (e.g. `Promise.all([prisma.a(), prisma.b(), prisma.c()])`).
- Then a small number of concurrent requests can exhaust the pool even if “traffic” doesn’t look huge.

Examples in this codebase:

| Path | What runs | Concurrency |
|------|-----------|-------------|
| **GET /api/fixtures/live** → `getLiveScoresForToday()` | `Promise.all(toUpsert.map(upsert))` | **N** concurrent `liveScoreCache.upsert` (N = number of live fixtures with scores, e.g. 10–50) |
| **getFixtureStats** (when `sequential: false`) | `Promise.all([groupByQuery, findFirst, findFirst, count, getLineupForFixture])` | **5** concurrent Prisma operations |
| **getFixturesForDateFromDbOnly** (cache miss) | Single `prisma.fixture.findMany` | 1 |
| **Stats route** | `getFixtureStatsCached` → under the hood `getFixtureStats(..., { sequential: true })` | 1 at a time (by design) |
| **Matchday insights** | Sequential loop over fixtures | 1 at a time (by design) |
| **fixturesService** (e.g. warm, refresh) | Various `Promise.all([...])` with 2–5+ Prisma calls | 2–5+ per request |
| **Home / date page** | `Promise.all([...])` of data loaders | Multiple Prisma calls in parallel |

So:

- **Live page** and **getLiveScoresForToday**: when there are many live fixtures, one request can fire **tens of concurrent upserts**. That single request can try to use many connections (up to N), which quickly exceeds 5.
- Other pages that use `Promise.all` over several Prisma calls can use 2–5 connections per request. A few such requests at once are enough to hit the limit.

### 3.3 Cold starts and slow queries

- After a cold start, the first request often does **more** work (cache misses, more queries). That request can hold connections longer and use several at once.
- If some queries are slow (e.g. heavy `findMany`/`groupBy`), connections are held longer, so the same 5 connections are “busy” for more time and more incoming requests queue and hit the 10s timeout.

---

## 4. Why you see “prisma.team.findMany()” in the error

- The **failing** call is `prisma.team.findMany()` (or similar) in some request.
- That request didn’t necessarily do anything wrong; it’s just the one that was **waiting for a connection** when the 10s timeout was reached.
- So the error can appear on a “random” query (team, fixture, etc.) even when the **real** pressure comes from other requests (e.g. live scores bulk upserts, or many concurrent stats requests).

---

## 5. What the app already does to reduce pool pressure

- **Stats API** uses `getFixtureStatsCached` → `getFixtureStats(..., { sequential: true })` so each stats request uses at most one connection at a time.
- **Matchday insights** loads fixture stats **sequentially** in a loop to avoid pool exhaustion (see comment: “connection_limit=1”).
- **withPoolRetry** (stats route, some pages) retries on **P2024** (connection timeout) and **P2028** (transaction timeout) to smooth over transient exhaustion.
- **DEPLOYMENT.md** warns not to use `connection_limit=1` and to use a pooler (e.g. Supabase port 6543, `?pgbouncer=true`).

So some hot paths are already “pool-friendly”; others (notably the live scores bulk upsert and any path that does large `Promise.all` of Prisma calls) are not.

---

## 6. Summary: why it happens when busy

1. **Pool size is small** – Effective limit of **5** connections (URL or provider).
2. **Many concurrent requests** – Serverless concurrency means many invocations at once, each needing DB access.
3. **High connection use per request in some paths** – Especially:
   - **getLiveScoresForToday**: `Promise.all` of many `liveScoreCache.upsert` (e.g. 20–50) in one request.
   - Other routes that run several Prisma calls in parallel.
4. **Timeout 10s** – Once the pool is full, new work waits; after 10s Prisma throws the timeout error.

So under load you get: several requests in flight, some of them using many connections at once (e.g. live scores), pool of 5 exhausted, and the next request (e.g. a `team.findMany`) is the one that waits 10s and surfaces the error.

---

## 7. Directions for a fix (when you implement)

1. **Increase pool size** (if the provider allows)  
   - For example set `?connection_limit=10` (or higher) in `DATABASE_URL` if your Postgres/pooler plan allows it.  
   - Check Vercel Postgres / Supabase docs for per-project or per-connection-string limits.

2. **Use a proper connection pooler**  
   - Already recommended: Supabase “Transaction” pooler (port 6543), `?pgbouncer=true`.  
   - Ensures many client connections are multiplexed onto fewer DB connections, reducing “connection limit” pressure on the real Postgres server.

3. **Reduce concurrent Prisma usage in hot paths**  
   - **getLiveScoresForToday**: Instead of `Promise.all(toUpsert.map(upsert))`, run upserts in **batches** (e.g. 5 at a time with `Promise.all` per batch) or **sequentially**. That caps how many connections one request can use.  
   - Optionally apply the same idea elsewhere (e.g. other bulk writes or heavy `Promise.all` of Prisma calls).

4. **Use withPoolRetry where it’s missing**  
   - Wrap other DB-heavy API routes or server flows in `withPoolRetry` so transient P2024/P2028 get a retry instead of failing immediately.

5. **Consider Prisma Accelerate (or similar)**  
   - Offloads connection handling and can reduce pool exhaustion in serverless; requires a separate decision and possibly plan change.

6. **Observe which routes trigger the error**  
   - Add short logging (e.g. route name + “pool retry” or “pool error”) to see which paths hit P2024 most. That will confirm whether it’s the live endpoint, stats, or something else, and prioritize batching/sequential work there.

Implementing (2) and (3) – pooler + batching/sequential in `getLiveScoresForToday` (and any other bulk parallel Prisma usage) – will address the main drivers of the error when busy.
