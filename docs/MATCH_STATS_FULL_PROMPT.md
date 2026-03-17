# Full prompt: Implement individual match stats (save and use in a new chat)

Copy everything below the line into the chat when you want to implement this feature.

---

Implement the **individual match stats** feature according to `docs/MATCH_STATS_IMPLEMENTATION_PLAN.md`. No backfill; only matches going forward get stats. When fixtures leave the past 14-day view, prune their per-fixture stats.

Do the following in order.

---

## Phase 1 – Post-match match stats (existing data)

### 1.1 Prune TeamFixtureCache when fixtures leave the past view

- **File:** `src/lib/fixturesService.ts`
- In **`pruneDataOlderThanToday`**: after the existing `prisma.fixture.deleteMany` and `prisma.apiFetchLog.deleteMany`, add:
  - **`prisma.teamFixtureCache.deleteMany`** where **`fixtureDate < cutoffDayStart`** (use the same `cutoffDayStart` already computed for the fixture prune).
- This keeps per-fixture stats only for the last 14 days; when a match drops out of the past view we remove its stats.

### 1.2 Expose matchStats in getFixtureStats

- **File:** `src/lib/statsService.ts`
  - **Type:** Define and export **`MatchStatsOneSide`** with: `corners: number`, `yellowCards: number`, `redCards: number`, `xg: number | null`.
  - **Response:** Add optional **`matchStats?: { home: MatchStatsOneSide; away: MatchStatsOneSide }`** to **`FixtureStatsResponse`**.
  - **In `getFixtureStats`:** After you have the fixture and `canonicalLeagueKey`:
    - If `fixture.apiId` is null/empty, skip match stats.
    - Query **TeamFixtureCache** once: `where`: `apiFixtureId = String(fixture.apiId)`, `season = API_SEASON`, `league = canonicalLeagueKey`, `teamId in [fixture.homeTeamId, fixture.awayTeamId]`. `select`: `teamId`, `corners`, `yellowCards`, `redCards`, `xg`.
    - Split the two rows into home/away by `teamId` (using `fixture.homeTeamId` / `fixture.awayTeamId`).
    - Set **`matchStats`** only when **both** rows exist. Add it to the returned object.

### 1.3 Show "Match statistics" on the past fixture view

- **File:** `src/app/fixtures/[date]/[league]/[match]/past-fixture-view.tsx`
- Add a **"Match statistics"** section between **"Final score"** and **"Team lineups"**.
- Render it **only when `stats?.matchStats`** is defined.
- Display: **Corners** (home – away), **Yellow cards** (home – away), **Red cards** (home – away), **xG** (home – away, one decimal; show "–" when null).
- Use a simple table or definition list; match the styling of the existing Final score and Lineups sections.

---

## Phase 2 – Shots and possession (no backfill)

### 2.1 Extend fixture statistics API parser

- **File:** `src/lib/footballApi.ts`
- Add to **`RawFixtureTeamStats`** (or the type returned by `fetchFixtureStatistics`): **`shots?: number`**, **`shotsOnGoal?: number`**, **`possessionPct?: number`** (0–100).
- In **`fetchFixtureStatistics`**, in the same loop where we parse Goals, Corner Kicks, Yellow/Red Cards, etc., also parse:
  - **Shots:** e.g. `get("Shots")` or `get("Total Shots")`.
  - **Shots on goal:** e.g. `get("Shots on Goal")` or `get("Shots on Target")`.
  - **Possession:** e.g. `get("Ball Possession")`; if the API returns a string like `"62%"`, parse the number and store 0–100.
- Return these in the result object.

### 2.2 Schema migration

- **File:** `prisma/schema.prisma`
- Add to **`TeamFixtureCache`**: **`shots Int?`**, **`shotsOnGoal Int?`**, **`possessionPct Int?`** (all nullable).
- Run **`npx prisma migrate dev --name add_match_stats_shots_possession`**.

### 2.3 Warm path: store shots/possession in TeamFixtureCache

- In the **statsService** code that calls **`fetchFixtureStatistics`** and upserts **TeamFixtureCache** (e.g. inside `ensureTeamSeasonStatsCornersAndCards` or the chunked fixture-processing path), add to the **create** and **update** payloads: **`shots`**, **`shotsOnGoal`**, **`possessionPct`** from the `fetchFixtureStatistics` result. Use **null** when missing.

### 2.4 Expose shots/possession in matchStats

- **File:** `src/lib/statsService.ts`
- Extend **`MatchStatsOneSide`** with: **`shots?: number`**, **`shotsOnGoal?: number`**, **`possessionPct?: number`**.
- In **`getFixtureStats`**, when building **`matchStats`** from TeamFixtureCache, include these fields from the cache rows (home/away).

### 2.5 Show shots and possession in the UI

- **File:** `src/app/fixtures/[date]/[league]/[match]/past-fixture-view.tsx`
- In the **"Match statistics"** section, add rows for **Shots** (home – away), **Shots on goal** (home – away), **Possession** (home% – away%). Only show each row when the data is present (e.g. not all null).

---

## Phase 3 – Live in-play match stats (optional)

### 3.1 Live endpoint: fetch and return liveStats when in-play

- **File:** `src/app/api/fixtures/[id]/live/route.ts`
- When the match is **in-play** (within the "during game" window) and you are about to or have just fetched the live score:
  - Load the fixture to get **homeTeam.apiId** and **awayTeam.apiId** (if not already available).
  - Call **`fetchFixtureStatistics(apiId, homeTeamApiId)`**, then after a short delay (e.g. reuse **FOOTBALL_API_MIN_INTERVAL_MS**), **`fetchFixtureStatistics(apiId, awayTeamApiId)`**.
  - Merge the two results into **`liveStats: { home: MatchStatsOneSide; away: MatchStatsOneSide }`** (same shape as `matchStats`; use the type from statsService if imported).
  - Include **`liveStats`** in the JSON response when both calls succeed.
- Optionally persist in **LiveScoreCache** (add nullable columns) or a separate cache table so the live list can show "Corners 5–3" without extra API calls; if so, use the same 90s TTL as the live score.

### 3.2 In-play client: show "Live match stats"

- **File:** `src/app/fixtures/[date]/[league]/[match]/live/in-play-fixture-client.tsx`
- In the effect that fetches **`/api/fixtures/${fixtureId}/live`**, read **`liveStats`** from the response.
- When **`liveStats`** is present and the match is **in-play** (not ended), render a **"Live match stats"** block (e.g. possession bar, corners, shots, yellow/red cards). Use the same labels as the post-match "Match statistics" section where possible.

### 3.3 Prune live-stats cache (if added)

- If you added a dedicated live-stats cache table or columns, prune them in **`pruneDataOlderThanToday`** (or the same prune flow) using the same 14-day cutoff (e.g. by fixture date or fixtureId).

---

## Summary

- **Phase 1:** Prune TeamFixtureCache by fixtureDate; add matchStats to getFixtureStats and "Match statistics" section to past fixture view (corners, cards, xG).
- **Phase 2:** Parser + schema + warm path for shots/possession; expose and display in matchStats and UI.
- **Phase 3 (optional):** Live endpoint returns liveStats when in-play; in-play client shows "Live match stats"; optionally cache and prune.

No backfill. Stats only for matches going forward. Stats removed when fixtures leave the past 14-day view.
