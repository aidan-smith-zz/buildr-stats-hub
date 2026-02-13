# Deploy Football Stats App to Vercel (Free Tier)

## Prerequisites

- Node.js 18+
- A [Vercel](https://vercel.com) account
- A **hosted Postgres database** (free options below)
- An [API-Football](https://www.api-football.com/) API key (free tier)

---

## 1. Hosted Postgres (free tier)

Pick one and create a database:

- **[Supabase](https://supabase.com)** – Free tier, 500 MB. Create project → Settings → Database → copy “Connection string” (URI).
- **[Neon](https://neon.tech)** – Free tier. Create project → copy connection string.
- **[Vercel Postgres](https://vercel.com/storage/postgres)** – Create from Vercel dashboard if you prefer.

Use the **direct** connection string (not the pooler) for `DATABASE_URL` unless you hit connection limits.

---

## 2. Prepare the app

From the project root:

```bash
cd /path/to/football-stats-app
npm install
```

Apply migrations against your **production** database (use the same URL you will set in Vercel):

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
npx prisma migrate deploy
```

Confirm the build works:

```bash
npm run build
```

---

## 3. Deploy to Vercel

### Option A: Vercel Dashboard (recommended)

1. Go to [vercel.com](https://vercel.com) and sign in.
2. **Add New** → **Project**.
3. Import your Git repo (GitHub/GitLab/Bitbucket) and select the `football-stats-app` root.
4. **Environment Variables** – add these (same names, no typos):

   | Name                   | Value                                      | Environments   |
   |------------------------|--------------------------------------------|----------------|
   | `DATABASE_URL`         | `postgresql://USER:PASSWORD@HOST:5432/DB...` | Production, Preview |
   | `FOOTBALL_API_BASE_URL` | `https://v3.football.api-sports.io`      | Production, Preview |
   | `FOOTBALL_API_KEY`    | Your API-Football key                      | Production, Preview |

5. Leave **Build Command** as `npm run build` (or `prisma generate && next build`).
6. Leave **Output Directory** empty (Next.js default).
7. Click **Deploy**.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

When prompted, link to your repo or current directory. Then add env vars:

```bash
vercel env add DATABASE_URL
vercel env add FOOTBALL_API_BASE_URL
vercel env add FOOTBALL_API_KEY
```

Redeploy so the new env vars are used:

```bash
vercel --prod
```

---

## 4. Environment variables (summary)

Set these in Vercel (Project → Settings → Environment Variables):

| Variable                | Required | Example / note |
|-------------------------|----------|----------------|
| `DATABASE_URL`          | Yes      | Full Postgres URL from Supabase/Neon/Vercel Postgres |
| `FOOTBALL_API_BASE_URL` | Yes      | `https://v3.football.api-sports.io` |
| `FOOTBALL_API_KEY`      | Yes      | From [api-football.com](https://dashboard.api-football.com/) |

No other env vars are required for a basic deployment.

---

## 5. Run migrations in production

After the first deploy, ensure the production DB has the latest schema.

**One-off (from your machine):**

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Use the **same** `DATABASE_URL` as in Vercel (production DB).

**Or from Vercel:**  
You can run a custom script in a one-off job (e.g. “Run Command” or a deploy hook that runs `prisma migrate deploy`) if your team uses that. For most setups, running `prisma migrate deploy` locally once with the prod URL is enough.

---

## 6. Redeploy after changes

- **Git:** Push to the branch connected to Vercel; Vercel will build and deploy automatically.
- **CLI:** From the project root run `vercel --prod` to deploy the current state.

---

## 7. Troubleshooting

- **Build fails with “Cannot find module 'prisma/config'”**  
  `prisma.config.ts` is excluded from the TypeScript build via `tsconfig.json`. If you added new top-level `.ts` files, ensure they are not pulling in Prisma CLI-only modules.

- **“PrismaClient is unable to run in the browser”**  
  All Prisma usage is in server code (API routes, server components, `server-only` modules). Do not import `prisma` or `PrismaClient` in client components.

- **DB connection errors in production**  
  - Check `DATABASE_URL` in Vercel (no extra spaces, correct encoding for special chars in the password).  
  - If you hit connection limits, switch to a **connection pooler** URL (e.g. Supabase “Transaction” pooler or Neon pooler) and use that as `DATABASE_URL`.

- **Migrations out of sync**  
  Run `npx prisma migrate deploy` with the production `DATABASE_URL` and redeploy the app.

- **Supabase: “bad certificate” or TLS errors**  
  In Supabase, use the **URI** from “Connection string” and ensure the password is URL-encoded. If issues persist, try appending `?sslmode=require` to `DATABASE_URL`. For connection pooling (optional), use the “Transaction” pooler URL as `DATABASE_URL` instead of the direct URI.
