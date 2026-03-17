# Adding a new league (fixtures, upcoming, warm)

Goal: add one **API-Football league id** so its fixtures appear on **today**, **upcoming (14 days)**, **live**, and are **warmed** like everything else — including showing up as **tomorrow** after `warm-tomorrow`, then **today** on matchday.

---

## 1. Minimum checklist (copy when adding league `XXX`)

| Step | File / action |
|------|----------------|
| 1 | **`src/lib/leagues.ts`** → add `XXX` to **`BASE_REQUIRED_LEAGUE_IDS`** (this drives fixtures everywhere). |
| 2 | **`src/lib/leagues.ts`** → add **`LEAGUE_DISPLAY_NAMES[XXX]`** (e.g. `"Bundesliga"`). **Required** — build fails without it (`npm run validate-leagues`). |
| 3 | **`src/lib/leagues.ts`** → add **`LEAGUE_NAME_TO_ID`** entries for every API name variant (e.g. `"Bundesliga"`, `"1. Bundesliga"`). So `leagueId: null` responses still match. |
| 4 | **`src/lib/leagues.ts`** → add **`REQUIRED_LEAGUE_NAMES`** if the API uses a name not already in `LEAGUE_NAME_TO_ID`. (Names in `LEAGUE_NAME_TO_ID` are now auto-accepted.) |
| 5 | **`src/lib/leagues.ts`** → add **`LEAGUE_ORDER`** and **`LEAGUE_GROUP_ORDER`** (warnings if missing; lists order wrong until you do). |
| 6 | **`src/lib/footballApi.ts`** → add the same name → `XXX` mappings in **`leagueNameToId`** (fixture mapping when API omits id). |
| 7 | **`src/lib/statsService.ts`** → add any new **`LEAGUE_ID_MAP`** string keys if the API uses odd labels. |
| 8 | Run **`npm run validate-leagues`** (also runs automatically on **`npm run build`**). |
| 9 | Deploy, then **`curl "https://SITE/api/warm-today"`** (no `skipRefresh`) so **upcoming** refetches all 14 days with all leagues, then run your usual warm script + **`warm-tomorrow`** as needed. |

---

## 2. How it flows (no extra code per league)

| Area | Behaviour |
|------|-----------|
| **Upcoming** | `refreshUpcomingFixturesTable` (on **warm-today** / **warm-tomorrow**) refetches **every** of the next **14 days** and **every** league in **`REQUIRED_LEAGUE_IDS`**. New id in `BASE_REQUIRED_LEAGUE_IDS` → included on next full warm. |
| **Today** | `getOrRefreshTodayFixtures` loops **`REQUIRED_LEAGUE_IDS`** → new league’s games are stored on first fetch for that date. |
| **Warm-today** | Lists today’s fixtures filtered by **`isFixtureInRequiredLeagues`** → new league included. |
| **Warm-tomorrow** | Reads **`UpcomingFixture`** (filled above) → tomorrow’s games for the new league are warmed like others. |

So after you add the id + names and run **warm-today** once, the new competition is in **upcoming**; **warm-tomorrow** then covers the next day; on matchday it’s on **today** and in the warm list as normal.

---

## 3. Optional: standings, team pages, “League One style”

| Goal | Add to |
|------|--------|
| Standings + league crest + league market URLs | **`STANDINGS_LEAGUE_IDS`** (skip for cups with no table). |
| Full team pages, player stats, **/teams/all**, team markets | **`TOP_LEAGUE_IDS`**. |
| Team stats only (no player table) | **`LEAGUES_WITHOUT_PLAYER_STATS`**. |

Cups that use another league for stats (e.g. League Cup → EPL) → extend **`getStatsLeagueForFixture`** like Scottish Cup / English League Cup.

---

## 4. After deploy — run once

```bash
npm run validate-leagues   # locally before push

# Production (replace SITE)
curl "https://SITE/api/warm-today"          # refreshes upcoming + today; then run your fixture warm script
curl "https://SITE/api/warm-tomorrow"       # optional: tomorrow’s list
curl -X POST "https://SITE/api/teams/crests/refresh/teams"
```

If today was already cached without the new league: **`POST /api/fixtures/refresh`** (or clear today’s fixtures per your ops doc) then **warm-today** again.

---

## 5. Summary

- **Single source for “which fixtures we pull”:** **`BASE_REQUIRED_LEAGUE_IDS`** → **`REQUIRED_LEAGUE_IDS`**.
- **Build safety:** **`npm run validate-leagues`** ensures every required id has **`LEAGUE_DISPLAY_NAMES`**.
- **Name matching:** **`LEAGUE_NAME_TO_ID`** + **`isFixtureInRequiredLeagues`** (plus **`footballApi`** mapping) so API quirks don’t drop fixtures.
- **No per-league changes** to warm-today / warm-tomorrow / upcoming refresh logic — add config + run warm.
