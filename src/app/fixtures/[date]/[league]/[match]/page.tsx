import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";

export const dynamic = "force-dynamic";

function findFixture(
  fixtures: FixtureSummary[],
  leagueSlug: string,
  matchSlugParam: string
): FixtureSummary | null {
  const filtered = fixtures.filter(
    (f) => f.leagueId != null && (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
  );
  return (
    filtered.find((f) => {
      const slug = leagueToSlug(f.league);
      const home = f.homeTeam.shortName ?? f.homeTeam.name;
      const away = f.awayTeam.shortName ?? f.awayTeam.name;
      const m = matchSlug(home, away);
      return slug === leagueSlug && m === matchSlugParam;
    }) ?? null
  );
}

export default async function FixtureMatchPage({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}) {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } = await params;
  const fixtures = await getOrRefreshTodayFixtures(new Date());
  const fixture = findFixture(fixtures, leagueSlug, matchSlugParam);

  if (!fixture) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="sr-only">
          {fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs{" "}
          {fixture.awayTeam.shortName ?? fixture.awayTeam.name} – stats
        </h1>
        <TodayFixturesDashboard
          fixtures={fixtures}
          initialSelectedId={String(fixture.id)}
          hideFixtureSelector
        />
        <section className="mt-12 border-t border-neutral-200 pt-10 dark:border-neutral-800">
          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-6 dark:border-violet-800/50 dark:bg-violet-950/20">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              New AI Insights
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              We scan today&apos;s fixtures and facts and surface the trends that matter.
            </p>
            <Link
              href={`/${dateKey}/ai/insights`}
              className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              See today&apos;s AI Insights →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
