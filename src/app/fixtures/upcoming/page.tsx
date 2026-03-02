import type { Metadata } from "next";
import { getFixturesForDateFromDbOnly, getUpcomingFixturesFromDb } from "@/lib/fixturesService";
import { leagueToSlug, matchSlug } from "@/lib/slugs";
import type { FixtureSummary } from "@/lib/statsService";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";
import { Breadcrumbs } from "@/app/_components/breadcrumbs";
import { UpcomingFixturesList } from "./upcoming-fixtures-list";
import type { WarmedFixtureSnapshot } from "./upcoming-fixtures-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Upcoming fixtures | Next 14 days",
  description:
    "Fixture previews for the next 14 days. View match previews, team stats and AI-powered insights before kick-off.",
};

function toWarmedSnapshot(f: FixtureSummary): WarmedFixtureSnapshot {
  const date = f.date instanceof Date ? f.date.toISOString() : String(f.date);
  return {
    date,
    statusShort: f.statusShort ?? null,
    league: f.league ?? null,
    leagueId: f.leagueId ?? null,
    homeTeam: { name: f.homeTeam.name, shortName: f.homeTeam.shortName },
    awayTeam: { name: f.awayTeam.name, shortName: f.awayTeam.shortName },
  };
}

export default async function UpcomingPage() {
  const byDate = await getUpcomingFixturesFromDb();

  // Build a lookup of "warmed" fixtures (i.e. present in the main Fixture table with stats)
  // keyed by date + leagueSlug + matchSlug so we can show "View stats" and live badges.
  const warmedByKey = new Map<string, FixtureSummary>();
  await Promise.all(
    byDate.map(async ({ dateKey }) => {
      const warmed = await getFixturesForDateFromDbOnly(dateKey);
      for (const fixture of warmed) {
        const leagueSlug = leagueToSlug(fixture.league);
        const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
        const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
        const m = matchSlug(home, away);
        const key = `${dateKey}:${leagueSlug}:${m}`;
        if (!warmedByKey.has(key)) {
          warmedByKey.set(key, fixture);
        }
      }
    }),
  );

  const warmedByKeySerialized: Record<string, WarmedFixtureSnapshot> = {};
  for (const [k, v] of warmedByKey) {
    warmedByKeySerialized[k] = toWarmedSnapshot(v);
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8">
          <NavLinkWithOverlay
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back to today
          </NavLinkWithOverlay>
        </div>

        <Breadcrumbs
          items={[
            { href: "/", label: "Home" },
            { href: "/fixtures/upcoming", label: "Upcoming fixtures" },
          ]}
          className="mb-3"
        />

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
          Upcoming fixtures
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Next 14 days · Filter by league or team
        </p>

        <UpcomingFixturesList byDate={byDate} warmedByKey={warmedByKeySerialized} />
      </main>
    </div>
  );
}
