# Adding a new league

When you add a new league (e.g. Bundesliga, Serie A), follow this checklist so fixtures, team pages, markets, standings, and warming all work. Have the **API-Football league ID** and the **league name(s)** the API returns before you start.

---

## 1. Why La Liga (or any new league) teams don’t show on /teams/all

/teams/all only lists teams that have **TeamSeasonStats** rows with `leagueId` in **TOP_LEAGUE_IDS**. Those rows are created when you **warm** fixture stats (each warmed fixture writes stats for its home/away teams). So for a new league:

- Add the league to config (see below).
- Run the **warm flow** so today’s (and optionally tomorrow’s) fixtures for that league get warmed. After that, those teams will have TeamSeasonStats and will appear on /teams/all and have team + market pages.

La Liga (140) is already in TOP_LEAGUE_IDS and LEAGUE_GROUP_ORDER; if its teams still don’t appear, run the warm commands at the end of this doc so their fixtures are warmed and TeamSeasonStats are created.

---

## 2. Config: `src/lib/leagues.ts`

Do all of the following for the new league ID (e.g. `123`):

| What | Action |
|------|--------|
| **BASE_REQUIRED_LEAGUE_IDS** | Add the ID so fixtures are fetched and shown on today/upcoming/live. |
| **STANDINGS_LEAGUE_IDS** | Add the ID only if the league has a standings table (e.g. for standings page + league crest). |
| **TOP_LEAGUE_IDS** | Add the ID so teams get **team pages** (`/teams/[slug]`), **market pages** (`/teams/[slug]/markets/...`), and appear on **/teams/all** once they have TeamSeasonStats. |
| **LEAGUES_WITHOUT_PLAYER_STATS** | Add the ID only if the league has **team stats only** (no player stats or lineups), e.g. some lower tiers. |
| **LEAGUE_ORDER** | Add the ID in the order you want (e.g. after Premier League). |
| **LEAGUE_GROUP_ORDER** | Add the ID in the same order (used for /teams/all and grouping). |
| **LEAGUE_DISPLAY_NAMES** | Add `[id]: "Display Name"` (e.g. `123: "Bundesliga"`). |
| **LEAGUE_NAME_TO_ID** | Add the display name and every **API name variant** (e.g. "Bundesliga", "German Bundesliga") so when the API omits `league.id`, we still store the correct ID. |
| **REQUIRED_LEAGUE_NAMES** | Add the display name (and any important variants) so fixtures with `leagueId: null` but matching name are still treated as required. |

Fixture persistence uses `resolveLeagueId()` and `getStatsLeagueForFixture()`, so once the league is in LEAGUE_DISPLAY_NAMES and LEAGUE_NAME_TO_ID, new fixtures will get the correct `leagueId`. No extra code in fixturesService is needed.

---

## 3. API mapping: `src/lib/footballApi.ts`

In the **leagueNameToId** (or equivalent) object used when mapping fixtures (e.g. in `fetchTodayFixtures`), add the same display name and API name variants → league ID so raw fixtures get the correct `leagueId` when the API only sends the name.

---

## 4. Warm commands (no per-league changes needed)

Warming already includes **all** leagues in **REQUIRED_LEAGUE_IDS**:

- **warm-today** (without `?skipRefresh=1`) uses fixtures from today filtered by `isFixtureInRequiredLeagues` and returns every fixture that needs warming (player/team stats). That includes any new league you added to REQUIRED_LEAGUE_IDS.
- **warm-tomorrow** materializes tomorrow (and optional extra days) from UpcomingFixture into Fixture; those rows come from the same REQUIRED_LEAGUE_IDS via `refreshUpcomingFixturesTable`.

So you do **not** need to change warm-today or warm-tomorrow when adding a league. Just add the league to the config above; the warm scripts will then include its fixtures and warm team/player stats for them. That populates TeamSeasonStats and (for TOP_LEAGUE_IDS) makes teams show on /teams/all and their team + market pages work.

---

## 5. After adding a new league: run these once

Run in this order (replace `https://YOUR_SITE` with your site URL):

```bash
# Clear today so next load refetches (and stores new league with correct leagueId)
curl -X POST https://YOUR_SITE/api/fixtures/refresh

# Refresh upcoming + today; today will refetch
curl "https://YOUR_SITE/api/warm-today"

# Materialize tomorrow (and optional extra days) from upcoming
curl "https://YOUR_SITE/api/warm-tomorrow"

# Warm fixture stats (so TeamSeasonStats exist and teams appear on /teams/all and have team/market pages)
# Your warm script should call GET /api/fixtures/{id}/stats for each fixture ID returned by warm-today.
# After that, refresh team crests:
curl -X POST "https://YOUR_SITE/api/teams/crests/refresh/teams"
```

If you use a script that calls warm-today and then warms each returned fixture ID via `/api/fixtures/[id]/stats`, run that script after the first three commands so the new league’s fixtures are warmed. Then run the crest refresh.

---

## 6. Summary

- **Fixtures (today/upcoming/live):** Add league to BASE_REQUIRED_LEAGUE_IDS (+ names in LEAGUE_NAME_TO_ID and REQUIRED_LEAGUE_NAMES). Warm commands already include it.
- **Team pages + markets + /teams/all:** Add league to TOP_LEAGUE_IDS and LEAGUE_GROUP_ORDER. Run the warm flow so TeamSeasonStats exist for that league’s teams.
- **Standings (if applicable):** Add league to STANDINGS_LEAGUE_IDS.
- **Warm:** No code changes to warm commands; add league to config and run the usual warm + crest refresh.
