import type { Metadata } from "next";
import { getOrRefreshTodayFixtures } from "@/lib/fixturesService";
import { todayDateKey } from "@/lib/slugs";
import { TodayFixturesList } from "@/app/_components/today-fixtures-list";

export const dynamic = "force-dynamic";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: dateParam } = await params;
  const dateKey = normalizeDateKey(dateParam);
  const displayDate = formatDisplayDate(dateKey);
  const title = `Football fixtures for ${displayDate} | Team & player stats`;
  const description = `View ${displayDate}'s football fixtures with team season stats, player data (goals, assists, xG, corners, cards) and match previews.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/fixtures/${dateKey}` },
    robots: { index: true, follow: true },
  };
}

export default async function FixturesDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await params;
  const now = new Date();
  const fixtures = await getOrRefreshTodayFixtures(now);
  const todayKey = todayDateKey();
  return <TodayFixturesList fixtures={fixtures} showHero todayKey={todayKey} />;
}
