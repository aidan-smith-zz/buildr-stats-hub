import type { Metadata } from "next";
import {
  getFixturesForDateRequestCached,
  getOrRefreshTodayFixturesRequestCached,
} from "@/lib/fixturesService";
import { withPoolRetry } from "@/lib/poolRetry";
import { fixtureDateKey, todayDateKey, tomorrowDateKey } from "@/lib/slugs";
import { toSnippetDescription } from "@/lib/seoMetadata";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";
/** Allow more time for DB/API under load (avoids FUNCTION_INVOCATION_TIMEOUT). */
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://statsbuildr.com";

function normalizeDateKey(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + "T12:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return param;
  }
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

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
  const dateKey = normalizeDateKey(dateParam);
  const displayDate = formatDisplayDate(dateKey);
  const shortDate = formatShortDateChip(dateKey);
  const todayKey = todayDateKey();
  const tomorrowKey = tomorrowDateKey();
  const title =
    dateKey === todayKey
      ? `Football Fixtures Today (${shortDate}) — Schedule, Kick-Offs & Match Stats | statsBuildr`
      : dateKey === tomorrowKey
        ? `Football Fixtures Tomorrow (${shortDate}) — Schedule & Previews | statsBuildr`
        : `Football Fixtures ${shortDate} — Full Schedule & Match Previews | statsBuildr`;
  const description = toSnippetDescription([
    dateKey === todayKey
      ? `Today's football schedule (${displayDate}): kick-off times, fixtures list and match previews with team stats.`
      : dateKey === tomorrowKey
        ? `Tomorrow's football fixtures (${displayDate}): schedule, kick-offs and previews with goals, xG, corners and cards context.`
        : `Football fixtures on ${displayDate}: full schedule with kick-off times and previews (goals, xG, corners and cards).`,
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
  const dateKey = normalizeDateKey(dateParam);
  const todayKey = todayDateKey();

  // Today: behave like the homepage – show hero, today + tomorrow tabs.
  if (dateKey === todayKey) {
    const tomorrowKey = tomorrowDateKey();
    // Sequential to avoid holding 2 connections (prevents pooler "Unable to check out connection" timeout)
    const fixtures = await withPoolRetry(() => getOrRefreshTodayFixturesRequestCached(todayKey));
    const tomorrowFixtures = await withPoolRetry(() => getFixturesForDateRequestCached(tomorrowKey));
    const todayOnly = fixtures.filter((f) => fixtureDateKey(f.date) === todayKey);
    const tomorrowOnly = (tomorrowFixtures ?? []).filter((f) => fixtureDateKey(f.date) === tomorrowKey);
    const useLeagueGroupsForToday = todayOnly.length > 15;
    const useLeagueGroupsForTomorrow = tomorrowOnly.length > 15;
    return (
      <TodayFixturesList
        fixtures={fixtures}
        showHero
        todayKey={todayKey}
        tomorrowFixtures={tomorrowFixtures}
        tomorrowKey={tomorrowKey}
        useLeagueGroupsForToday={useLeagueGroupsForToday}
        useLeagueGroupsForTomorrow={useLeagueGroupsForTomorrow}
      />
    );
  }

  // Other dates: show fixtures for that specific date only (no hero, no tomorrow tab).
  const fixtures = await withPoolRetry(() => getFixturesForDateRequestCached(dateKey));
  return (
    <TodayFixturesList
      fixtures={fixtures}
      showHero={false}
      todayKey={dateKey}
    />
  );
}
