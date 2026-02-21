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
  const { league: leagueSlug, match: matchSlugParam } = await params;
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
      </main>
    </div>
  );
}
