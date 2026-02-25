# Step-by-step: what happens when `/api/fixtures/<fixtureId>/stats` is called

## 1. Route handler

- **File:** `src/app/api/fixtures/[id]/stats/route.ts`
- Parse `fixtureId` from the URL; if invalid, return 400.
- Call `getFixtureStats(fixtureId)` from `statsService`.
- If `getFixtureStats` returns `null`, return 404 (fixture not in DB).
- Otherwise return the stats JSON with cache headers.

---

## 2. Load the fixture from the DB

- **In:** `getFixtureStats()` in `src/lib/statsService.ts`
- Load the **Fixture** row by `id`, including `homeTeam` and `awayTeam`.
- If no row, return `null` (route then returns 404).
- From this row we use: `fixture.league`, `fixture.leagueId` (if present), `fixture.homeTeamId`, `fixture.awayTeamId`, and the two team records.

**Important:** `league` and `leagueId` come from whatever was stored when the fixture was created/updated (e.g. by warm-today or fixtures refresh). If the API didn’t send `leagueId`, it will be `null` in the DB.

---

## 3. Decide the “league key” for this fixture

- **leagueKeyForTeamStats**  
  Used for **TeamSeasonStats** and **PlayerSeasonStats** (they store a league *name*).  
  Set to: `fixture.league ?? "Unknown"`.

- **leagueIdForTeamStats**  
  Numeric league id (e.g. 40 for Championship, 2 for UCL).  
  Set to: `fixture.leagueId ?? LEAGUE_ID_MAP[fixture.league]`.  
  So if the Fixture row has no `leagueId`, we only get a number when `fixture.league` is in `LEAGUE_ID_MAP`.

- **canonicalLeagueKey**  
  String used for **TeamFixtureCache** (after migration we store by id, e.g. `"40"`).  
  Set to: `leagueIdForTeamStats != null ? String(leagueIdForTeamStats) : (fixture.league ?? "Unknown")`.

- **last5LeagueKeys**  
  List of keys we try when reading **last-5** from TeamFixtureCache:  
  `[canonicalLeagueKey, fixture.league, String(leagueIdForTeamStats) if set, and "40" if the league name looks like English Championship]`, deduped.

---

## 4. Run a first batch of DB checks (in parallel)

We do one `Promise.all` that:

1. **Player counts**  
   Count how many **PlayerSeasonStats** rows exist per team for this fixture’s `(teamId, season, league)`.

2. **TeamSeasonStats for home and away**  
   For each team, find a **TeamSeasonStats** row for this season, matching by:
   - if we have `leagueIdForTeamStats`: `league = leagueKeyForTeamStats` **OR** `leagueId = leagueIdForTeamStats`
   - else: `league = leagueKeyForTeamStats`

3. **Lineup count**  
   Count **FixtureLineup** rows for this fixture.

4. **Lineup data**  
   Load lineup for this fixture (for player “starting” / “substitute” status).

From this we know: do we have team season stats for home/away, do we have enough player stats per team, and do we have a lineup.

---

## 5. Fill gaps (only if not `dbOnly`)

- **Player stats**  
  If a team has fewer than 11 **PlayerSeasonStats** for this league/season, we call the API to fetch and store player stats for that team (with a short delay between teams).

- **Team season stats (and cache)**  
  If we have `leagueIdForTeamStats` and the API team id:
  - For **home**: if there is no **TeamSeasonStats** for home, call `ensureTeamSeasonStatsCornersAndCards(...)` with `cacheLeagueKey: canonicalLeagueKey`. That fetches the team’s fixtures from the API, fetches fixture statistics for fixtures not yet in **TeamFixtureCache**, and writes both **TeamSeasonStats** and **TeamFixtureCache** using the same `cacheLeagueKey` (e.g. `"40"`).
  - Same for **away** if it has no **TeamSeasonStats**.

- **Lineup**  
  If we don’t have a lineup and this isn’t a “team-stats-only” league, we try to ensure lineup (e.g. from API) if the fixture is within the allowed time window.

---

## 6. Run a second batch of DB reads (in parallel)

We do another `Promise.all` that loads:

1. **PlayerSeasonStats**  
   All player season stats for both teams for this `(season, league)` (using `fixture.league` for the filter).

2. **TeamSeasonStats**  
   All **TeamSeasonStats** rows for both teams for this season (no league filter).

3. **Last-5 home**  
   **TeamFixtureCache**: `teamId = home`, `season = API_SEASON`, `league` in **last5LeagueKeys**, ordered by `fixtureDate` desc, take 5.

4. **Last-5 away**  
   Same for away team.

5. **Lineup**  
   Either the one we already had, or load it again.

---

## 7. Pick the right TeamSeasonStats row per team

- **TeamSeasonStats** can have multiple rows per team/season (one per league).
- We pick the row that best matches this fixture’s league:
  - Prefer row where `leagueId === fixtureLeagueId` or `league === fixture.league`.
  - Otherwise use the first row.
- These become **homeRow** and **awayRow** (used for season “per match” stats).

---

## 8. Build the response

- **Fixture summary**  
  From the Fixture row and the two team records.

- **Teams and players**  
  From **PlayerSeasonStats** (and lineup for “starting”/“substitute”). If we’re in mock fallback mode and a team has no players, we fill with mock players.

- **teamStats**  
  From **homeRow** and **awayRow**: convert season totals to “per match” (goals, conceded, corners, cards, xG). Only included if at least one side has non-zero stats.

- **teamStatsLast5**  
  From **last5Home** and **last5Away**: average goals, conceded, corners, cards, xG over those cache rows. Only included if at least one of last5Home/last5Away has length > 0.

- **hasLineup**  
  True if we have any lineup data for this fixture.

- **teamStatsUnavailableReason**  
  Set when we have team season rows but all stats are zero (e.g. API limit).

---

## Why “last-5” might be missing for Championship

- **Last-5** comes only from **TeamFixtureCache**. We query it with `league` in **last5LeagueKeys**.
- Cache rows are written with `league = cacheLeagueKey` (e.g. `"40"`) inside `ensureTeamSeasonStatsCornersAndCards`.
- So we only find last-5 if **last5LeagueKeys** contains `"40"` when the cache was stored under `"40"`.

That happens when:

- `fixture.leagueId === 40`, or  
- `LEAGUE_ID_MAP[fixture.league] === 40`, or  
- The name-based fallback adds `"40"` because the league name looks like English Championship.

If the **Fixture** row has:

- `leagueId = null`, and  
- `league` = a string that is **not** in `LEAGUE_ID_MAP` and doesn’t trigger the “Championship” name fallback,

then **last5LeagueKeys** never contains `"40"`, so the last-5 query returns no rows and **teamStatsLast5** is undefined.

**Practical check:** For a Championship fixture that has no last-5, look at that fixture row in the DB: what are `league` and `leagueId`? If `leagueId` is null, what exact string is in `league`? That string must either be in `LEAGUE_ID_MAP` or match the “Championship” name fallback for last-5 to appear.
