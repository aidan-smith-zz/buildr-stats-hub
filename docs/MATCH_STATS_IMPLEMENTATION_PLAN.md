# Implementation plan: individual match stats (revised)

## Scope

1. **Post-match**: Show actual match stats (corners, cards, xG; then shots/possession) on the match page next to lineups for finished fixtures (today or past), for **matches going forward only** (no backfill).
2. **Retention**: When fixtures are removed from the past fixtures view (older than 14 days), delete their per-fixture stats so we don’t hold data needlessly.
3. **Live (optional)**: Show live match stats while in-play (same metrics); can be added later.

---

## 1. No backfill – matches going forward only

- **Do not** add any one-off backfill script or job to populate match stats for past fixtures.
- Match stats will only be stored when the **existing warm path** runs for a fixture (e.g. warm-today, fixture stats backfill when someone opens a match). So:
  - Fixtures that are **already past** and never get warmed again will never get `matchStats` – that’s fine.
  - Fixtures that **finish from now on** and are warmed will get TeamFixtureCache rows and thus `matchStats` on the match page.
- Remove any “Phase 2 backfill” step from the plan; only the normal warm/ensureTeamSeasonStats flow fills data.

---

## 2. Prune per-fixture stats when fixtures leave the past view

- Past fixtures are shown for **14 days** (`PAST_FIXTURES_RETENTION_DAYS` in `fixturesService.ts`). The same window is used in `pruneDataOlderThanToday`, which deletes **Fixture** rows (and ApiFetchLog) older than that cutoff.
- **TeamFixtureCache** is keyed by `(teamId, season, league, apiFixtureId)` and has **fixtureDate**. It is **not** cascade-deleted when a Fixture is deleted (no FK from TeamFixtureCache to Fixture). So we must prune it explicitly.

**Change in `src/lib/fixturesService.ts` (or `src/lib/statsService.ts` if prune lives there):**

- In **`pruneDataOlderThanToday`** (or in the same prune flow that runs when cleaning old data):
  1. Keep the existing logic: compute `cutoffDayStart` from `pastDateKeys(PAST_FIXTURES_RETENTION_DAYS)` (14 days).
  2. **After** deleting old Fixture rows, add:
     - **Delete TeamFixtureCache** where `fixtureDate < cutoffDayStart`.
- This way, when a match is older than 14 days and removed from the past view (and its Fixture row is deleted), we also remove its per-fixture stats so we don’t keep that data indefinitely.

**Optional:** If you later add a separate “live match stats” cache (e.g. extra columns on LiveScoreCache or a LiveMatchStatsCache table), prune that by the same cutoff (e.g. by fixture date or by fixtureId if you store it) in the same prune run.

---

## 3. Full implementation checklist (revised)

### Phase 1 – Post-match match stats (existing data, no backfill)

| Step | What | Notes |
|------|------|------|
| 1.1 | **Prune:** In `pruneDataOlderThanToday`, add deletion of `TeamFixtureCache` where `fixtureDate < cutoffDayStart`. | So stats are removed when fixtures leave the past 14-day view. |
| 1.2 | **Back end:** In `statsService.ts`, add `MatchStatsOneSide` and `matchStats?: { home, away }` to `FixtureStatsResponse`. In `getFixtureStats`, query TeamFixtureCache for this fixture’s `apiFixtureId` + two teamIds; set `matchStats` only when both rows exist. | No backfill; only fixtures that already have cache rows will show stats. |
| 1.3 | **Front end:** In `past-fixture-view.tsx` (and full match page for finished fixtures), add “Match statistics” section when `stats?.matchStats` is present. Show corners, yellow cards, red cards, xG. | Only appears for matches going forward that have been warmed. |

### Phase 2 – Shots and possession (still no backfill)

| Step | What | Notes |
|------|------|------|
| 2.1 | **API:** In `footballApi.ts`, extend `fetchFixtureStatistics` and `RawFixtureTeamStats` to parse and return shots, shotsOnGoal, possessionPct. | |
| 2.2 | **Schema:** Add nullable `shots`, `shotsOnGoal`, `possessionPct` to `TeamFixtureCache`; run migration. | |
| 2.3 | **Warm path:** In the code that calls `fetchFixtureStatistics` and upserts TeamFixtureCache, include the new fields in create/update. | Only new/retouched fixtures get these; no backfill. |
| 2.4 | **Back end:** Extend `MatchStatsOneSide` and `getFixtureStats` to include shots, shotsOnGoal, possessionPct from cache. | |
| 2.5 | **Front end:** In “Match statistics” section, add rows for shots, shots on goal, possession. | |

### Phase 3 – Live in-play match stats (optional, later)

| Step | What | Notes |
|------|------|------|
| 3.1 | In `GET /api/fixtures/[id]/live`, when in-play, call `fetchFixtureStatistics` for home and away; return `liveStats` in response. Optionally persist in LiveScoreCache or a small cache table. | |
| 3.2 | In-play client: show “Live match stats” block when `liveStats` present. | |
| 3.3 | If a dedicated live-stats cache table exists, prune it in the same prune run (e.g. by fixture date or linked fixtureId). | Same 14-day retention idea. |

---

## 4. Retention summary

| Data | When it’s removed |
|------|-------------------|
| **Fixture** | Already pruned in `pruneDataOlderThanToday` when older than 14 days. |
| **TeamFixtureCache** (per-fixture stats) | **New:** Prune in same function where `fixtureDate < cutoffDayStart` (14 days). |
| **LiveScoreCache** | Has FK to Fixture with onDelete Cascade; removed when Fixture is deleted. |
| **ApiFetchLog** | Already pruned (only today’s kept). |

No backfill; stats only for matches going forward; stats deleted when fixtures leave the past 14-day view.
