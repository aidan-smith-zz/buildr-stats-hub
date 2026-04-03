import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getFixturesForDateRequestCached,
  getOrRefreshTodayFixturesRequestCached,
} from "@/lib/fixturesService";
import { withPoolRetry } from "@/lib/poolRetry";
import {
  fixtureDateKey,
  resolveTodayTomorrowDateParam,
  todayDateKey,
  tomorrowDateKey,
} from "@/lib/slugs";
import { toSnippetDescription } from "@/lib/seoMetadata";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";
import { isFixtureInRequiredLeagues } from "@/lib/leagues";

export const dynamic = "force-dynamic";
/** Allow more time for DB/API under load (avoids FUNCTION_INVOCATION_TIMEOUT). */
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

function formatDisplayDate(dateKey: string): string {
  return new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDateChip(dateKey: string): string {
  return new Date(dateKey + "T12:00:00.000Z").toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: dateParam } = await params;
  const dateKey = resolveTodayTomorrowDateParam(dateParam);
  if (!dateKey) notFound();
  const displayDate = formatDisplayDate(dateKey);
  const shortDate = formatShortDateChip(dateKey);
  const todayKey = todayDateKey();
  const title =
    dateKey === todayKey
      ? `Football Fixtures Today (${shortDate}) — Schedule, Kick-Offs & Match Stats | statsBuildr`
      : `Football Fixtures Tomorrow (${shortDate}) — Schedule & Previews | statsBuildr`;
  const description = toSnippetDescription([
    dateKey === todayKey
      ? `Today's football schedule (${displayDate}): kick-off times, fixtures list and match previews with team stats.`
      : `Tomorrow's football fixtures (${displayDate}): schedule, kick-offs and previews with goals, xG, corners and cards context.`,
    "Built for quick scanning before you bet.",
  ]);
  const canonical = `${BASE_URL}/fixtures/${dateKey}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "statsBuildr",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/stats-buildr.png`,
          width: 512,
          height: 160,
          alt: `Football fixtures schedule for ${shortDate} on statsBuildr`,
        },
      ],
      locale: "en_GB",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/stats-buildr.png`],
    },
  };
}

export default async function FixturesDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date: dateParam } = await params;
  const dateKey = resolveTodayTomorrowDateParam(dateParam);
  if (!dateKey) notFound();
  const todayKey = todayDateKey();
  const tomorrowKeyResolved = tomorrowDateKey();

  // Today: behave like the homepage – show hero, today + tomorrow tabs.
  if (dateKey === todayKey) {
    // Sequential to avoid holding 2 connections (prevents pooler "Unable to check out connection" timeout)
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixturesRequestCached(todayKey));
    const tomorrowFixtures = await withPoolRetry(() => getFixturesForDateRequestCached(tomorrowKeyResolved));
    const todayOnly = fixtures.filter((f) => fixtureDateKey(f.date) === todayKey);
    const tomorrowOnly = (tomorrowFixtures ?? []).filter((f) => fixtureDateKey(f.date) === tomorrowKeyResolved);
    const todayVisible = todayOnly.filter((f) =>
      isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
    );
    const tomorrowVisible = tomorrowOnly.filter((f) =>
      isFixtureInRequiredLeagues({ leagueId: f.leagueId ?? null, league: f.league }),
    );
    const useLeagueGroupsForToday = todayVisible.length > 15;
    const useLeagueGroupsForTomorrow = tomorrowVisible.length > 15;
    return (
      <TodayFixturesList
        fixtures={fixtures}
        showHero
        todayKey={todayKey}
        tomorrowFixtures={tomorrowFixtures}
        tomorrowKey={tomorrowKeyResolved}
        useLeagueGroupsForToday={useLeagueGroupsForToday}
        useLeagueGroupsForTomorrow={useLeagueGroupsForTomorrow}
      />
    );
  }

  // Tomorrow (`/fixtures/tomorrow` or tomorrow's YYYY-MM-DD): single-date list (no hero, no second tab).
  const fixtures = await withPoolRetry(() => getFixturesForDateRequestCached(dateKey));
  return (
    <TodayFixturesList
      fixtures={fixtures}
      showHero={false}
      todayKey={dateKey}
    />
  );
}
