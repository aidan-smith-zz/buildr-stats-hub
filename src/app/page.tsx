import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  let fixtures;
  try {
    // Using a supported date for free tier: 2026-02-12 to 2026-02-14
    fixtures = await getOrRefreshTodayFixtures(new Date("2026-02-13"));
  } catch (err) {
    console.error("[Home] Failed to load fixtures:", err);
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <header className="mb-10 text-center sm:mb-16">
            <h1 className="bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-neutral-50 dark:to-neutral-300 sm:text-5xl lg:text-6xl">
              Today&apos;s Fixtures
            </h1>
          </header>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Could not load fixtures
            </p>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              Check that DATABASE_URL and FOOTBALL_API_* env vars are set in Vercel, and that the database is reachable (use the Supabase pooler URL on port 6543).
            </p>
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
            Today&apos;s Fixtures
          </h1>
        </header>

        <TodayFixturesDashboard fixtures={fixtures} />
      </main>
    </div>
  );
}
