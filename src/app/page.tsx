import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  let fixtures;
  try {
    fixtures = await getOrRefreshTodayFixtures(new Date());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isMissingLeagueId =
      typeof message === "string" && message.includes("leagueId") && message.includes("does not exist");
    console.error("[Home] Failed to load fixtures:", err);
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="mb-10 text-center sm:mb-16">
  <h1 className="bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-neutral-50 dark:to-neutral-300 sm:text-5xl lg:text-6xl">
    The Builder Room
  </h1>

  <h2 className="mt-3 bg-gradient-to-r from-neutral-700 to-neutral-500 bg-clip-text text-lg italic tracking-wide text-transparent dark:from-neutral-300 dark:to-neutral-400 sm:text-xl">
    your data-driven approach
  </h2>
</header>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Could not load fixtures
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {message}
            </p>
            {isMissingLeagueId ? (
              <div className="mt-4 rounded border border-amber-300 bg-amber-100/50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                  Fix: add the missing column in your database
                </p>
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  In Supabase: SQL Editor → New query → paste and run:
                </p>
                <pre className="overflow-x-auto rounded bg-amber-200/80 p-3 text-left text-xs dark:bg-amber-900/40">
                  {`ALTER TABLE "Fixture" ADD COLUMN IF NOT EXISTS "leagueId" INTEGER;`}
                </pre>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Then refresh this page.
                </p>
              </div>
            ) : (
              <ul className="mt-4 list-inside list-disc text-left text-sm text-amber-800 dark:text-amber-300">
                <li><strong>Local:</strong> In your <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">.env</code> file, set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>, <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_BASE_URL</code> and <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_KEY</code>. Use the direct Postgres URL (port 5432) or your pooler URL if you have one.</li>
                <li><strong>Vercel:</strong> Set the same env vars in Project → Settings → Environment Variables. Use the Supabase pooler (port 6543) and append <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">?pgbouncer=true</code> to <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>.</li>
                <li>URL-encode the password in <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code> if it contains special characters.</li>
              </ul>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="mb-10 text-center sm:mb-16">
  <h1 className="bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-neutral-50 dark:to-neutral-300 sm:text-5xl lg:text-6xl">
    The Builder Room
  </h1>

  <h2 className="mt-3 bg-gradient-to-r from-neutral-700 to-neutral-500 bg-clip-text text-lg italic tracking-wide text-transparent dark:from-neutral-300 dark:to-neutral-400 sm:text-xl">
    your data-driven picks for today's fixtures
  </h2>
</header>

        <TodayFixturesDashboard fixtures={fixtures} />
      </main>
    </div>
  );
}
