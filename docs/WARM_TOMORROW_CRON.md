# Warm-Tomorrow Cron

The app runs a cron job at **5am UTC** daily to warm tomorrow's fixtures. All fixtures needing warming are processed in batches of 10. If there are more than 80 fixtures, the cron chains to itself (continuation) so every fixture gets warmed within the 60s per-invocation limit. This keeps player and team stats pre-loaded so the site is fast when users visit.

## Setup (one-time)

1. **Set `CRON_SECRET`** in Vercel:
   - Project → Settings → Environment Variables
   - Add `CRON_SECRET` with a random string (e.g. from 1Password, 16+ chars)
   - Apply to Production (and Preview if you want to test)

2. **If you use Deployment Protection**, create a Protection Bypass for Automation:
   - Project → Settings → Deployment Protection
   - Under "Protection Bypass for Automation", create a bypass
   - Vercel automatically injects `VERCEL_AUTOMATION_BYPASS_SECRET` – no manual env var needed
   - The cron and batch use this to bypass protection on internal fetches

3. **Ensure `warm-today` has run** before the cron:
   - The cron depends on `UpcomingFixture` being populated
   - Run `npm run warm-today` (without `--resume`) at least once to refresh the fixture list
   - Or add a separate cron for warm-today at 4am UTC if you want it fully automated

## How to check if it worked (next morning)

### 1. Vercel Cron Logs

1. Go to [Vercel Dashboard](https://vercel.com) → your project
2. **Settings** → **Cron Jobs** (in sidebar)
3. Find `warm-tomorrow` (path: `/api/warm-tomorrow/cron`)
4. Click **View Logs**
5. Look for today's run (5am–5:59am UTC):
   - **200** with `triggered: true` → cron ran and started warming
   - **200** with `triggered: false` → no fixtures needed warming (already done)
   - **401** → `CRON_SECRET` missing or wrong
   - **500** → check the error message in logs

### 2. Runtime Logs

1. Vercel Dashboard → **Logs** (sidebar)
2. Filter by path: `/api/warm-tomorrow`
3. Look for:
   - `[warm-tomorrow/cron]` – trigger ran
   - `[warm-tomorrow/batch]` – batch steps ran (home, away, teamstats, etc.)

### 3. Manual check: tomorrow's fixtures

1. Visit your site
2. Open the burger menu → **Tomorrow** (form table link) if it appears
3. Or go to `/fixtures/[tomorrow-date]` (e.g. `/fixtures/2025-03-04`)
4. Click a match – if stats load quickly, warming worked

### 4. API check

```bash
# See what would be warmed (no side effects)
curl "https://YOUR_SITE.vercel.app/api/warm-tomorrow"
```

- `fixtures: []` and "All tomorrow's fixtures already warmed" → already done
- `fixtures: [...]` → those would need warming (cron should have started them)

## Manual trigger (for testing)

To test the cron without waiting for 5am:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR_SITE.vercel.app/api/warm-tomorrow/cron"
```

Replace `YOUR_CRON_SECRET` with the value from Vercel env vars.

## If it didn't work

1. **No logs at 5am** – Cron may not have triggered. Check:
   - `vercel.json` has the cron config
   - Project is on Hobby (1x/day) or Pro (more frequent)
   - Deployment succeeded after adding `vercel.json`

2. **401 Unauthorized** – Set `CRON_SECRET` in Vercel env vars and redeploy.

3. **500 or partial warming** – Check runtime logs for errors. You can finish manually:
   ```bash
   BASE_URL=https://YOUR_SITE.vercel.app npm run warm-tomorrow
   ```

4. **"No fixtures for tomorrow"** – Run `npm run warm-today` (without `--resume`) to refresh `UpcomingFixture`, then the cron will have fixtures next day.

## Manual run (unchanged)

The existing script still works:

```bash
npm run warm-tomorrow
# or with your deployed URL:
BASE_URL=https://statsbuildr.com npm run warm-tomorrow
```

Use this to finish warming if the cron stopped partway, or to re-warm with `--force`.
