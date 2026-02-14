# Switching to real player data (API upgrade)

The app can show **mock player data** when the API returns no players (common on the free plan). After you upgrade your API-Football plan, follow these steps to use **real player statistics** only.

---

## 1. Upgrade your API-Football plan

- Go to [API-Football dashboard](https://dashboard.api-football.com/) and upgrade so that the **Players** (and optionally **Fixtures → Players**) endpoints return real data for your leagues.
- Keep using the same `FOOTBALL_API_BASE_URL` and `FOOTBALL_API_KEY`; no code change required for the API URL.

---

## 2. Disable the mock player fallback

Set this in your environment (e.g. Vercel **Project → Settings → Environment Variables**, or in `.env` / `.env.local` locally):

```bash
USE_MOCK_PLAYERS_FALLBACK=false
```

- **Default (unset or `true`):** If the API returns no players, the app shows mock players so the UI is usable.
- **`false`:** Only real data from the API is shown. If the API returns no players, you’ll see “No player statistics available” until data is fetched.

---

## 3. Clear cached player stats so data is refetched

The app caches player season stats per team/season/league in the database. To force a refetch with your upgraded API:

**Option A – Clear all player stats (recommended once after upgrade)**

Run against your **production** `DATABASE_URL` (same as in Vercel):

```bash
# From project root, with DATABASE_URL set
npx prisma db execute --stdin <<SQL
DELETE FROM "PlayerSeasonStats";
SQL
```

**Option B – Clear only for a specific fixture’s teams**

If you use the Prisma Studio or SQL editor, delete rows from `PlayerSeasonStats` for the teams you want to refetch. The next time someone loads that fixture’s stats, the app will call the API again and store the new data.

---

## 4. Redeploy (if you use Vercel)

After adding `USE_MOCK_PLAYERS_FALLBACK=false` in Vercel:

- Trigger a new deployment (e.g. push a commit, or **Deployments → … → Redeploy**).

---

## 5. Verify

1. Open a fixture that has real player data on the upgraded plan.
2. Confirm you see real player names and stats (no “Mock Player One”, etc.).
3. If you still see mock data, ensure `USE_MOCK_PLAYERS_FALLBACK=false` is set and you’ve cleared cached player stats (step 3).

---

## Summary

| Step | Action |
|------|--------|
| 1 | Upgrade API-Football plan so Players endpoint returns data |
| 2 | Set `USE_MOCK_PLAYERS_FALLBACK=false` in env |
| 3 | Delete cached rows from `PlayerSeasonStats` (or full table) so stats are refetched |
| 4 | Redeploy (e.g. Vercel) |
| 5 | Load a fixture and confirm real players appear |

No code changes are required beyond the env var; the same `/players` API and `fetchPlayerSeasonStatsByTeam` flow will return and store real data once the plan supports it.
