# Live score page – timeout and scalability analysis

**Status:** Investigation only (no code changes).  
**Problem:** The live score page times out under load; will get worse as fixture count grows.

---

## 1. Current flow

1. **Page load (server component)**  
   - `getFixturesForDateFromDbOnly(todayKey)` → one DB query (cached 60s), returns today’s fixtures **with** `liveScoreCache` (for `statusShort` only; full score not on `FixtureSummary`).

2. **Filter**  
   - Keep fixtures in required leagues and in “live window” (kickoff ≤ now < kickoff + 2h), exclude finished (FT, AET, etc.).

3. **Fetch live scores**  
   - For each live fixture, the page does **one HTTP request** to its own API:
     - `fetch(\`${BASE_URL}/api/fixtures/${fixture.id}/live\`)`
   - Batches of **50** (`LIVE_FETCH_BATCH_SIZE`): batches run **one after another**; within a batch all 50 run **in parallel**.
   - So: 80 live fixtures ⇒ 2 batches ⇒ 50 parallel, then 30 parallel.

4. **Per `/api/fixtures/[id]/live`**  
   - DB: load fixture (id, apiId, date) + optional `LiveScoreCache`.
   - If cache is fresh (≤90s) or match ended → return from cache (no external API).
   - Otherwise → **one external API call**: `fetchLiveFixture(fixture.apiId)` (API-Football `GET /fixtures?id={apiId}`).
   - External call is rate-limited in `footballApi`: **1 request per second** per process (`MIN_INTERVAL_MS = 1000`), via a **in-memory** `rateLimitState`.

5. **Result**  
   - Page waits for **all** batch requests to complete, then renders. No timeout on the page’s `fetch()` to the API.

---

## 2. Why timeouts happen

### 2.1 Request multiplication

- **N** live fixtures ⇒ **N** internal API calls from the page.
- Each of those can trigger **one** external API call when cache is cold or expired.
- So in the worst case: **N external API calls** for one page load.

### 2.2 Rate limit is not shared across API routes

- `rateLimitState` in `footballApi.ts` is a **single in-memory object**.
- Each `/api/fixtures/[id]/live` runs in its **own** serverless invocation (or worker).
- So **50 parallel** route handlers ⇒ **50 separate processes** ⇒ **50 concurrent** calls to API-Football, with **no** global 1‑req/s limit.
- Result: 429s, throttling, or slow responses from the provider, and our routes wait on them.

### 2.3 No timeout on page → API fetch

- The page does `fetch(BASE_URL/.../live)` with no `AbortSignal` / timeout.
- If a route hangs (e.g. waiting on external API or DB), the page waits until the **platform** kills the request (e.g. Vercel function `maxDuration` or gateway timeout).

### 2.4 Total time grows with N

- **Batch 1:** 50 parallel calls. Slowest one wins (e.g. 10–60s if external API is slow or rate-limited).
- **Batch 2:** same again.
- So 80 fixtures ⇒ 2 × “slowest response” ⇒ easily **20–120s** total.
- The **live page does not set `maxDuration`**, so it uses the platform default (e.g. 10s Hobby, 60s Pro). So the page request often times out before all batches finish.

### 2.5 DB already has scores, but we don’t use them for the list

- `getFixturesForDateFromDbOnly` already includes `liveScoreCache` (and could expose full score).
- The list **ignores** that and re-fetches every fixture via `/api/.../live` to get scores.
- So we do N extra API calls even when the DB has usable (possibly slightly stale) data.

---

## 3. What gets worse with more fixtures

| Live fixtures | Batches (50 per batch) | Parallel internal calls | Worst-case external calls | Comment |
|---------------|------------------------|--------------------------|----------------------------|---------|
| 20            | 1                      | 20                       | 20                         | Often OK if cache warm. |
| 50            | 1                      | 50                       | 50                         | Risk of timeout if cache cold. |
| 80            | 2                      | 50 + 30                  | 80                         | Very likely to timeout. |
| 150           | 3                      | 50 + 50 + 50             | 150                        | Page will almost always timeout. |

So yes: more fixtures ⇒ more internal and external calls ⇒ more timeouts.

---

## 4. Options to fix / improve

### 4.1 Use DB cache for the list (quick win)

- **Idea:** For the **list** page, don’t call `/api/fixtures/[id]/live` at all.
- **Implementation:**  
  - Extend the “today” query (or a dedicated live-list query) to include full `liveScoreCache` (homeGoals, awayGoals, elapsedMinutes, statusShort, cachedAt).  
  - Define a list-specific type that includes optional live score from cache.  
  - Render the list using cached scores only; show “Started 12:30 · –” when cache is missing or too old.
