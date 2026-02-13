import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Using a supported date for free tier: 2026-02-12 to 2026-02-14
  const fixtures = await getOrRefreshTodayFixtures(new Date('2026-02-13'));
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
