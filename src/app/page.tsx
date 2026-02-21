import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";

/** Returns a user-safe message and whether to show the config/setup hints. Internal errors (e.g. EPERM, Prisma) are never exposed. */
function getFixtureErrorDisplay(err: unknown): { message: string; showConfigHints: boolean } {
  const raw = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
  const isInternal =
    code === "EPERM" ||
    code === "EACCES" ||
    /chmod|query-engine|\.prisma|node_modules.*prisma|\/var\/task\//i.test(raw);
  if (isInternal) {
    return {
      message: "Something went wrong loading fixtures. Please try again in a moment.",
      showConfigHints: false,
    };
  }
  const isMissingLeagueId =
    typeof raw === "string" && raw.includes("leagueId") && raw.includes("does not exist");
  return {
    message: isMissingLeagueId ? raw : raw || "Could not load fixtures.",
    showConfigHints: true,
  };
}

export default async function Home() {
  try {
    const fixtures = await getOrRefreshTodayFixtures(new Date());
    return <TodayFixturesList fixtures={fixtures} showHero />;
  } catch (err) {
    const { message, showConfigHints } = getFixtureErrorDisplay(err);
    const isMissingLeagueId =
      typeof message === "string" && message.includes("leagueId") && message.includes("does not exist");
    console.error("[Home] Failed to load fixtures:", err);
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Could not load fixtures
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {message}
            </p>
            {showConfigHints && isMissingLeagueId ? (
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
            ) : showConfigHints ? (
              <ul className="mt-4 list-inside list-disc text-left text-sm text-amber-800 dark:text-amber-300">
                <li><strong>Local:</strong> In your <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">.env</code> file, set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>, <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_BASE_URL</code> and <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">FOOTBALL_API_KEY</code>. Use the direct Postgres URL (port 5432) or your pooler URL if you have one.</li>
                <li><strong>Vercel:</strong> Set the same env vars in Project → Settings → Environment Variables. Use the Supabase pooler (port 6543) and append <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">?pgbouncer=true</code> to <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code>.</li>
                <li>URL-encode the password in <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">DATABASE_URL</code> if it contains special characters.</li>
              </ul>
            ) : (
              <p className="mt-4 text-sm text-amber-800 dark:text-amber-300">
                If this keeps happening, check your deployment logs or try again later.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }
}
