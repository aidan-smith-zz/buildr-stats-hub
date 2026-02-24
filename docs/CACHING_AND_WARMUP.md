# Caching and warm-up logic

This doc confirms how the app caches data in the DB and how the warm-up script fits in, so that after you run `npm run warm-today` at 12am (or once per day), normal usage uses the cache and does not hit the API limit again.

---

## What we cache (and never clear by date)

These are stored in the DB and **not** deleted when the day changes or when you prune “older than today”:

| Data | Table | Purpose |
|------|--------|---------|
| Team season stats | `TeamSeasonStats` | Goals, corners, cards, xG per team/season/league. Used for “Season” team stats and form. |
| Per-fixture cache | `TeamFixtureCache` | One row per team per fixture (goals, corners, cards, xG). Used for “Last 5” and to build season stats. |
| Player season stats | `PlayerSeasonStats` | Player stats per team/season/league. Used for the player table on the match page. |
| Lineups | `FixtureLineup` | Once stored, we never refetch. |
| Matchday insights | `MatchdayInsightsCache` | One blob per date. Built from DB-only fixture stats; no API when serving. |

So once warmed, this data stays and is reused.

---

## What we cache per “today”

| Data | Table / log | When we use cache |
|------|-------------|--------------------|
| Today’s fixtures | `Fixture` (today’s date) | If we have fixtures for today **and** a successful `ApiFetchLog` for `fixtures:YYYY-MM-DD` with `fetchedAt >= dayStart`, we return from DB and **do not** call the API. |
| Upcoming (next 14 days) | `UpcomingFixture` | Filled by warm-today’s refresh; used for preview/sitemap. |

---

## Prune behaviour (what gets deleted)

`pruneDataOlderThanToday(now)` only:

- Deletes **Fixture** rows whose date is **not** today (before today or after today’s spillover).
- Deletes **ApiFetchLog** rows whose resource is **not** `fixtures:{todayDateKey}`.

It does **not** delete:

- `TeamSeasonStats`
- `TeamFixtureCache`
- `PlayerSeasonStats`
- `FixtureLineup`
- `MatchdayInsightsCache`

So all “stats” caches persist across days.

---

## Warm-today flow (e.g. at 12am)

1. **GET /api/warm-today** (no `skipRefresh=1`):
   - Calls `refreshUpcomingFixturesTable(now)` (upcoming fixtures for next 14 days; uses API).
   - Calls `getOrRefreshTodayFixtures(now)`:
     - If there are **no** fixtures for today in DB **or** no successful fetch log for today → fetches today’s fixtures from the API and writes to `Fixture` + `ApiFetchLog`.
     - If there **are** fixtures for today and a successful fetch for today → returns from DB, **no API**.
   - Builds list of fixtures that “need warming”:
     - **Needs player stats**: either team has &lt; 11 `PlayerSeasonStats` for (teamId, season, league).
     - **Needs team stats**: either team has no `TeamSeasonStats` for (teamId, season, league).
   - Returns only fixture IDs that need warming.

2. **Script** then for each of those IDs:
   - League 41/42 (team-stats only): calls `GET /api/fixtures/:id/warm?part=teamstats` (and then stats).
   - Other leagues: calls `warm?part=home`, `part=away`, `teamstats-home`, `teamstats-away`, `lineup`, then stats.

3. **Warm endpoints** (e.g. `warm?part=teamstats` or `teamstats-home`):
   - Call `ensureTeamSeasonStatsCornersAndCards` only when there is **no** existing `TeamSeasonStats` row for that (teamId, season, league). So we only call the **fixtures** and **fixtures/statistics** APIs when we don’t already have a row.
   - Inside that function we only fetch **fixture statistics** for fixtures **not** already in `TeamFixtureCache`; existing cache is reused.

4. **Player stats** (`fetchAndStorePlayerStats`):
   - Skips the API if we already have `PlayerSeasonStats` for that (teamId, season, league) updated within the last **24 hours** (cooldown). So we don’t refetch every time.

So after a full warm, every fixture that needed warming has:

- `TeamSeasonStats` (and optionally `TeamFixtureCache`) for both teams.
- For non–team-stats-only leagues: `PlayerSeasonStats` and optionally lineup.

---

## When a user visits during the day (after warm)

- **Homepage / today’s list**: `getOrRefreshTodayFixtures(now)` sees fixtures for today + success log → returns from DB, **no API**.
- **Match page (fixture stats)**: `getFixtureStats(fixtureId)`:
  - Loads fixture, then checks DB for:
    - `TeamSeasonStats` for home and away.
    - `PlayerSeasonStats` count per team.
    - Lineup presence.
  - Only calls:
    - `ensureTeamSeasonStatsCornersAndCards` if **no** `TeamSeasonStats` row for that team/season/league.
    - `fetchAndStorePlayerStats` for teams with &lt; 11 players and only if not within 24h cooldown.
    - `ensureLineupIfWithinWindow` only if no lineup and within 30 min of kickoff.
  So if the fixture was warmed, we **do not** call the API for team or player stats.
- **Matchday insights**: Uses `getFixtureStats(id, { dbOnly: true })` and `MatchdayInsightsCache`; **no API** when serving cached insights.

So once warmed, normal traffic is served from the DB and does not consume your daily request limit.

---

## Summary

- **Caching**: We cache team stats, team fixture cache, player stats, lineups, and matchday insights in the DB. We do **not** clear these when the day changes.
- **Today’s fixtures**: Cached per day; after a successful fetch we serve from DB until the next day.
- **Warm script**: Run once per day (e.g. 12am). It refreshes today’s fixtures (one batch of API calls), then only warms fixtures that are missing player or team stats. Each warm only calls the API when the corresponding cache row is missing.
- **After warm**: Homepage, match stats, and insights use the DB; no extra API calls for already-warmed data, so the daily limit is not hit again from normal use.

Running `npm run warm-today` at 12am will refill today’s fixtures and warm any new fixtures; the rest of the day will be served from cache so this situation should not repeat as long as the warm completes within your daily limit.
