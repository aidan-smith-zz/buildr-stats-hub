import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getFixturePreview,
  getFixturesForDatePreview,
  getOrRefreshTodayFixtures,
} from "@/lib/fixturesService";
import { leagueToSlug, matchSlug, todayDateKey } from "@/lib/slugs";
import type { RawFixture } from "@/lib/footballApi";
import type { FixtureSummary } from "@/lib/statsService";
import { REQUIRED_LEAGUE_IDS } from "@/lib/leagues";
import { TodayFixturesDashboard } from "@/app/_components/today-fixtures-dashboard";
import { NavLinkWithOverlay } from "@/app/_components/fixture-row-link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";
const FIXTURES_TIMEZONE = "Europe/London";

function findTodayFixture(
  fixtures: FixtureSummary[],
  leagueSlug: string,
  matchSlugParam: string
): FixtureSummary | null {
  const filtered = fixtures.filter(
    (f) =>
      f.leagueId != null &&
      (REQUIRED_LEAGUE_IDS as readonly number[]).includes(f.leagueId)
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

export const dynamicParams = true;

function formatKickoff(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    return d.toLocaleTimeString("en-GB", {
      timeZone: FIXTURES_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDisplayDate(dateKey: string): string {
  try {
    const d = new Date(dateKey + "T12:00:00.000Z");
    return d.toLocaleDateString("en-GB", {
      timeZone: FIXTURES_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateKey;
  }
}

function getYear(dateKey: string): string {
  return dateKey.slice(0, 4);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}): Promise<Metadata> {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } =
    await params;

  if (dateKey === todayDateKey()) {
    const fixtures = await getOrRefreshTodayFixtures(new Date());
    const fixture = findTodayFixture(fixtures, leagueSlug, matchSlugParam);
    if (!fixture) {
      return { title: "Fixture not found", robots: { index: true, follow: true } };
    }
    const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
    const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
    const league = fixture.league ?? "Football";
    const year = getYear(dateKey);
    const title = `${home} vs ${away} Preview, Stats & AI Insights | ${league} ${year}`;
    const description = `Preview for ${home} vs ${away} including upcoming team stats, player performance data and AI-powered football insights.`;
    const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
    return {
      title,
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
    };
  }

  const fixture = await getFixturePreview(dateKey, leagueSlug, matchSlugParam);
  if (!fixture) {
    return {
      title: "Fixture not found",
      description: "No fixtures scheduled for this date.",
      robots: { index: true, follow: true },
    };
  }

  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "Football";
  const year = getYear(dateKey);
  const title = `${home} vs ${away} Preview, Stats & AI Insights | ${league} ${year}`;
  const description = `Preview for ${home} vs ${away} including upcoming team stats, player performance data and AI-powered football insights.`;
  const canonical = `${BASE_URL}/fixtures/${dateKey}/${leagueSlug}/${matchSlugParam}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function FixtureMatchPage({
  params,
}: {
  params: Promise<{ date: string; league: string; match: string }>;
}) {
  const { date: dateKey, league: leagueSlug, match: matchSlugParam } =
    await params;

  // Today: full flow (dashboard, redirect if not found)
  if (dateKey === todayDateKey()) {
    const fixtures = await getOrRefreshTodayFixtures(new Date());
    const fixture = findTodayFixture(fixtures, leagueSlug, matchSlugParam);
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
                We scan today&apos;s fixtures & stats then we surface the trends
                that matter
              </p>
              <NavLinkWithOverlay
                href={`/${dateKey}/ai/insights`}
                className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
                message="Loading insights…"
                italic={false}
              >
                See today&apos;s AI Insights →
              </NavLinkWithOverlay>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Tomorrow onwards: preview only (no stats)
  const fixture = await getFixturePreview(dateKey, leagueSlug, matchSlugParam);

  if (!fixture) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-center text-neutral-600 dark:text-neutral-400">
            No fixtures scheduled for this date.
          </p>
          <div className="mt-6 flex justify-center">
            <NavLinkWithOverlay
              href="/"
              className="text-sm font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
            >
              ← Back to fixtures
            </NavLinkWithOverlay>
          </div>
        </main>
      </div>
    );
  }

  return (
    <FixturePreviewContent fixture={fixture} dateKey={dateKey} />
  );
}

function FixturePreviewContent({
  fixture,
  dateKey,
}: {
  fixture: RawFixture;
  dateKey: string;
}) {
  const home = fixture.homeTeam.shortName ?? fixture.homeTeam.name;
  const away = fixture.awayTeam.shortName ?? fixture.awayTeam.name;
  const league = fixture.league ?? "League";
  const kickoff = formatKickoff(fixture.date);
  const displayDate = formatDisplayDate(dateKey);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-8">
          <NavLinkWithOverlay
            href="/"
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            ← Back to fixtures
          </NavLinkWithOverlay>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
          {home} vs {away} Preview – {league} ({displayDate})
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          {kickoff && `Kick-off ${kickoff}`}
          {kickoff && " · "}
          {league}
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Match Preview
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            <p>
              {home} take on {away} in the {league} on {displayDate}. This match
              preview includes upcoming team statistics, player performance data
              and AI-powered betting insights ahead of kick-off.
            </p>
            <p>
              Historical trends such as goals scored and conceded, average
              corners, cards per match and shots per 90 will be analysed as the
              fixture approaches. Confirmed starting lineups, live score updates
              and in-play match statistics will also be available once the game
              begins.
            </p>
            <p>
              Explore data-driven insights for {home} vs {away} and uncover key
              performance trends before placing any bet builder selections.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            What To Expect
          </h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            <li>Player season statistics</li>
            <li>Team season / last 5 matches statistics</li>
            <li>AI-powered match insights (available before kick-off)</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