- **Pros:** One DB query, no N internal API calls, no external calls on list load. Page responds in &lt;1s.  
- **Cons:** Scores can be up to ~90s stale unless something else refreshes the cache.

**Cache refresh:**  
- Keep current behaviour: individual **match live page** (`/fixtures/.../live`) still calls `/api/fixtures/[id]/live` and updates `LiveScoreCache`.  
- Optionally add a **background job** (cron) that, every 60–90s, fetches live scores for today’s in-play fixture IDs in **one process** with strict rate limiting (e.g. 1 req/s), and writes to `LiveScoreCache`. Then the list stays warm without the page doing N requests.

---

### 4.2 Single bulk “live scores” API route

- **Idea:** One route, e.g. `GET /api/fixtures/live?date=YYYY-MM-DD`, that returns scores for **all** live fixtures for that day.
- **Implementation:**  
  - Load live fixture IDs from DB (same “live window” logic).  
  - Load all relevant `LiveScoreCache` rows in one query.  
  - For cache-miss or stale entries, call API-Football **from this single process** with rate limiting (e.g. 1 req/s), update cache, then return.  
  - Page calls this route **once** and gets all scores.
- **Pros:** One HTTP request from page; external rate limit respected (one process, serialized or small concurrency).  
- **Cons:** If 50 fixtures need refresh, 50 × 1s = 50s in one function → needs high `maxDuration` (e.g. 60s) and may still hit platform limits; no streaming so TTFB is late.

---

### 4.3 Use API-Football “all live” endpoint

- **Idea:** API-Football has a **fixtures/live** (or equivalent) endpoint that returns **all** current live fixtures in **one** call. Use that instead of N × `GET /fixtures?id=`.
- **Implementation:**  
  - One `GET /fixtures/live` (or whatever the exact path is in their docs).  
  - Map response by `apiId` to our fixture IDs, merge with our list, upsert `LiveScoreCache`, return to page.  
  - Page calls a **single** internal route that calls this once and returns all scores.
- **Pros:** One external request per page load; no N-fold multiplication; fast and within rate limits.  
- **Cons:** Depends on provider offering and documenting this; response shape may need mapping/validation.

---

### 4.4 Client-side score loading (streaming / progressive)

- **Idea:** Server renders the list **immediately** with “Started 12:30 · –” (or cached scores if available). Client then fetches scores in the background (one bulk endpoint or many small ones) and updates the UI.
- **Implementation:**  
  - List page: no per-fixture live API calls; optionally use DB cache (4.1).  
  - Client: `useEffect` → fetch `/api/fixtures/live` (or similar) and update state, or use polling.  
  - Optionally use a bulk endpoint that streams (e.g. NDJSON) so scores appear as they’re ready.
- **Pros:** First paint is fast; timeouts on the server are less critical.  
- **Cons:** More client logic; possible layout shift; need a robust bulk or streaming API (e.g. 4.2 or 4.3).

---

### 4.5 Timeouts and limits

- **Page request:** Add an explicit timeout (e.g. `AbortSignal` + 25s) when the page calls its own API, and fall back to “Started · –” (or DB cache) on timeout so the page still renders.  
- **API route:** Ensure `/api/fixtures/[id]/live` has a reasonable `maxDuration` (e.g. 15–30s) and, if you keep N routes, consider a short timeout around the external `fetchLiveFixture` so one slow fixture doesn’t block the whole batch.  
- **Rate limiting:** Any design that concentrates external calls in **one** process (e.g. 4.2 or 4.3) automatically respects the 1‑req/s (or similar) limit and avoids 50 concurrent external calls.

---

## 5. Recommended direction

1. **Short term (minimal change):**  
   - **4.1** – Use DB cache for the list. Expose full `liveScoreCache` from the existing “today” (or live) query and render from it. No per-fixture API calls from the list.  
   - Optionally add a **cron** that refreshes `LiveScoreCache` for in-play fixtures every 60–90s with rate-limited external calls so the list stays reasonably fresh.

2. **Next step (fewer requests, scalable):**  
   - **4.3** – If API-Football’s “all live” endpoint is available and stable, add one internal route that calls it once, maps to our fixture IDs, updates `LiveScoreCache`, and returns. The list page calls this single route (or uses 4.1 and lets cron/background use 4.3 to fill cache).

3. **Resilience:**  
   - **4.5** – Add timeouts on the page’s fetch to its own API and on external fetch in the route; set `maxDuration` where needed so timeouts are predictable and the list can still render with stale or placeholder data.

This keeps the list fast, avoids N internal + N external calls per load, and scales to many fixtures without timeouts.
